import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOwnerEmail, isOwnerEmail } from '@/lib/auth/owner-email'
import { apiError } from '@/lib/api/responses'

export interface OwnerUser {
  id: string
  email: string
}

export async function getOwnerUser(): Promise<OwnerUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user?.email || !isOwnerEmail(user.email)) {
    return null
  }

  return { id: user.id, email: user.email }
}

export async function requireOwner(): Promise<OwnerUser> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  if (!user.email || !isOwnerEmail(user.email)) {
    redirect('/unauthorized')
  }

  return { id: user.id, email: user.email }
}

export async function requireOwnerApi(): Promise<OwnerUser | NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return apiError('UNAUTHORIZED', 'Authentication required', 401)
  }

  if (!user.email || !isOwnerEmail(user.email)) {
    return apiError('FORBIDDEN', 'Owner access required', 403)
  }

  return { id: user.id, email: user.email }
}
