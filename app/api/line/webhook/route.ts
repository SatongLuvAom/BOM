import { NextRequest, NextResponse } from 'next/server'
import { getLineConfig } from '@/lib/line/config'
import { replyLineTextMessages } from '@/lib/line/client'
import { isLineTextMessageEvent } from '@/lib/line/parser'
import { buildLineReplyMessages } from '@/lib/line/service'
import { verifyLineSignature } from '@/lib/line/signature'
import type { LineWebhookBody } from '@/types/line'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const config = getLineConfig()
    const rawBody = await req.text()
    const signature = req.headers.get('x-line-signature')

    if (
      !verifyLineSignature({
        body: rawBody,
        signature,
        channelSecret: config.LINE_CHANNEL_SECRET,
      })
    ) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let body: LineWebhookBody
    try {
      body = JSON.parse(rawBody) as LineWebhookBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const textEvents = (body.events ?? []).filter(isLineTextMessageEvent)

    const results = await Promise.allSettled(
      textEvents.map(async (event) => {
        const messages = await buildLineReplyMessages(event.message.text)
        await replyLineTextMessages(event.replyToken, messages)
      }),
    )

    const failedEvents = results.filter((result) => result.status === 'rejected')
    if (failedEvents.length > 0) {
      console.error('LINE webhook handled with reply failures', failedEvents)
    }

    return NextResponse.json({
      ok: true,
      receivedEvents: body.events?.length ?? 0,
      handledEvents: textEvents.length,
      failedEvents: failedEvents.length,
    })
  } catch (error) {
    console.error('LINE webhook failed', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
