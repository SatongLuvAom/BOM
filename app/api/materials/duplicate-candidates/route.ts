import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnerApi } from '@/lib/auth/owner'
import { databaseError, validationError } from '@/lib/api/responses'
import { createClient } from '@/lib/supabase/server'
import { getMaterialDuplicateWarnings } from '@/lib/server/material-duplicates'

const duplicateCandidateSchema = z.object({
  cat_id: z.string().trim().optional().nullable(),
  category_id: z.string().trim().optional().nullable(),
  material_type_id: z.string().trim().optional().nullable(),
  code_spec_key: z.string().trim().optional().nullable(),
  mat_name_th: z.string().trim().optional().nullable(),
  mat_name_en: z.string().trim().optional().nullable(),
  spec: z.string().trim().optional().nullable(),
  brand: z.string().trim().optional().nullable(),
  model: z.string().trim().optional().nullable(),
  base_uom: z.string().trim().optional().nullable(),
  base_uom_id: z.string().trim().optional().nullable(),
  limit: z.number().int().min(1).max(10).optional(),
})

export async function POST(req: NextRequest) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const body = await req.json()
  const parsed = duplicateCandidateSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.flatten())

  const supabase = await createClient()

  try {
    const data = await getMaterialDuplicateWarnings(supabase, parsed.data)
    return NextResponse.json({ data })
  } catch (error) {
    return databaseError('Could not check duplicate material candidates', {
      message: (error as Error).message,
    })
  }
}
