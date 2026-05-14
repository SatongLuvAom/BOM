import { Header } from '@/components/layout/Header'
import { MaterialForm } from '@/components/mat/MaterialForm'
import { getCachedActiveCategories, getCachedActiveMaterialTypes, getCachedActiveUoms } from '@/lib/server/master-data-cache'

export default async function NewMaterialPage() {
  const [categories, uoms, materialTypes] = await Promise.all([
    getCachedActiveCategories(),
    getCachedActiveUoms(),
    getCachedActiveMaterialTypes(),
  ])

  return (
    <div>
      <Header title="เพิ่มวัสดุใหม่" subtitle="เพิ่มข้อมูลวัสดุเข้าสู่ Material Master" />
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <section className="rounded-xl border border-cyan-100 bg-cyan-50/80 px-4 py-4 text-sm text-slate-700 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">ก่อนเพิ่มวัสดุใหม่</h2>
          <ul className="mt-3 grid gap-2 leading-6">
            <li>ค้นหาวัสดุเดิมก่อนเพิ่มใหม่ เพื่อลดการสร้างรายการซ้ำ</li>
            <li>ระบบจะสร้างรหัสวัสดุให้อัตโนมัติจากหมวดหมู่ ชื่ออังกฤษ และสเปก</li>
            <li>รหัสที่เห็นในฟอร์มเป็นตัวอย่าง รหัสจริงจะถูกสร้างตอนกดบันทึก</li>
            <li>หลังสร้างแล้ว รหัสวัสดุจะถูกล็อกเพื่อป้องกัน BOM / BOQ เดิมเสียความสัมพันธ์</li>
          </ul>
        </section>
        <MaterialForm
          mode="create"
          categories={categories}
          uoms={uoms}
          materialTypes={materialTypes}
        />
      </div>
    </div>
  )
}
