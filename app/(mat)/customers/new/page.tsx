import { Header } from '@/components/layout/Header'
import { CustomerForm } from '@/components/customer/CustomerForm'

export const dynamic = 'force-dynamic'

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="เพิ่มลูกค้า" subtitle="สร้างข้อมูลลูกค้าใหม่" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl">
          <CustomerForm />
        </div>
      </div>
    </div>
  )
}
