import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import mammoth from 'mammoth'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DOCX_PATH = path.join(ROOT, 'dialogue_only_script.docx')
const OUTPUT_PATH = path.join(ROOT, 'src/renderer/src/HeathersScript.json')

function normalize(text) {
  return text
    .replace(/[‘’‚`]/g, String.fromCharCode(39))
    .replace(/[“”„]/g, String.fromCharCode(34))
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
}

// Put this marker on its own line in the .docx to force a blank teleprompter card there.
// (The .docx is double-spaced, so genuinely empty paragraphs can't be told apart from the
// automatic spacing and are dropped — an explicit marker survives the filter below.)
const BLANK_MARKER = /^\[blank\]$/i

async function extractDialogue() {
  const result = await mammoth.extractRawText({ path: DOCX_PATH })
  return result.value
    .split('\n')
    .map((l) => normalize(l))
    .filter((l) => l.length > 0)
    .map((l) => (BLANK_MARKER.test(l) ? '' : l))
}

async function main() {
  console.log('Extracting dialogue from .docx...')
  const dialogueLines = await extractDialogue()
  console.log(`  Found ${dialogueLines.length} dialogue lines`)

  // Leading empty entry keeps line index 1 as the first real line (matches teleprompter start)
  const scriptEntries = ['', ...dialogueLines]

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(scriptEntries, null, 2))
  console.log(`Written ${scriptEntries.length} entries (text-only) to ${OUTPUT_PATH}`)
  console.log('\nTie cues live separately in src/renderer/src/TieCues.json,')
  console.log('keyed by teleprompter line number → "on" | "off" | "slow_blink" | "fast_blink".')
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
