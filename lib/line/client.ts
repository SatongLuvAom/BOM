import { getLineConfig } from '@/lib/line/config'
import type { LineReplyMessageRequest } from '@/types/line'

export async function replyLineTextMessages(replyToken: string, texts: string[]) {
  const messages = texts
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((text) => ({
      type: 'text' as const,
      text,
    }))

  if (messages.length === 0) {
    return
  }

  const config = getLineConfig()
  const payload: LineReplyMessageRequest = {
    replyToken,
    messages,
  }

  const response = await fetch(`${config.LINE_BOT_API_BASE_URL}/v2/bot/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LINE reply failed: ${response.status} ${errorText}`)
  }
}
