import { Header } from '@/components/layout/Header'
import { BoqForm } from '@/components/boq/BoqForm'

export default function NewBoqPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="สร้าง BOQ ใหม่" />
      <div className="flex-1 overflow-auto px-6 py-6 max-w-2xl">
        <BoqForm />
      </div>
    </div>
  )
}
