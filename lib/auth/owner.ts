import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isOwnerEmail } from '@/lib/auth/owner-email'
import { apiError } from '@/lib/api/responses'

export interface OwnerUser {
  id: string
  email: string
  isOwner: boolean
}

function toOwnerUser(user: { id: string; email?: string | null }): OwnerUser | null {
  if (!user.email) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    isOwner: isOwnerEmail(user.email),
  }
}

export async function getAuthenticatedUser(): Promise<OwnerUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return toOwnerUser(user)
}

export async function getOwnerUser(): Promise<OwnerUser | null> {
  return getAuthenticatedUser()
}

export async function requireAuthenticatedUser(): Promise<OwnerUser> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const authenticatedUser = toOwnerUser(user)

  if (!authenticatedUser) {
    redirect('/login')
  }

  return authenticatedUser
}

// TODO RBAC: replace temporary authenticated-user access with role-based access control.
export async function requireOwner(): Promise<OwnerUser> {
  return requireAuthenticatedUser()
}

export async function requireAuthenticatedUserApi(): Promise<OwnerUser | NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return apiError('UNAUTHORIZED', 'Authentication required', 401)
  }

  const authenticatedUser = toOwnerUser(user)

  if (!authenticatedUser) {
    return apiError('UNAUTHORIZED', 'Authentication required', 401)
  }

  return authenticatedUser
}

// TODO RBAC: replace temporary authenticated-user access with role-based access control.
export async function requireOwnerApi(): Promise<OwnerUser | NextResponse> {
  return requireAuthenticatedUserApi()
}
