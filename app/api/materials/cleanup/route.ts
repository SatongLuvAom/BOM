import { NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import { fetchMaterialCleanupReport } from '@/lib/server/material-cleanup'

export async function GET() {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const supabase = await createClient()

  try {
    const report = await fetchMaterialCleanupReport(supabase)
    return NextResponse.json(
      { data: report },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not compute material cleanup report' },
      { status: 500 },
    )
  }
}
