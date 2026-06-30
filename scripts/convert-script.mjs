import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import mammoth from 'mammoth'
import { parse } from 'csv-parse/sync'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DOCX_PATH = path.join(ROOT, 'dialogue_only_script.docx')
const CSV_PATH = path.join(ROOT, 'light-scene-raw.csv')
const OUTPUT_PATH = path.join(ROOT, 'src/renderer/src/HeathersScript.json')

function parseFxComment(comment) {
  const c = comment.trim().toLowerCase()
  if (!c) return { fx: 'abrupt', dur: 0 }
  if (c.includes('random flashes')) return { fx: 'flash', dur: 150 }
  if (c.includes('first l') && c.includes('later r')) return { fx: 'abrupt', dur: 0, stagger: 'L-first', staggerDelay: 300 }
  if (c.includes('first r') && c.includes('later l')) return { fx: 'abrupt', dur: 0, stagger: 'R-first', staggerDelay: 300 }
  if (c.includes('fast fade to black')) return { fx: 'fade', dur: 500 }
  if (c.includes('fade to black')) return { fx: 'fade', dur: 1500 }
  if (c.includes('fast fade in') || c.includes('quick fade in')) return { fx: 'fade', dur: 500 }
  if (c.includes('abrupt')) return { fx: 'abrupt', dur: 0 }
  if (c.includes('fade in')) return { fx: 'fade', dur: 1500 }
  if (c === 'hold') return { fx: 'abrupt', dur: 0 }
  return { fx: 'abrupt', dur: 0 }
}

async function extractDialogue() {
  const result = await mammoth.extractRawText({ path: DOCX_PATH })
  const lines = result.value
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
  return lines
}

function parseCsv() {
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8')
  const records = parse(csvContent, { relax_column_count: true, skip_empty_lines: false })

  const cues = []
  let currentScene = ''
  let pastCutoff = false

  for (let i = 1; i < records.length; i++) {
    const row = records[i]
    if (!row || row.every(cell => !cell.trim())) continue

    const sceneNumber = row[0]?.trim() || ''
    if (sceneNumber) currentScene = sceneNumber

    const sceneType = row[1]?.trim() || ''
    const sceneName = row[2]?.trim() || ''

    // Stop after scene 6 "La Dee Da Da Day"
    // if (pastCutoff) break
    if (currentScene === '6' || sceneName.toLowerCase().includes('la dee da da day')) {
      pastCutoff = true
    }

    const subScene = row[3]?.trim() || ''
    const subsRange = row[4]?.trim() || ''
    const colors = row.slice(5, 19).map(c => c.trim())
    const comment = row[19]?.trim() || ''

    if (colors.length < 14 || colors.every(c => !c)) continue

    const fxData = parseFxComment(comment)

    cues.push({
      sceneNumber: currentScene,
      subScene,
      subsRange,
      colors,
      comment,
      ...fxData
    })
  }

  return cues
}

function normalize(text) {
  return text
    .replace(/[‘’‚`]/g, String.fromCharCode(39))
    .replace(/[“”„]/g, String.fromCharCode(34))
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
}

// Manual overrides: CSV text (after normalize + lowercase) → actual dialogue text
const MATCH_OVERRIDES = {
  '[thunder]': { insertBefore: true, text: '[Thunder]' },
  'what a bitch!': { match: 'what a dick!' },
  'the guy who didn\'t like musicals!': { match: 'the guy who didn\'t like musicals!' },
  'it\'s the end of the world paul,': { match: 'it\'s the end of the world, paul' },
  'paul you piece of shit!': { match: 'paul, you piece of shit!' },
  'what is... that?': { match: 'what... is... that?' },
  'holy molly! it\'s raining cats and dogs!': { match: 'holy hell! it\'s raining cats and dogs' },
  'it\'s showtime!': { insertBefore: true, text: "It's showtime!" },
  '[thunder boom boom boom]': { insertBefore: true, text: '[Thunder boom boom boom]' },
  '[tv turns off]': { insertBefore: true, text: '[TV turns off]' },
}

function matchAndMerge(dialogueLines, cues) {
  const entries = dialogueLines.map(text => ({ text: normalize(text) }))

  let lastMatchedIndex = -1

  for (const cue of cues) {
    if (!cue.subsRange) {
      // Empty subs-range: look for a (----) line after last match, or insert one
      let found = false
      for (let i = lastMatchedIndex + 1; i < entries.length && i < lastMatchedIndex + 5; i++) {
        if (entries[i].text.includes('(----)') || entries[i].text === '') {
          entries[i].text = ''
          entries[i].lights = cue.colors
          entries[i].fx = cue.fx
          entries[i].dur = cue.dur
          if (cue.stagger) {
            entries[i].stagger = cue.stagger
            entries[i].staggerDelay = cue.staggerDelay
          }
          lastMatchedIndex = i
          found = true
          break
        }
      }
      if (!found) {
        const insertIndex = lastMatchedIndex + 1
        const entry = {
          text: '',
          lights: cue.colors,
          fx: cue.fx,
          dur: cue.dur
        }
        if (cue.stagger) {
          entry.stagger = cue.stagger
          entry.staggerDelay = cue.staggerDelay
        }
        entries.splice(insertIndex, 0, entry)
        lastMatchedIndex = insertIndex
      }
      continue
    }

    const searchText = normalize(cue.subsRange.toLowerCase())
    const override = MATCH_OVERRIDES[searchText]

    // If override says to insert a new line (stage direction not in dialogue)
    if (override && 'insertBefore' in override) {
      const insertIndex = lastMatchedIndex + 1
      const entry = {
        text: override.text || cue.subsRange,
        lights: cue.colors,
        fx: cue.fx,
        dur: cue.dur
      }
      if (cue.stagger) {
        entry.stagger = cue.stagger
        entry.staggerDelay = cue.staggerDelay
      }
      entries.splice(insertIndex, 0, entry)
      lastMatchedIndex = insertIndex
      continue
    }

    const actualSearch = normalize((override && override.match) ? override.match.toLowerCase() : searchText)
    let found = false

    for (let i = lastMatchedIndex + 1; i < entries.length; i++) {
      const normalizedLine = normalize(entries[i].text.toLowerCase())
      const matchIndex = normalizedLine.indexOf(actualSearch)
      if (matchIndex === -1) continue

      // If the match starts mid-line, split the line
      if (matchIndex > 0) {
        const originalText = entries[i].text
        // Find the split point in the original text (accounting for normalization)
        // Use a case-insensitive search on the original
        const origLower = originalText.toLowerCase()
        const normalizedOrig = normalize(origLower)
        const splitPos = normalizedOrig.indexOf(actualSearch)
        // Map back to original string position - find the corresponding position
        // by finding the cue text in the original (case-insensitive)
        let splitAt = -1
        for (let p = 0; p <= originalText.length; p++) {
          if (normalize(originalText.slice(p).toLowerCase()).startsWith(actualSearch)) {
            splitAt = p
            break
          }
        }
        if (splitAt > 0) {
          const before = originalText.slice(0, splitAt).trim()
          const after = originalText.slice(splitAt).trim()
          entries[i].text = before
          const newEntry = {
            text: after,
            lights: cue.colors,
            fx: cue.fx,
            dur: cue.dur
          }
          if (cue.stagger) {
            newEntry.stagger = cue.stagger
            newEntry.staggerDelay = cue.staggerDelay
          }
          entries.splice(i + 1, 0, newEntry)
          lastMatchedIndex = i + 1
          found = true
          break
        }
      }

      // Match is at the start of the line (or split failed) — attach directly
      if (!found) {
        entries[i].lights = cue.colors
        entries[i].fx = cue.fx
        entries[i].dur = cue.dur
        if (cue.stagger) {
          entries[i].stagger = cue.stagger
          entries[i].staggerDelay = cue.staggerDelay
        }
        lastMatchedIndex = i
        found = true
        break
      }
    }

    if (!found) {
      console.warn(`⚠️  Could not match cue: "${cue.subsRange}" (scene ${cue.sceneNumber}, sub ${cue.subScene})`)
    }
  }

  return entries
}

async function main() {
  console.log('Extracting dialogue from .docx...')
  const dialogueLines = await extractDialogue()
  console.log(`  Found ${dialogueLines.length} dialogue lines`)

  console.log('Parsing lighting CSV...')
  const cues = parseCsv()
  console.log(`  Found ${cues.length} lighting cues (through "La Dee Da Da Day")`)

  console.log('\nCues parsed:')
  for (const cue of cues) {
    console.log(`  [${cue.subScene}] "${cue.subsRange || '(empty)'}" → ${cue.fx}/${cue.dur}ms ${cue.stagger ? `(${cue.stagger})` : ''}`)
  }

  console.log('\nMatching and merging...')
  const scriptEntries = [{ text: '' }, ...matchAndMerge(dialogueLines, cues)]
  console.log(`  Output: ${scriptEntries.length} total entries`)

  const withLighting = scriptEntries.filter(e => e.lights)
  console.log(`  Entries with lighting: ${withLighting.length}`)

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(scriptEntries, null, 2))
  console.log(`\nWritten to ${OUTPUT_PATH}`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
