export function safeRouteId(value: unknown) {
  const id = String(value ?? '').trim()
  if (!id || id.includes('/') || id.includes('?') || id.includes('#')) return null
  return encodeURIComponent(id)
}

function detailRoute(prefix: string, id: unknown) {
  const safeId = safeRouteId(id)
  return safeId ? `${prefix}/${safeId}` : null
}

export const routes = {
  materials: {
    list: () => '/materials',
    create: () => '/materials/create',
    detail: (id: unknown) => detailRoute('/materials', id),
    edit: (id: unknown) => {
      const detail = detailRoute('/materials', id)
      return detail ? `${detail}/edit` : null
    },
    cleanup: () => '/materials/cleanup',
    duplicates: () => '/materials/duplicates',
  },
  receipts: {
    list: () => '/receipts',
    new: () => '/receipts/new',
    detail: (id: unknown) => detailRoute('/receipts', id),
  },
  suppliers: {
    list: () => '/suppliers',
    create: () => '/suppliers/create',
    detail: (id: unknown) => detailRoute('/suppliers', id),
    edit: (id: unknown) => {
      const detail = detailRoute('/suppliers', id)
      return detail ? `${detail}/edit` : null
    },
  },
  bom: {
    list: () => '/bom',
    create: () => '/bom/create',
    detail: (id: unknown) => detailRoute('/bom', id),
    edit: (id: unknown) => {
      const detail = detailRoute('/bom', id)
      return detail ? `${detail}/edit` : null
    },
  },
  boq: {
    list: () => '/boq',
    create: () => '/boq/create',
    detail: (id: unknown) => detailRoute('/boq', id),
    edit: (id: unknown) => {
      const detail = detailRoute('/boq', id)
      return detail ? `${detail}/edit` : null
    },
  },
  customers: {
    list: () => '/customers',
    create: () => '/customers/create',
    detail: (id: unknown) => detailRoute('/customers', id),
    edit: (id: unknown) => {
      const detail = detailRoute('/customers', id)
      return detail ? `${detail}/edit` : null
    },
  },
  categories: {
    list: () => '/categories',
    create: () => '/categories/new',
    edit: (id: unknown) => {
      const detail = detailRoute('/categories', id)
      return detail ? `${detail}/edit` : null
    },
  },
  prices: {
    list: () => '/prices',
    create: () => '/prices/new',
    detail: (materialId: unknown, supplierId: unknown, effectiveDate: unknown) => {
      const material = safeRouteId(materialId)
      const supplier = safeRouteId(supplierId)
      const date = safeRouteId(effectiveDate)
      return material && supplier && date ? `/prices/${material}/${supplier}/${date}` : null
    },
    edit: (materialId: unknown, supplierId: unknown, effectiveDate: unknown) => {
      const material = safeRouteId(materialId)
      const supplier = safeRouteId(supplierId)
      const date = safeRouteId(effectiveDate)
      const detail = material && supplier && date ? `/prices/${material}/${supplier}/${date}` : null
      return detail ? `${detail}/edit` : null
    },
  },
}
