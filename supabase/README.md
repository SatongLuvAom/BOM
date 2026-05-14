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

## RLS Policy Baseline

- `anon` has no direct table access.
- `authenticated` can select, insert, and update app tables.
- Hard table `DELETE` is not granted; use soft delete columns in the app.
- `mat_audit_log` allows select and insert only.
- `service_role` still bypasses RLS for server-only integrations such as LINE lookup.
