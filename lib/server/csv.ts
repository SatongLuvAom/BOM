import { NextResponse } from 'next/server'

export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  return [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\r\n')
}

export function csvResponse(filename: string, csv: string) {
  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

export function datedCsvFilename(prefix: string) {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}.csv`
}
