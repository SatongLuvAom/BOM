import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerApi } from '@/lib/auth/owner'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const owner = await requireOwnerApi()
  if (owner instanceof NextResponse) return owner

  const { id } = await params

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ไม่ได้ตั้งค่า ANTHROPIC_API_KEY' }, { status: 503 })
  }

  const supabase = await createClient()

  // Fetch MAT items in this BOQ
  const { data: items, error: itemErr } = await supabase
    .from('boq_item')
    .select('item_id, item_name, material_id, uom, unit_price, qty')
    .eq('project_id', id)
    .eq('is_deleted', false)
    .eq('item_type', 'MAT')
    .not('material_id', 'is', null)

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'ไม่มีรายการวัสดุใน BOQ นี้' }, { status: 400 })
  }

  // Fetch price history for each material
  const materialIds = [...new Set(items.map((i) => i.material_id).filter(Boolean))]

  const { data: priceHistory } = await supabase
    .from('mat_price_base')
    .select(
      `material_id, effective_date, unit_price, currency_code, price_uom,
       supplier:supplier!mat_price_base_supplier_id_fkey(supplier_name_th)`,
    )
    .in('material_id', materialIds as string[])
    .eq('is_deleted', false)
    .order('effective_date', { ascending: false })

  // Group history by material_id
  const historyMap: Record<string, any[]> = {}
  for (const p of priceHistory ?? []) {
    if (!historyMap[p.material_id]) historyMap[p.material_id] = []
    if (historyMap[p.material_id].length < 5) historyMap[p.material_id].push(p)
  }

  // Build context for Claude
  const itemsContext = items.map((item) => {
    const history = historyMap[item.material_id!] ?? []
    return {
      item_id:       item.item_id,
      item_name:     item.item_name,
      uom:           item.uom,
      current_price: item.unit_price,
      price_history: history.map((p: any) => ({
        date:     p.effective_date,
        price:    p.unit_price,
        currency: p.currency_code,
        supplier: p.supplier?.supplier_name_th ?? 'ไม่ระบุ',
      })),
    }
  })

  const prompt = `คุณเป็นผู้เชี่ยวชาญด้านการประเมินราคาวัสดุก่อสร้างในประเทศไทย
วิเคราะห์ประวัติราคาของวัสดุแต่ละรายการและแนะนำราคาที่เหมาะสม

ข้อมูลวัสดุและประวัติราคา:
${JSON.stringify(itemsContext, null, 2)}

กรุณาแนะนำราคาต่อหน่วยที่เหมาะสมสำหรับแต่ละรายการ โดยพิจารณาจาก:
1. แนวโน้มราคาในอดีต (trend)
2. ราคาล่าสุดที่มีข้อมูล
3. ความสมเหตุสมผลของราคาปัจจุบัน

ระบุ confidence: high (มีข้อมูลเพียงพอ), medium (ข้อมูลจำกัด), low (ไม่มีประวัติราคา)`

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      tools: [
        {
          name: 'suggest_prices',
          description: 'Return price suggestions for BOQ items',
          input_schema: {
            type: 'object' as const,
            properties: {
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    item_id:         { type: 'string' },
                    suggested_price: { type: 'number' },
                    confidence:      { type: 'string', enum: ['high', 'medium', 'low'] },
                    reasoning:       { type: 'string' },
                  },
                  required: ['item_id', 'suggested_price', 'confidence', 'reasoning'],
                },
              },
            },
            required: ['suggestions'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'suggest_prices' },
      messages: [{ role: 'user', content: prompt }],
    })

    const toolUse = response.content.find((c) => c.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return NextResponse.json({ error: 'AI ไม่สามารถวิเคราะห์ได้' }, { status: 500 })
    }

    const { suggestions } = toolUse.input as { suggestions: any[] }

    // Enrich with current data
    const enriched = suggestions.map((s: any) => {
      const item = items.find((i) => i.item_id === s.item_id)
      return {
        ...s,
        item_name:     item?.item_name ?? '',
        current_price: item?.unit_price ?? 0,
      }
    })

    return NextResponse.json({ data: enriched })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'AI error' }, { status: 500 })
  }
}
