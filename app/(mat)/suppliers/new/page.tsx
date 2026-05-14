import { Header } from '@/components/layout/Header'
import { SupplierForm } from '@/components/mat/SupplierForm'

export default function NewSupplierPage() {
  return (
    <div>
      <Header title="Add Supplier" subtitle="Create a new supplier master record" />
      <div className="mx-auto max-w-3xl">
        <SupplierForm mode="create" />
      </div>
    </div>
  )
}
