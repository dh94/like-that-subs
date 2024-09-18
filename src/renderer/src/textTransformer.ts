import { charMap } from './charMap'

const maxLineWidth = 192

const calcTextWidth = (text: string): number => {
  let textWidth = 0

  for (const char of text) {
    textWidth += charMap[char]
  }
  return textWidth
}

export const transformTextList = (textList: string[]): [string, string][] => {
  const transformedList: [string, string][] = []

  let dou: string[] = []
  let douIndex = 0

  for (let i = 0; i < textList.length; i++) {
    const lines = textList[i].split(/(?<![.?;])[.?;](?![.?;])/).map((x) => x.trim())

    for (const line of lines) {
      const lineWidth = calcTextWidth(line)

      if (lineWidth <= maxLineWidth) {
        if (douIndex < 2) {
          dou[douIndex] = line
          douIndex++
        } else {
          transformedList.push([dou[0], dou[1]])
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

        for (const line of linesFitting) {
          if (douIndex < 2) {
            dou[douIndex] = line
            douIndex++
          } else {
            transformedList.push([dou[0], dou[1]])
            dou = [line]
            douIndex = 1
          }
        }
      }
    }
  }

  if (douIndex > 0) {
    transformedList.push([dou[0], dou[1]])
  }

  return transformedList
}
