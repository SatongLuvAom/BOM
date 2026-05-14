import { NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/server-utils'
import { runMaterialDuplicateScan } from '@/lib/server/material-duplicates'

export async function POST() {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()

  try {
    const summary = await runMaterialDuplicateScan(supabase)

    await writeAuditLog({
      entityType: 'material_duplicate_groups',
      entityKey: 'duplicate-scan',
      action: 'UPDATE',
      payload: {
        after: summary,
      },
      createdBy: owner.id,
    })

    return NextResponse.json({ data: summary })
  } catch (error) {
    return databaseError('Could not run material duplicate scan. Run the Phase 2A.11 SQL migration first if this is the first use.', {
      message: (error as Error).message,
    })
  }
}
