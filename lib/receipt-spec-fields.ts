// Versioned, readable storage in the existing proposed_spec -> mat_master.spec path.
// No material identity, prices or supplier data are inferred from these fields.
export const SPEC_PROFILES = {
  laminate: { label: 'ลามิเนต', fields: ['รหัสสี / ลาย', 'ชื่อสี / ลาย', 'ผิวหน้า', 'ความหนา (มม.)', 'ความกว้าง (มม.)', 'ความยาว (มม.)'] },
  board: { label: 'แผ่นไม้', fields: ['เกรดตามผู้ผลิต', 'การปิดผิว', 'วัสดุปิดผิว', 'รหัสลายด้านหน้า', 'รหัสลายด้านหลัง', 'ความหนา (มม.)', 'ความกว้าง (มม.)', 'ความยาว (มม.)'] },
  paint: { label: 'สีทา', fields: ['ประเภทสี', 'พื้นที่ใช้งาน', 'รหัสสี / สูตรผสม', 'ชื่อสี', 'ระดับความเงา', 'ปริมาณต่อภาชนะ', 'หน่วยปริมาณ', 'ภาชนะ'] },
  vinyl: { label: 'กระเบื้องยาง', fields: ['ชนิดพื้น', 'รหัสสี / ลาย', 'วิธีติดตั้ง', 'ความหนา (มม.)', 'ความกว้าง (มม.)', 'ความยาว (มม.)', 'ชั้นผิวสึก (มม.)', 'จำนวนแผ่นต่อกล่อง', 'พื้นที่ต่อกล่อง (ตร.ม.)'] },
} as const
export type SpecProfile = keyof typeof SPEC_PROFILES | ''
export type SpecDetails = { profile: SpecProfile; notes: string; values: Record<string, string> }
const HEADER = '[รายละเอียดวัสดุ v1]'
export const isNumericSpecField = (key: string) => /\(มม\.\)|\(ตร\.ม\.\)|^ปริมาณต่อภาชนะ$|^จำนวนแผ่นต่อกล่อง$/.test(key)

export function writeSpecDetails(draft: SpecDetails): string {
  if (!draft.profile) return draft.notes
  const lines = [HEADER, `ชุดฟอร์ม: ${JSON.stringify(draft.profile)}`, `สเปกเดิม: ${JSON.stringify(draft.notes)}`]
  for (const key of SPEC_PROFILES[draft.profile].fields) {
    if (draft.values[key]) lines.push(`${key}: ${JSON.stringify(draft.values[key])}`)
  }
  return lines.join('\n')
}

export function readSpecDetails(spec: string | null | undefined): SpecDetails {
  const text = spec ?? ''
  const fallback: SpecDetails = {profile:'',notes:text,values:{}}
  if (!text.startsWith(HEADER + '\n')) return fallback
  try {
    const lines=text.split('\n')
    const values: Record<string,string>={}
    for (const line of lines.slice(1)) {
      const pos=line.indexOf(': ')
      if(pos<0) return fallback
      const key=line.slice(0,pos), value=JSON.parse(line.slice(pos+2))
      if(typeof value!=='string' || Object.hasOwn(values,key)) return fallback
      values[key]=value
    }
    const profile=values['ชุดฟอร์ม']
    if(!Object.hasOwn(SPEC_PROFILES,profile) || typeof values['สเปกเดิม']!=='string') return fallback
    const draft: SpecDetails={profile:profile as Exclude<SpecProfile,''>,notes:values['สเปกเดิม'],values:{}}
    for (const [key,value] of Object.entries(values)) {
      if(key==='ชุดฟอร์ม'||key==='สเปกเดิม') continue
      if(!(SPEC_PROFILES[draft.profile as Exclude<SpecProfile,''>].fields as readonly string[]).includes(key)) return fallback
      draft.values[key]=value
    }
    return draft
  } catch { return fallback }
}

export function specDetailError(draft: SpecDetails): string | null {
  if(writeSpecDetails(draft).length>500) return 'รายละเอียดรวมเกิน 500 ตัวอักษร กรุณาย่อข้อมูลก่อนบันทึก (ระบบไม่ตัดข้อมูลทิ้ง)'
  if(!draft.profile) return null
  for (const key of SPEC_PROFILES[draft.profile].fields) {
    const value=draft.values[key]
    if(!value || !isNumericSpecField(key)) continue
    if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Number(value)<=0 || (key==='จำนวนแผ่นต่อกล่อง'&&!Number.isInteger(Number(value)))) return `${key} ต้องเป็น${key==='จำนวนแผ่นต่อกล่อง'?'จำนวนเต็ม':'ตัวเลข'}มากกว่า 0`
  }
  const wear=Number(draft.values['ชั้นผิวสึก (มม.)']), thickness=Number(draft.values['ความหนา (มม.)'])
  if(draft.profile==='vinyl'&&wear>0&&thickness>0&&wear>thickness) return 'ชั้นผิวสึกต้องไม่หนากว่าตัวแผ่น'
  return null
}
