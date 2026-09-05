import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type SupabaseCookie = {
  name: string
  value: string
  options: Parameters<Awaited<ReturnType<typeof cookies>>['set']>[2]
}

export async function createClient(options: { measureDuplicateBomRead?: boolean } = {}) {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(options.measureDuplicateBomRead ? { global: { fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
        if (method !== 'GET' || url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin || url.pathname !== '/rest/v1/bom_item') {
          return fetch(input, init)
        }
        const started = performance.now()
        const response = await fetch(input, init)
        const headersAt = performance.now()
        const readText = response.text.bind(response)
        // PostgREST consumes text once. Measure that read without cloning or buffering a second body.
        response.text = async () => {
          const bodyStarted = performance.now()
          let bodyBytes: number | null = null
          try {
            const text = await readText()
            bodyBytes = Buffer.byteLength(text, 'utf8')
            return text
          } finally {
            const finished = performance.now()
            console.info(JSON.stringify({
              event: 'duplicate_bom_transport', region: process.env.VERCEL_REGION ?? 'local',
              status: response.status, headers_ms: Math.round(headersAt - started),
              consumer_gap_ms: Math.round(bodyStarted - headersAt),
              body_ms: Math.round(finished - bodyStarted), total_ms: Math.round(finished - started),
              decoded_body_bytes: bodyBytes, body_complete: bodyBytes !== null,
            }))
          }
        }
        return response
      } } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: SupabaseCookie[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: SupabaseCookie) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server component — ignore
          }
        },
      },
    },
  )
}
