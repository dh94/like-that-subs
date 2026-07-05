import { charMap } from './charMap'

const maxLineWidth = 192

export interface ScriptEntry {
  text: string
}

export interface TransformedEntry {
  lines: [string, string]
}

const calcTextWidth = (text: string): number => {
  let textWidth = 0
  for (const char of text) {
    textWidth += charMap[char]
  }
  return textWidth
}

const textToScreenLines = (text: string): number => {
  const linesFitting: string[] = []
  const words = text.split(' ')
  let currentLineLen = 0
  let currentLine = ''

  for (const word of words) {
    const wordLen = calcTextWidth(word)
    if (currentLineLen + wordLen <= maxLineWidth) {
      currentLineLen += wordLen + charMap[' ']
      currentLine += word + ' '
    } else if (wordLen > maxLineWidth) {
      console.error('!! word too long for line', word)
    } else {
      linesFitting.push(currentLine.trim())
      currentLine = word + ' '
      currentLineLen = wordLen
    }
  }
  if (currentLineLen > 0) {
    linesFitting.push(currentLine.trim())
  }

  return linesFitting.length
}

export const transformTextList = (textList: string[] | ScriptEntry[]): TransformedEntry[] => {
  const entries: ScriptEntry[] =
    typeof textList[0] === 'string'
      ? (textList as string[]).map((text) => ({ text }))
      : (textList as ScriptEntry[])

  const transformedList: TransformedEntry[] = []

  let dou: string[] = []
  let douIndex = 0

  const flush = () => {
    if (douIndex > 0) {
      transformedList.push({
        lines: [dou[0] ?? '', dou[1] ?? '']
      })
      dou = []
      douIndex = 0
    }
  }

  for (let i = 0; i < entries.length; i++) {
    if (douIndex > 0) {
      flush()
    }

    const entry = entries[i]
    const ogLine = entry.text
    const ogLineScreenLines = textToScreenLines(ogLine)

    let lines: string[] = []
    if (ogLineScreenLines <= 2) {
      lines = [ogLine]
    } else {
      lines = ogLine.split(/(?<![.?;])[.?;](?![.?;])/).map((x) => x.trim())
    }

    for (const line of lines) {
      const lineWidth = calcTextWidth(line)

      if (lineWidth <= maxLineWidth) {
        if (douIndex < 2) {
          dou[douIndex] = line
          douIndex++
        } else {
          transformedList.push({
            lines: [dou[0], dou[1]]
          })
          dou = [line]
          douIndex = 1
        }
      } else {
        const linesFitting: string[] = []
        const words = line.split(' ')
        let currentLineLen = 0
        let currentLine = ''

        for (const word of words) {
          const wordLen = calcTextWidth(word)
          if (currentLineLen + wordLen <= maxLineWidth) {
            currentLineLen += wordLen + charMap[' ']
            currentLine += word + ' '
          } else if (wordLen > maxLineWidth) {
            console.error('!! word too long for line', word)
          } else {
            linesFitting.push(currentLine.trim())
            currentLine = word + ' '
            currentLineLen = wordLen
          }
        }
        if (currentLineLen > 0) {
          linesFitting.push(currentLine.trim())
        }

        for (const fittedLine of linesFitting) {
          if (douIndex < 2) {
            dou[douIndex] = fittedLine
            douIndex++
          } else {
            transformedList.push({
              lines: [dou[0], dou[1]]
            })
            dou = [fittedLine]
            douIndex = 1
          }
        }
      }
    }
  }

  if (douIndex > 0) {
    transformedList.push({
      lines: [dou[0] ?? '', dou[1] ?? '']
    })
  }

  return transformedList
}
