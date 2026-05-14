import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { databaseError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { getMaterialDuplicateGroups, type DuplicateConfidence, type DuplicateStatus } from '@/lib/server/material-duplicates'

export async function GET(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()
  const { searchParams } = req.nextUrl

  try {
    const data = await getMaterialDuplicateGroups(supabase, {
      confidence: (searchParams.get('confidence') ?? '') as DuplicateConfidence | '',
      status: (searchParams.get('status') ?? '') as DuplicateStatus | '',
      category_id: searchParams.get('category_id') ?? '',
      material_type_id: searchParams.get('material_type_id') ?? '',
      unresolvedOnly: searchParams.get('unresolved_only') === '1',
      limit: Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 300))),
    })

    return NextResponse.json({ data })
  } catch (error) {
    return databaseError('Could not load material duplicate groups. Run the Phase 2A.11 SQL migration first if this is the first use.', {
      message: (error as Error).message,
    })
  }
}
