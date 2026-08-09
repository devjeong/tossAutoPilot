import { chromium } from 'playwright'
import { readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const mockDir = join(root, 'mockups')
const outDir = join(root, 'screenshots')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const files = readdirSync(mockDir)
  .filter((f) => f.endsWith('.html'))
  .sort()

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2
})

for (const file of files) {
  const url = pathToFileURL(join(mockDir, file)).href
  const out = join(outDir, file.replace(/\.html$/, '.png'))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.screenshot({ path: out, fullPage: false })
  console.log('wrote', out)
}

await browser.close()
console.log('done', files.length)
