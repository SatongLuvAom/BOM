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
      <Header title="เพิ่มวัสดุใหม่" subtitle="กรอกข้อมูลวัสดุ" />
      <div className="mx-auto max-w-2xl">
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
