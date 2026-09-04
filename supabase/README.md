# Supabase SQL Guide

## Main Setup File

Use [setup_complete.sql](D:/Program/BOQ/supabase/setup_complete.sql) as the source of truth for a fresh Supabase project.

It includes:

- MAT tables
- Supplier and price tables
- BOQ tables
- Customer tables
- Attachment and comment tables
- BOQ template tables
- BOM template tables
- Dashboard function
- Latest price view
- Production RLS policies
- Storage bucket and policies for `boq-attachments`
- PostgREST schema cache reload

For an existing database, run [rls_policies.sql](D:/Program/BOQ/supabase/rls_policies.sql) to enable or refresh RLS without recreating tables.

## Optional Seed

Run [seed.sql](D:/Program/BOQ/supabase/seed.sql) only when sample data is needed.

Run [seed_uom_full.sql](D:/Program/BOQ/supabase/seed_uom_full.sql) when the project needs the full standard UOM list.

## Reference Files

These files are kept as module references and historical split scripts:

- [schema.sql](D:/Program/BOQ/supabase/schema.sql)
- [boq_schema.sql](D:/Program/BOQ/supabase/boq_schema.sql)
- [bom_schema.sql](D:/Program/BOQ/supabase/bom_schema.sql)
- [customer_schema.sql](D:/Program/BOQ/supabase/customer_schema.sql)
- [attachments_schema.sql](D:/Program/BOQ/supabase/attachments_schema.sql)
- [comments_schema.sql](D:/Program/BOQ/supabase/comments_schema.sql)
- [templates_schema.sql](D:/Program/BOQ/supabase/templates_schema.sql)
- [views.sql](D:/Program/BOQ/supabase/views.sql)
- [setup_all.sql](D:/Program/BOQ/supabase/setup_all.sql)

## Standard Run Order

```text
1. setup_complete.sql
2. rls_policies.sql, only when updating an existing database
3. seed_uom_full.sql, recommended
4. seed.sql, optional sample data
5. NOTIFY pgrst, 'reload schema'; if Supabase schema cache is stale
```

## Schema Lock and Current Application Order

Before deploying the current application, run [schema_audit.sql](D:/Program/BOQ/supabase/schema_audit.sql) in the Supabase SQL Editor and confirm that every required object and column is present. The audit is read-only and returns a `public_schema_signature` that should be saved with the deployment record.

For a fresh database using the current application, apply the additive SQL in this order:

```text
1. supabase/setup_complete.sql
2. supabase/migrations/20260504_production_core_hardening.sql
3. sql/phase2a_material_master_hardening.sql
4. sql/phase2a9_core_foundation_hardening.sql
5. sql/phase2a10_material_code_standard_v1.sql
6. sql/phase2a11_material_duplicate_detection.sql
7. sql/phase2a11_material_duplicate_detection_rls_fix.sql
8. sql/phase2a12_material_types_rls_fix.sql
9. sql/phase2a12_seed_material_types_workshop.sql, optional seed
10. sql/phase2a12_material_types_thai_labels.sql
11. sql/phase2a12_material_master_performance_indexes.sql
12. sql/phase2a13_material_master_bottleneck_indexes.sql
13. sql/phase2a14_material_latest_price_view_performance.sql
14. sql/phase2b_receipt_import_v1.sql, when Receipt Import is enabled
15. sql/phase2b2_receipt_ai_gemini.sql, when Receipt AI/OCR is enabled
16. sql/phase2b4_receipt_bulk_post_ready_items.sql, when receipt posting is enabled
17. sql/phase2b5_receipt_material_candidates.sql, when candidate review is enabled
18. sql/phase2b7_material_code_rpc_rls_fix.sql
19. sql/phase2b8_receipt_candidate_atomic_approval_and_repair.sql
20. supabase/migrations/20260824_material_delete_atomic.sql
21. supabase/migrations/20260824_material_list_query_rpc.sql
22. supabase/migrations/20260902_material_list_page_payload.sql
23. supabase/migrations/20260903_receipt_duplicate_detection.sql
24. supabase/migrations/202609040001_receipt_supplier_material_scope.sql
25. Deploy the receipt supplier-scope application
26. supabase/migrations/202609040002_receipt_supplier_material_scope_enforce.sql
27. Run supabase/schema_audit.sql again
```

Do not combine this path with `sql/phase1_single_user_production.sql` or `sql/phase1_single_user_production_core_only.sql`; those are alternative historical hardening paths. Keep the database password out of the repository. `supabase db query --linked` uses authenticated Management API access, or the audit can be pasted into the Supabase SQL Editor.

## Receipt supplier-scoped material release — 2026-09-04

รหัสวัสดุกลางยังคงเดิม ร้านต่างกันใช้วัสดุเดียวกันได้ แต่ต้องมีความสัมพันธ์วัสดุ–ร้านที่ยืนยันแล้วก่อนบันทึกราคา

- Foundation: [202609040001_receipt_supplier_material_scope.sql](D:/Program/BOQ/supabase/migrations/202609040001_receipt_supplier_material_scope.sql)
- Enforcement: [202609040002_receipt_supplier_material_scope_enforce.sql](D:/Program/BOQ/supabase/migrations/202609040002_receipt_supplier_material_scope_enforce.sql)
- ใช้ร่วมกับ source ที่เรียก `update_receipt_item_scoped` และ `approve_receipt_material_candidate_scoped` เท่านั้น
- Build deployment ให้พร้อมด้วย `vercel deploy --prod --skip-domain` ก่อนเปลี่ยนฐานข้อมูล จากนั้นรัน foundation (ยังรองรับการเลือกวัสดุ/อนุมัติของ source เก่า), promote source ใหม่ และรัน enforcement ทันที ห้ามเปิด enforcement ก่อน source ใหม่พร้อม
- ไม่รัน SQL ตั้งต้นหรือ seed ซ้ำ และไม่ย้อน migration เก่าทั้งชุด
- สลิปเก่าที่ยังไม่บันทึกราคาจะไม่มี `material_supplier_id` โดยตั้งใจ ต้องกดเปลี่ยนและเลือกวัสดุใหม่เพื่อยืนยันร้าน ไม่เติมค่านี้ย้อนหลังเอง
- Enforcement เปลี่ยนเฉพาะสถานะรายการเก่าที่เคยพร้อมอัปเดตราคาแต่ไม่มีการยืนยันร้านเป็น `needs_review` เพื่อไม่ขวางการบันทึกรายการอื่นที่พร้อมแล้ว ชื่อ จำนวน ราคา หน่วย และวัสดุเดิมยังอยู่ครบ
- สลิป/รายการที่บันทึกราคาแล้วไม่ได้ถูกแก้ไขย้อนหลัง หากมีรายการที่บันทึกแล้วจะเปลี่ยนร้านของสลิปนั้นไม่ได้
- เปลี่ยนร้านจะล้างการเลือกวัสดุและให้ตรวจใหม่ แต่เก็บชื่อจากเอกสาร จำนวน ราคา หน่วย และ Draft วัสดุไว้
- ถ้าเคยสร้างวัสดุจาก Draft แล้วเปลี่ยนร้าน ให้ค้นหาวัสดุเดิมในคลังกลางและยืนยันผูกกับร้านใหม่ ไม่สร้างวัสดุซ้ำ
- หลังรัน ให้ตรวจ `schema_audit.sql`: ไม่ควรมี `present=false` ในกลุ่ม `receipt-supplier-scope` และเก็บ `public_schema_signature` ใหม่
- ทดสอบร้าน A/B: ค้นหาเฉพาะร้าน, ยืนยัน/ยกเลิกผูกคลังกลาง, เปลี่ยนร้าน, เปิดสองแท็บแล้วลองบันทึกแท็บเก่า และตรวจราคาว่าลงถูก supplier
- ถ้า build หรือ foundation ล้มเหลว ให้คง Production เดิม; ถ้า promote ล้มเหลว ห้ามรัน enforcement และ source เดิมยังเลือกวัสดุ/อนุมัติได้ หลัง enforcement ห้าม rollback เฉพาะ source เพราะสัญญา RPC เปลี่ยน ต้องทบทวน release ทั้งคู่ก่อน

ชุดทดสอบไม่แตะ Supabase จริง:

```powershell
npm run smoke:receipt-material-match
npm run smoke:receipt-supplier-match
npm run smoke:receipt-supplier-create
npm run smoke:receipt-calculations
npm run smoke:receipt-material-scope-db
npm run smoke:receipt-material-scope-browser
```

สองคำสั่งสุดท้ายใช้ `@electric-sql/pglite`, `esbuild`, `playwright` ที่ติดตั้งแยกจาก dependency ของเว็บได้ โดยตั้ง `PGLITE_MODULE`, `ESBUILD_MODULE`, `PLAYWRIGHT_MODULE` เป็น absolute path ของ entry point ของแต่ละ package ตามคำอธิบายใน scripts; browser test ใช้ Edge แบบ headless เป็นค่าเริ่มต้น ปิดการออกอินเทอร์เน็ต และจำลอง HTTP API เฉพาะ localhost ส่วน DB test ใช้ PostgreSQL ในหน่วยความจำ โหลด schema, approval, repair และ posting SQL จริง ตรวจผลใน `mat_price_base` โดยไม่มี stub ของ RPC เหล่านี้ แต่ยังไม่ได้แทนการตรวจ multi-session หรือ auth/RLS บน Supabase

## RLS Policy Baseline

- `anon` has no direct table access.
- `authenticated` can select, insert, and update app tables.
- Hard table `DELETE` is not granted; use soft delete columns in the app.
- `mat_audit_log` allows select and insert only.
- `service_role` still bypasses RLS for server-only integrations such as LINE lookup.
