import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TossAutoPilot',
  description: '토스증권 Open API 자동매매 웹'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
