import { z } from 'zod'

const lineEnvSchema = z.object({
  LINE_CHANNEL_SECRET: z.string().min(1, 'LINE_CHANNEL_SECRET is required'),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1, 'LINE_CHANNEL_ACCESS_TOKEN is required'),
  LINE_BOT_API_BASE_URL: z.string().url().default('https://api.line.me'),
})

export type LineConfig = z.infer<typeof lineEnvSchema>

let cachedConfig: LineConfig | null = null

export function getLineConfig(): LineConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const parsed = lineEnvSchema.safeParse({
    LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,
    LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    LINE_BOT_API_BASE_URL: process.env.LINE_BOT_API_BASE_URL ?? 'https://api.line.me',
  })

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(', ')
    throw new Error(`Invalid LINE configuration: ${message}`)
  }

  cachedConfig = parsed.data
  return cachedConfig
}
