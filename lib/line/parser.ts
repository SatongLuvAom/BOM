import type { LineTextMessageEvent, ParsedLineCommand } from '@/types/line'

const HELP_COMMANDS = new Set(['help', 'menu', 'เมนู', 'ช่วย', 'ช่วยเหลือ'])

const PREFIX_RULES: Array<{
  intent: ParsedLineCommand['intent']
  prefixes: string[]
}> = [
  { intent: 'price', prefixes: ['ราคา', 'price'] },
  { intent: 'material', prefixes: ['วัสดุ', 'material'] },
  { intent: 'search', prefixes: ['ค้นหา', 'search', 'หา'] },
]

export function isLineTextMessageEvent(event: unknown): event is LineTextMessageEvent {
  if (!event || typeof event !== 'object') {
    return false
  }

  const candidate = event as Partial<LineTextMessageEvent>
  return (
    candidate.type === 'message' &&
    candidate.message?.type === 'text' &&
    typeof candidate.message.text === 'string' &&
    typeof candidate.replyToken === 'string'
  )
}

export function normalizeLineText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

export function parseLineCommand(text: string): ParsedLineCommand {
  const normalized = normalizeLineText(text)
  const lowered = normalized.toLowerCase()

  if (!normalized) {
    return {
      intent: 'unknown',
      keyword: '',
      originalText: text,
    }
  }

  if (HELP_COMMANDS.has(lowered)) {
    return {
      intent: 'help',
      keyword: '',
      originalText: text,
    }
  }

  for (const rule of PREFIX_RULES) {
    for (const prefix of rule.prefixes) {
      if (lowered === prefix) {
        return {
          intent: rule.intent,
          keyword: '',
          originalText: text,
        }
      }

      if (lowered.startsWith(`${prefix} `)) {
        return {
          intent: rule.intent,
          keyword: normalizeLineText(normalized.slice(prefix.length)),
          originalText: text,
        }
      }
    }
  }

  return {
    intent: 'unknown',
    keyword: normalized,
    originalText: text,
  }
}
