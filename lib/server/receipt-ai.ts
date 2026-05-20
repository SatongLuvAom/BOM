import { z } from 'zod'
import { normalizeMaterialSearchText } from '@/lib/material-master'
import { writeAuditLog } from '@/lib/server-utils'
import {
  RECEIPT_ITEM_SELECT,
  RECEIPT_SELECT,
  ReceiptImportError,
  getReceiptById,
  listReceiptItems,
} from '@/lib/server/receipt-import'

const RECEIPT_BUCKET = 'boq-attachments'
const MAX_AI_FILE_SIZE = 10 * 1024 * 1024
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'

const supportedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
])

const rawExtractionSchema = z.object({
  supplier: z.object({
    name: z.union([z.string(), z.null()]).optional(),
    taxId: z.union([z.string(), z.null()]).optional(),
    phone: z.union([z.string(), z.null()]).optional(),
  }).optional(),
  receipt: z.object({
    receiptNo: z.union([z.string(), z.null()]).optional(),
    date: z.union([z.string(), z.null()]).optional(),
    subtotal: z.union([z.string(), z.number(), z.null()]).optional(),
    vat: z.union([z.string(), z.number(), z.null()]).optional(),
    discount: z.union([z.string(), z.number(), z.null()]).optional(),
    grandTotal: z.union([z.string(), z.number(), z.null()]).optional(),
  }).optional(),
  items: z.array(z.object({
    lineNo: z.union([z.string(), z.number(), z.null()]).optional(),
    rawText: z.union([z.string(), z.null()]).optional(),
    name: z.union([z.string(), z.null()]).optional(),
    qty: z.union([z.string(), z.number(), z.null()]).optional(),
    uom: z.union([z.string(), z.null()]).optional(),
    unitPrice: z.union([z.string(), z.number(), z.null()]).optional(),
    lineTotal: z.union([z.string(), z.number(), z.null()]).optional(),
  })).optional(),
  confidence: z.union([z.string(), z.number(), z.null()]).optional(),
  warnings: z.array(z.string()).optional(),
})

export type ReceiptExtractionItem = {
  lineNo: number | null
  rawText: string | null
  name: string | null
  qty: number | null
  uom: string | null
  uomId: string | null
  unitPrice: number | null
  lineTotal: number | null
  suggestedMaterialId: string | null
  materialId: string | null
  matchConfidence: number | null
  matchReason: string | null
  action: 'update_price' | 'needs_review'
}

export type ReceiptExtraction = {
  supplier: {
    name: string | null
    taxId: string | null
    phone: string | null
  }
  receipt: {
    receiptNo: string | null
    date: string | null
    subtotal: number | null
    vat: number | null
    discount: number | null
    grandTotal: number | null
  }
  items: ReceiptExtractionItem[]
  confidence: number | null
  warnings: string[]
  rawText: string
}

type ReceiptFile = {
  buffer: Buffer
  mimeType: string
  fileName: string
}

type MaterialMatchRow = {
  id: string
  material_id: string
  material_code: string | null
  mat_name_th: string | null
  mat_name_en: string | null
  normalized_name: string | null
  brand: string | null
  model: string | null
  spec: string | null
  code_spec_key: string | null
  base_uom: string | null
}

type UomRow = {
  id: string
  uom_code: string | null
  uom_name_th: string | null
}

function cleanText(value: string | null | undefined) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeDigits(value: string) {
  const thaiDigits: Record<string, string> = {
    '๐': '0',
    '๑': '1',
    '๒': '2',
    '๓': '3',
    '๔': '4',
    '๕': '5',
    '๖': '6',
    '๗': '7',
    '๘': '8',
    '๙': '9',
  }
  return value.replace(/[๐-๙]/g, (digit) => thaiDigits[digit] ?? digit)
}

function toPositiveNumber(value: unknown, warnings: string[], label: string) {
  if (value === null || value === undefined || value === '') return null
  const normalized = normalizeDigits(String(value))
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
  if (!normalized || normalized === '-' || normalized === '.') return null

  const numberValue = Number(normalized)
  if (!Number.isFinite(numberValue)) return null
  if (numberValue < 0) {
    warnings.push(`${label} เป็นค่าติดลบ ระบบจึงไม่บันทึกค่านี้`)
    return null
  }
  return numberValue
}

function toLineNo(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(normalizeDigits(String(value)).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null
  return Math.trunc(numberValue)
}

function normalizeConfidence(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(normalizeDigits(String(value)).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(numberValue)) return null
  const scaled = numberValue > 0 && numberValue <= 1 ? numberValue * 100 : numberValue
  return Math.max(0, Math.min(100, Math.round(scaled)))
}

function parseReceiptDate(value: string | null | undefined) {
  const text = normalizeDigits(String(value ?? '').trim())
  if (!text) return null

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const thaiOrLocal = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  let year: number
  let month: number
  let day: number

  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else if (thaiOrLocal) {
    day = Number(thaiOrLocal[1])
    month = Number(thaiOrLocal[2])
    year = Number(thaiOrLocal[3])
  } else {
    return null
  }

  if (year > 2400) year -= 543
  if (year < 100) year += 2000

  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function extractJsonText(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) return fenced[1].trim()

  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function guessMimeType(fileName: string | null | undefined, fallback = '') {
  const name = String(fileName ?? '').toLowerCase()
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.pdf')) return 'application/pdf'
  return fallback || 'application/octet-stream'
}

function assertSupportedFile(file: ReceiptFile) {
  if (!supportedMimeTypes.has(file.mimeType)) {
    throw new ReceiptImportError('ไม่สามารถอ่านไฟล์นี้ได้ กรุณาแนบไฟล์ JPG, PNG หรือ PDF', 400, 'BAD_REQUEST')
  }
  if (file.buffer.byteLength > MAX_AI_FILE_SIZE) {
    throw new ReceiptImportError('ไฟล์ใหญ่เกิน 10 MB กรุณาลดขนาดไฟล์ก่อนอ่านด้วย AI', 400, 'BAD_REQUEST')
  }
}

async function loadReceiptFile(supabase: any, receipt: any): Promise<ReceiptFile> {
  const storagePath = cleanText(receipt.file_storage_path)
  const fileUrl = cleanText(receipt.file_url)
  const fileName = cleanText(receipt.file_name) ?? 'receipt'
  const mimeHint = cleanText(receipt.file_mime_type) ?? guessMimeType(fileName)

  if (storagePath || (fileUrl && !/^https?:\/\//i.test(fileUrl))) {
    const path = storagePath ?? fileUrl!
    const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).download(path)
    if (error) throw new ReceiptImportError('ไม่สามารถอ่านไฟล์สลิปจาก Storage ได้', 500, 'DATABASE_ERROR', error)

    const buffer = Buffer.from(await data.arrayBuffer())
    const file = {
      buffer,
      mimeType: data.type || mimeHint,
      fileName,
    }
    assertSupportedFile(file)
    return file
  }

  if (fileUrl) {
    const res = await fetch(fileUrl)
    if (!res.ok) throw new ReceiptImportError('ไม่สามารถดาวน์โหลดไฟล์สลิปได้', 400, 'BAD_REQUEST')

    const buffer = Buffer.from(await res.arrayBuffer())
    const file = {
      buffer,
      mimeType: res.headers.get('content-type')?.split(';')[0] || mimeHint,
      fileName,
    }
    assertSupportedFile(file)
    return file
  }

  throw new ReceiptImportError('กรุณาแนบไฟล์สลิปก่อนอ่านด้วย AI', 400, 'BAD_REQUEST')
}

function receiptExtractionPrompt() {
  return `
คุณคือระบบอ่านข้อความจากสลิปซื้อวัสดุ/ใบกำกับภาษี/ใบเสร็จสำหรับงาน BOQ และ Material Master

งานของคุณ:
- อ่านชื่อร้าน/ซัพพลายเออร์, Tax ID, เบอร์โทร ถ้ามี
- อ่านเลขที่เอกสาร, วันที่, subtotal, VAT, discount, grand total
- อ่านรายการสินค้าเป็นบรรทัด พร้อมจำนวน หน่วย ราคา/หน่วย และราคารวม

กฎสำคัญ:
- ห้ามเดา material_code
- ห้ามสร้างวัสดุใหม่
- ห้ามสร้างซัพพลายเออร์ใหม่
- ห้ามเติมข้อมูลที่ไม่มีในเอกสาร ถ้าไม่แน่ใจให้ใส่ null
- วันที่ให้คืนเป็น YYYY-MM-DD ถ้าเห็นปี พ.ศ. เช่น 2569 ให้แปลงเป็น ค.ศ. 2026
- ตัวเลขให้คืนเป็น number ไม่ต้องใส่สกุลเงิน
- เก็บ rawText ของแต่ละรายการไว้เสมอถ้าอ่านได้
- คืน JSON เท่านั้น ห้ามมีคำอธิบายอื่น

รูปแบบ JSON:
{
  "supplier": {
    "name": "string | null",
    "taxId": "string | null",
    "phone": "string | null"
  },
  "receipt": {
    "receiptNo": "string | null",
    "date": "YYYY-MM-DD | null",
    "subtotal": "number | null",
    "vat": "number | null",
    "discount": "number | null",
    "grandTotal": "number | null"
  },
  "items": [
    {
      "lineNo": "number | null",
      "rawText": "string",
      "name": "string",
      "qty": "number | null",
      "uom": "string | null",
      "unitPrice": "number | null",
      "lineTotal": "number | null"
    }
  ],
  "confidence": "number",
  "warnings": ["string"]
}
`.trim()
}

async function callGemini(file: ReceiptFile) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new ReceiptImportError('ยังไม่ได้ตั้งค่า GEMINI_API_KEY', 503, 'BAD_REQUEST')
  }

  const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, '')
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const baseParts = [
    {
      inline_data: {
        mime_type: file.mimeType,
        data: file.buffer.toString('base64'),
      },
    },
    { text: receiptExtractionPrompt() },
  ]

  const baseBody = {
    contents: [{ role: 'user', parts: baseParts }],
    generationConfig: {
      temperature: 0.1,
      responseFormat: {
        text: { mimeType: 'application/json' },
      },
    },
  }

  let res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(baseBody),
  })

  if (!res.ok && res.status === 400) {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        ...baseBody,
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json',
        },
      }),
    })
  }

  const responseText = await res.text()
  if (!res.ok) {
    throw new ReceiptImportError('ไม่สามารถอ่านไฟล์นี้ได้ กรุณากรอกข้อมูลเอง', 502, 'BAD_REQUEST', {
      status: res.status,
      message: responseText.slice(0, 500),
    })
  }

  let json: any
  try {
    json = JSON.parse(responseText)
  } catch {
    throw new ReceiptImportError('Gemini ตอบกลับไม่ใช่ JSON ที่อ่านได้', 502, 'BAD_REQUEST')
  }

  const text = (json.candidates ?? [])
    .flatMap((candidate: any) => candidate?.content?.parts ?? [])
    .map((part: any) => part?.text)
    .filter(Boolean)
    .join('\n')

  if (!text) {
    throw new ReceiptImportError('Gemini ไม่พบข้อมูลในไฟล์นี้ กรุณากรอกข้อมูลเอง', 502, 'BAD_REQUEST')
  }

  return text
}

export function validateReceiptExtraction(rawText: string): ReceiptExtraction {
  const warnings: string[] = []
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(extractJsonText(rawText))
  } catch {
    throw new ReceiptImportError('ระบบอ่านข้อมูลได้บางส่วน แต่ JSON ไม่สมบูรณ์ กรุณากรอกข้อมูลเอง', 502, 'BAD_REQUEST')
  }

  const parsed = rawExtractionSchema.safeParse(parsedJson)
  if (!parsed.success) {
    throw new ReceiptImportError('รูปแบบผลลัพธ์จาก AI ไม่ถูกต้อง กรุณากรอกข้อมูลเอง', 502, 'BAD_REQUEST', parsed.error.flatten())
  }

  const raw = parsed.data
  warnings.push(...(raw.warnings ?? []).map((warning) => String(warning)).filter(Boolean))

  const items = (raw.items ?? []).slice(0, 100).map((item, index) => {
    const rawLine = cleanText(item.rawText)
    const name = cleanText(item.name) ?? rawLine
    return {
      lineNo: toLineNo(item.lineNo) ?? index + 1,
      rawText: rawLine ?? name,
      name,
      qty: toPositiveNumber(item.qty, warnings, `จำนวนบรรทัด ${index + 1}`),
      uom: cleanText(item.uom),
      uomId: null,
      unitPrice: toPositiveNumber(item.unitPrice, warnings, `ราคา/หน่วยบรรทัด ${index + 1}`),
      lineTotal: toPositiveNumber(item.lineTotal, warnings, `ราคารวมบรรทัด ${index + 1}`),
      suggestedMaterialId: null,
      materialId: null,
      matchConfidence: null,
      matchReason: null,
      action: 'needs_review' as const,
    }
  }).filter((item) => item.name || item.rawText)

  const grandTotal = toPositiveNumber(raw.receipt?.grandTotal, warnings, 'ยอดรวมสุทธิ')
  const itemTotal = items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0)
  if (grandTotal && itemTotal > 0 && Math.abs(grandTotal - itemTotal) > Math.max(2, grandTotal * 0.02)) {
    warnings.push('ยอดรวมในหัวสลิปไม่ตรงกับผลรวมรายการ กรุณาตรวจสอบอีกครั้ง')
  }

  if (items.length === 0) {
    warnings.push('AI ไม่พบรายการสินค้า กรุณาเพิ่มรายการด้วยตัวเอง')
  }

  return {
    supplier: {
      name: cleanText(raw.supplier?.name),
      taxId: cleanText(raw.supplier?.taxId),
      phone: cleanText(raw.supplier?.phone),
    },
    receipt: {
      receiptNo: cleanText(raw.receipt?.receiptNo),
      date: parseReceiptDate(raw.receipt?.date),
      subtotal: toPositiveNumber(raw.receipt?.subtotal, warnings, 'Subtotal'),
      vat: toPositiveNumber(raw.receipt?.vat, warnings, 'VAT'),
      discount: toPositiveNumber(raw.receipt?.discount, warnings, 'Discount'),
      grandTotal,
    },
    items,
    confidence: normalizeConfidence(raw.confidence),
    warnings: Array.from(new Set(warnings)),
    rawText,
  }
}

export async function extractReceiptWithGemini(file: ReceiptFile) {
  assertSupportedFile(file)
  const rawText = await callGemini(file)
  return validateReceiptExtraction(rawText)
}

function specTokens(value: string | null | undefined) {
  const normalized = normalizeDigits(String(value ?? ''))
    .toUpperCase()
    .replace(/×/g, 'X')
    .replace(/มิลลิเมตร|ม\.ม\.|มม\.?|มม/g, 'MM')
    .replace(/เซนติเมตร|ซม\.?|ซม/g, 'CM')
    .replace(/เมตร/g, 'M')
    .replace(/วัตต์/g, 'W')
    .replace(/โวลต์/g, 'V')
    .replace(/(\d)\s+(MM|CM|M|W|V)\b/g, '$1$2')

  const tokens = new Set<string>()
  const patterns = [
    /\b\d{1,4}(?:\.\d+)?(?:MM|CM|M|W|V)\b/g,
    /\b\d{2,4}X\d{2,4}(?:X\d{1,4})?(?:MM|CM|M)?\b/g,
    /\b\d{3}[A-Z]?\b/g,
  ]

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) tokens.add(match[0])
  }
  return tokens
}

function hasSpecConflict(itemText: string, material: MaterialMatchRow) {
  const itemTokens = specTokens(itemText)
  const materialTokens = specTokens([
    material.code_spec_key,
    material.spec,
    material.mat_name_th,
    material.mat_name_en,
    material.model,
  ].filter(Boolean).join(' '))

  if (itemTokens.size === 0 || materialTokens.size === 0) return false
  for (const token of itemTokens) {
    if (materialTokens.has(token)) return false
  }
  return true
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeMaterialSearchText(left).split(' ').filter(Boolean))
  const rightTokens = new Set(normalizeMaterialSearchText(right).split(' ').filter(Boolean))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection)
}

function scoreMaterialForItem(item: ReceiptExtractionItem, material: MaterialMatchRow) {
  const itemText = normalizeMaterialSearchText([item.name, item.rawText].filter(Boolean).join(' '))
  const itemName = normalizeMaterialSearchText(item.name)
  const materialCode = normalizeMaterialSearchText(material.material_code ?? material.material_id)
  const th = normalizeMaterialSearchText(material.mat_name_th)
  const en = normalizeMaterialSearchText(material.mat_name_en)
  const normalizedName = normalizeMaterialSearchText(material.normalized_name)
  const materialText = normalizeMaterialSearchText([
    material.material_code,
    material.mat_name_th,
    material.mat_name_en,
    material.brand,
    material.model,
    material.spec,
  ].filter(Boolean).join(' '))

  let score = 0
  let reason = ''

  if (materialCode && itemText.includes(materialCode)) {
    score = 98
    reason = 'พบรหัสวัสดุในสลิป'
  } else if (itemName && (itemName === th || itemName === en || itemName === normalizedName)) {
    score = 95
    reason = 'ชื่อรายการตรงกับชื่อวัสดุ'
  } else if ((th.length >= 3 && itemText.includes(th)) || (en.length >= 3 && itemText.includes(en))) {
    score = 90
    reason = 'ชื่อวัสดุอยู่ในรายการจากสลิป'
  } else {
    const similarity = tokenSimilarity(itemText, materialText)
    if (similarity >= 0.8) {
      score = 85
      reason = 'ชื่อรายการใกล้เคียงกับวัสดุ'
    } else if (similarity >= 0.6) {
      score = 70
      reason = 'ชื่อรายการคล้ายวัสดุบางส่วน'
    }
  }

  if (score > 0 && hasSpecConflict(itemText, material)) {
    return {
      score: Math.min(score, 59),
      reason: 'ชื่อคล้ายกันแต่สเปกต่างกัน ต้องตรวจสอบ',
    }
  }

  return { score, reason }
}

async function addMaterialSuggestions(supabase: any, extraction: ReceiptExtraction) {
  if (extraction.items.length === 0) return extraction

  const [{ data: materials, error: materialError }, { data: uoms, error: uomError }] = await Promise.all([
    supabase
      .from('mat_master')
      .select('id, material_id, material_code, mat_name_th, mat_name_en, normalized_name, brand, model, spec, code_spec_key, base_uom')
      .eq('is_deleted', false)
      .limit(2000),
    supabase
      .from('mat_uom')
      .select('id, uom_code, uom_name_th')
      .eq('is_deleted', false)
      .limit(500),
  ])

  if (materialError) throw new ReceiptImportError(materialError.message, 500, 'DATABASE_ERROR', materialError)
  if (uomError) throw new ReceiptImportError(uomError.message, 500, 'DATABASE_ERROR', uomError)

  const materialRows = (materials ?? []) as MaterialMatchRow[]
  const uomByKey = new Map<string, UomRow>()
  for (const uom of (uoms ?? []) as UomRow[]) {
    for (const value of [uom.uom_code, uom.uom_name_th]) {
      const key = normalizeMaterialSearchText(value)
      if (key) uomByKey.set(key, uom)
    }
  }

  return {
    ...extraction,
    items: extraction.items.map((item) => {
      let best: { material: MaterialMatchRow; score: number; reason: string } | null = null
      for (const material of materialRows) {
        const result = scoreMaterialForItem(item, material)
        if (result.score > (best?.score ?? 0)) {
          best = { material, ...result }
        }
      }

      const uom = uomByKey.get(normalizeMaterialSearchText(item.uom))
      const highConfidence = Boolean(best && best.score >= 90 && item.unitPrice && item.unitPrice > 0)
      return {
        ...item,
        uom: uom?.uom_code ?? item.uom,
        uomId: uom?.id ?? null,
        suggestedMaterialId: best && best.score >= 60 ? best.material.id : null,
        materialId: highConfidence ? best!.material.id : null,
        matchConfidence: best && best.score >= 60 ? best.score : null,
        matchReason: best && best.score >= 60 ? best.reason : null,
        action: highConfidence ? 'update_price' : 'needs_review',
      }
    }),
  }
}

export async function applyExtractionToReceiptDraft(
  supabase: any,
  receiptId: string,
  options: { replaceItems: boolean; userId: string },
) {
  const receipt = await getReceiptById(supabase, receiptId)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') {
    throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว อ่าน AI หรือแทนที่รายการไม่ได้', 400, 'BAD_REQUEST')
  }

  const existingItems = await listReceiptItems(supabase, receiptId)
  if (existingItems.length > 0 && !options.replaceItems) {
    throw new ReceiptImportError('สลิปนี้มีรายการอยู่แล้ว ต้องยืนยันการแทนที่รายการเดิมด้วยผล AI', 409, 'BAD_REQUEST', {
      requiresReplace: true,
      itemCount: existingItems.length,
    })
  }

  const file = await loadReceiptFile(supabase, receipt)
  const extracted = await addMaterialSuggestions(supabase, await extractReceiptWithGemini(file))

  if (existingItems.length > 0 && options.replaceItems) {
    const { error: deleteError } = await supabase
      .from('purchase_receipt_items')
      .delete()
      .eq('receipt_id', receiptId)

    if (deleteError) throw new ReceiptImportError(deleteError.message, 500, 'DATABASE_ERROR', deleteError)
  }

  const rows = extracted.items.map((item, index) => ({
    receipt_id: receiptId,
    line_no: item.lineNo ?? index + 1,
    raw_text: item.rawText,
    item_name_raw: item.name,
    item_name_normalized: normalizeMaterialSearchText(item.name ?? item.rawText),
    qty: item.qty,
    uom_raw: item.uom,
    uom_id: item.uomId,
    unit_price: item.unitPrice,
    line_total: item.lineTotal,
    suggested_material_id: item.suggestedMaterialId,
    material_id: item.materialId,
    match_confidence: item.matchConfidence,
    match_reason: item.matchReason,
    action: item.action,
    review_status: 'needs_review',
  }))

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('purchase_receipt_items')
      .insert(rows)

    if (insertError) throw new ReceiptImportError(insertError.message, 500, 'DATABASE_ERROR', insertError)
  }

  const updatePayload = {
    supplier_name_raw: extracted.supplier.name ?? receipt.supplier_name_raw,
    supplier_tax_id_raw: extracted.supplier.taxId ?? receipt.supplier_tax_id_raw,
    receipt_no: extracted.receipt.receiptNo ?? receipt.receipt_no,
    receipt_date: extracted.receipt.date ?? receipt.receipt_date,
    subtotal: extracted.receipt.subtotal ?? receipt.subtotal,
    vat: extracted.receipt.vat ?? receipt.vat,
    discount: extracted.receipt.discount ?? receipt.discount,
    grand_total: extracted.receipt.grandTotal ?? receipt.grand_total,
    confidence: extracted.confidence,
    status: 'needs_review',
    ai_raw_text: extracted.rawText,
    ai_raw_json: {
      supplier: extracted.supplier,
      receipt: extracted.receipt,
      items: extracted.items,
      confidence: extracted.confidence,
      warnings: extracted.warnings,
    },
  }

  const { data: updatedReceipt, error: updateError } = await supabase
    .from('purchase_receipts')
    .update(updatePayload)
    .eq('id', receiptId)
    .select(RECEIPT_SELECT)
    .single()

  if (updateError) throw new ReceiptImportError(updateError.message, 500, 'DATABASE_ERROR', updateError)

  await writeAuditLog({
    entityType: 'purchase_receipt',
    entityKey: receiptId,
    action: 'AI_EXTRACT',
    payload: {
      before: { receipt, item_count: existingItems.length },
      after: { receipt: updatedReceipt, item_count: rows.length, warnings: extracted.warnings },
    },
    createdBy: options.userId,
  })

  const items = await listReceiptItems(supabase, receiptId)
  return {
    receipt: updatedReceipt,
    items,
    extraction: {
      confidence: extracted.confidence,
      warnings: extracted.warnings,
      itemCount: rows.length,
      replacedItems: existingItems.length,
    },
  }
}

export async function attachReceiptFile(
  supabase: any,
  receiptId: string,
  file: File,
  userId: string,
) {
  const receipt = await getReceiptById(supabase, receiptId)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')
  if (receipt.status === 'posted') {
    throw new ReceiptImportError('สลิปนี้ถูกบันทึกเข้าระบบแล้ว แนบไฟล์ใหม่ไม่ได้', 400, 'BAD_REQUEST')
  }

  const mimeType = file.type || guessMimeType(file.name)
  if (!supportedMimeTypes.has(mimeType)) {
    throw new ReceiptImportError('รองรับเฉพาะไฟล์ JPG, PNG หรือ PDF', 400, 'BAD_REQUEST')
  }
  if (file.size > MAX_AI_FILE_SIZE) {
    throw new ReceiptImportError('ไฟล์ใหญ่เกิน 10 MB', 400, 'BAD_REQUEST')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `receipts/${receiptId}/${Date.now()}_${safeName}`
  const { error: uploadError } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, { contentType: mimeType, upsert: false })

  if (uploadError) throw new ReceiptImportError(uploadError.message, 500, 'DATABASE_ERROR', uploadError)

  if (receipt.file_storage_path) {
    await supabase.storage.from(RECEIPT_BUCKET).remove([receipt.file_storage_path])
  }

  const { data, error } = await supabase
    .from('purchase_receipts')
    .update({
      file_storage_path: path,
      file_url: null,
      file_name: file.name,
      file_mime_type: mimeType,
    })
    .eq('id', receiptId)
    .select(RECEIPT_SELECT)
    .single()

  if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)

  await writeAuditLog({
    entityType: 'purchase_receipt',
    entityKey: receiptId,
    action: 'UPLOAD_FILE',
    payload: { before: receipt, after: data },
    createdBy: userId,
  })

  return data
}

export async function createReceiptFileSignedUrl(supabase: any, receiptId: string) {
  const receipt = await getReceiptById(supabase, receiptId)
  if (!receipt) throw new ReceiptImportError('Receipt not found', 404, 'NOT_FOUND')

  if (receipt.file_storage_path) {
    const { data, error } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(receipt.file_storage_path, 3600)

    if (error) throw new ReceiptImportError(error.message, 500, 'DATABASE_ERROR', error)
    return data.signedUrl
  }

  if (receipt.file_url && /^https?:\/\//i.test(receipt.file_url)) {
    return receipt.file_url
  }

  throw new ReceiptImportError('ยังไม่ได้แนบไฟล์', 404, 'NOT_FOUND')
}
