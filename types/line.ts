export interface LineWebhookBody {
  destination?: string
  events: LineWebhookEvent[]
}

export interface LineWebhookEventBase {
  type: string
  replyToken?: string
  timestamp?: number
  mode?: 'active' | 'standby'
  webhookEventId?: string
}

export interface LineTextMessageEvent extends LineWebhookEventBase {
  type: 'message'
  replyToken: string
  message: {
    id: string
    type: 'text'
    text: string
  }
  source?: {
    type: 'user' | 'group' | 'room'
    userId?: string
    groupId?: string
    roomId?: string
  }
}

export type LineWebhookEvent = LineTextMessageEvent | LineWebhookEventBase

export interface LineReplyMessageRequest {
  replyToken: string
  messages: Array<{
    type: 'text'
    text: string
  }>
}

export type LineCommandIntent = 'help' | 'price' | 'material' | 'search' | 'unknown'

export interface ParsedLineCommand {
  intent: LineCommandIntent
  keyword: string
  originalText: string
}

export interface LineMaterialLookupPrice {
  material_id: string
  supplier_id: string
  supplier_name_th: string | null
  effective_date: string
  price_uom: string
  price_uom_name_th: string | null
  unit_price: number
  currency_code: string
}

export interface LineMaterialLookupResult {
  material_id: string
  mat_name_th: string
  mat_name_en: string | null
  spec: string | null
  brand: string | null
  base_uom: string
  category_name_th: string | null
  aliases: string[]
  latest_price: LineMaterialLookupPrice | null
  match_score: number
  match_sources: string[]
}
