import { Header } from '@/components/layout/Header'
import { BomTemplateForm } from '@/components/bom/BomTemplateForm'

export default function NewBomPage() {
  return (
    <div>
      <Header title="สร้าง BOM ใหม่" subtitle="กำหนดสูตรงานและรายการวัสดุ/แรงงาน" />
      <div className="mx-auto max-w-4xl">
        <BomTemplateForm mode="create" />
      </div>
    </div>
  )
}
