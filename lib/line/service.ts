import {
  formatEmptySearchMessage,
  formatHelpMessage,
  formatMaterialLookupMessage,
  formatPriceLookupMessage,
  formatSearchResultMessage,
} from '@/lib/line/formatter'
import { parseLineCommand } from '@/lib/line/parser'
import { searchMaterialsForLine } from '@/lib/server/material-lookup'

export async function buildLineReplyMessages(text: string): Promise<string[]> {
  const command = parseLineCommand(text)

  if (command.intent === 'help') {
    return [formatHelpMessage()]
  }

  if (command.intent === 'unknown') {
    return []
  }

  if (!command.keyword) {
    return [formatHelpMessage()]
  }

  const results = await searchMaterialsForLine(command.keyword)

  if (results.length === 0) {
    return [formatEmptySearchMessage(command.keyword, command.intent)]
  }

  if (command.intent === 'price') {
    return [formatPriceLookupMessage(command.keyword, results)]
  }

  if (command.intent === 'material') {
    return [formatMaterialLookupMessage(command.keyword, results)]
  }

  return [formatSearchResultMessage(command.keyword, results)]
}
