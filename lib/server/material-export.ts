export type MaterialDimensions = {
  thicknessMm: number | ''
  widthM: number | ''
  lengthM: number | ''
}

type MaterialNameParts = {
  mat_name_th?: string | null
  mat_name_en?: string | null
  brand?: string | null
  model?: string | null
  spec?: string | null
}

function roundDimension(value: number) {
  return Math.round(value * 100) / 100
}

export function parseMaterialDimensions(value: string | null | undefined): MaterialDimensions {
  const text = String(value ?? '').replace(/,/g, '.').trim()
  const thicknessMatch = text.match(/(\d+(?:\.\d+)?)\s*mm\b/i)
  const result: MaterialDimensions = {
    thicknessMm: thicknessMatch ? Number(thicknessMatch[1]) : '',
    widthM: '',
    lengthM: '',
  }

  const feetMatch = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|ฟุต)(?:\s|$)/i)
  if (feetMatch) {
    result.widthM = roundDimension(Number(feetMatch[1]) * 0.3048)
    result.lengthM = roundDimension(Number(feetMatch[2]) * 0.3048)
    return result
  }

  const meterMatch = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*m\b/i)
  if (meterMatch) {
    result.widthM = Number(meterMatch[1])
    result.lengthM = Number(meterMatch[2])
    return result
  }

  const separators = text.match(/[x×]/g)?.length ?? 0
  const millimeterMatch = separators === 1
    ? text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*mm\b/i)
    : null
  if (millimeterMatch) {
    result.widthM = roundDimension(Number(millimeterMatch[1]) / 1000)
    result.lengthM = roundDimension(Number(millimeterMatch[2]) / 1000)
  }

  return result
}

export function exportMaterialName(material: MaterialNameParts) {
  const parts = [
    material.mat_name_en || material.mat_name_th,
    material.brand,
    material.model,
    material.spec,
  ].filter((part): part is string => Boolean(part?.trim()))

  return parts.reduce((name, part) => {
    return name.toLocaleLowerCase().includes(part.toLocaleLowerCase())
      ? name
      : `${name}${name ? ' ' : ''}${part}`
  }, '')
}
