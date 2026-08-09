'use client'

/** R0: 가벼운 마크다운 렌더 (제목·리스트·강조·코드) */
export function ReportBody({ markdown }: { markdown: string }) {
  const html = simpleMarkdownToHtml(markdown)
  return (
    <div
      className="report-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function simpleMarkdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inUl = false

  const flushUl = () => {
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }
  }

  for (const raw of lines) {
    const line = raw
    if (/^###\s+/.test(line)) {
      flushUl()
      out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`)
      continue
    }
    if (/^##\s+/.test(line)) {
      flushUl()
      out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`)
      continue
    }
    if (/^#\s+/.test(line)) {
      flushUl()
      out.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`)
      continue
    }
    if (/^>\s?/.test(line)) {
      flushUl()
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`)
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inUl) {
        out.push('<ul>')
        inUl = true
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`)
      continue
    }
    if (line.trim() === '') {
      flushUl()
      continue
    }
    flushUl()
    out.push(`<p>${inline(line)}</p>`)
  }
  flushUl()
  return out.join('\n')
}

function inline(s: string): string {
  let t = escapeHtml(s)
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/`([^`]+)`/g, '<code class="mono">$1</code>')
  t = t.replace(
    /\[e:([^\]]+)\]/g,
    '<sup class="ev-ref" title="evidence">[$1]</sup>'
  )
  t = t.replace(/\(카더라\)/g, '<mark class="kadara">(카더라)</mark>')
  return t
}
