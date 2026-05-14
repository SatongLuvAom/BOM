interface SupabaseResult<T> {
  data: T
  error: { message: string } | null
}

export function assertSupabase<T>(result: SupabaseResult<T>, context: string): NonNullable<T> {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`)
  }

  if (result.data == null) {
    throw new Error(`${context}: no data returned`)
  }

  return result.data as NonNullable<T>
}
