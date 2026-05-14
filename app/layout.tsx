import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BOQ System — Material Master',
  description: 'Material Master Management System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="antialiased selection:bg-neutral-950 selection:text-white">
        {children}
      </body>
    </html>
  )
}
