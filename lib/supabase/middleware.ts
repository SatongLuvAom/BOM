import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isOwnerEmail } from '@/lib/auth/owner-email'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

const AUTH_BYPASS_PATHS = [
  '/api/line/webhook',
]

const PUBLIC_PATHS = [
  '/login',
  '/unauthorized',
  ...AUTH_BYPASS_PATHS,
]

function isPathMatch(pathname: string, paths: string[]) {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function isPublicPath(pathname: string) {
  return isPathMatch(pathname, PUBLIC_PATHS)
}

function isAuthBypassPath(pathname: string) {
  return isPathMatch(pathname, AUTH_BYPASS_PATHS)
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isApiRoute = pathname.startsWith('/api/')

  if (isAuthBypassPath(pathname)) {
    return NextResponse.next({ request })
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Supabase auth is not configured' }, { status: 503 })
    }

    const url = request.nextUrl.clone()
    url.pathname = '/unauthorized'
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublicPath(pathname)) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && !isPublicPath(pathname) && !isOwnerEmail(user.email)) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
    }

    const url = request.nextUrl.clone()
    url.pathname = '/unauthorized'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
