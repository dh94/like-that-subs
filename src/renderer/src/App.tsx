import { useEffect, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CheckIcon } from '@radix-ui/react-icons'
import { motion, AnimatePresence } from 'framer-motion'
import DotPattern from '@renderer/components/magicui/dot-pattern'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from './lib/utils'
import textRaw from './HeathersScript.json'
import rotatingListTextRaw from './RotatingList.json'
import { Checkbox } from './components/ui/checkbox'
import { transformTextList, TransformedEntry } from './textTransformer'
import { colorMap } from './colorMap'

const text = transformTextList(textRaw)
const rotatingListText = transformTextList(rotatingListTextRaw)

function LightingPreview({ lights }: { lights: string[] }) {
  return (
    <div className="flex gap-1 justify-center mt-2">
      {lights.map((color, i) => {
        const rgb = colorMap[color] ?? [80, 80, 80]
        return (
          <div
            key={i}
            className="w-5 h-5 rounded-sm border border-gray-400"
            style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
            title={`${i + 1}: ${color}`}
          />
        )
      })}
    </div>
  )
}

function SubtitleStatus({ connectedIds }: { connectedIds: number[] }) {
  const panels = [
    { id: 1, label: 'L' },
    { id: 2, label: 'R' }
  ]
  return (
    <div className="flex items-center gap-2">
      {panels.map((panel) => {
        const connected = connectedIds.includes(panel.id)
        return (
          <div key={panel.id} className="flex items-center gap-1" title={`Screen ${panel.label} (Device ${panel.id})`}>
            <div
              className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500 animate-pulse'}`}
            />
            <span className="text-xs font-mono">{panel.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function App() {
  const [showCheckIcon, setShowCheckIcon] = useState(false)
  const [rotatingList, setRotatingList] = useState<boolean | 'indeterminate'>(false)
  const [connectedSubtitleDevices, setConnectedSubtitleDevices] = useState<number[]>([])
  const [currentLighting, setCurrentLighting] = useState<string[]>(
    Array(14).fill('bla')
  )
  const [visibleTexts, setVisibleTexts] = useState<[TransformedEntry, number][]>([
    [text[0], 1],
    [text[1], 2],
    [text[2], 3],
    [text[3], 4]
  ])
  const [activeText, setActiveText] = useState(1)

  const resolveLighting = (entry: TransformedEntry) => {
    if (entry.lighting) {
      setCurrentLighting(entry.lighting.lights)
      const cues = entry.lighting.lights.map((color, i) => {
        const rgb = colorMap[color] ?? [0, 0, 0]
        return { id: i + 1, r: rgb[0], g: rgb[1], b: rgb[2], fx: entry.lighting!.fx, dur: entry.lighting!.dur }
      })
      return { cues }
    }
    return undefined
  }

  const onActiveTextChange = (newActiveTextIndex: number) => {
    const newEntry = text[newActiveTextIndex]

    setVisibleTexts([
      [text[newActiveTextIndex - 1], newActiveTextIndex - 1],
      [text[newActiveTextIndex], newActiveTextIndex],
      [text[newActiveTextIndex + 1], newActiveTextIndex + 1],
      [text[newActiveTextIndex + 2], newActiveTextIndex + 2]
    ])
    ;(document.getElementById('number-input') as HTMLInputElement).value =
      newActiveTextIndex.toString()
    setActiveText(newActiveTextIndex)
    localStorage.setItem('TEXT_INDEX', newActiveTextIndex.toString())

    const lighting = resolveLighting(newEntry)

    try {
      window.electron.ipcRenderer.send('show_line', {
        line: newEntry.lines,
        lighting
      })
    } catch (err) {
      console.error('whoops', err)
    }
  }

  useEffect(() => {
    if (rotatingList === true) {
      let i = 0
      const entry = rotatingListText[i]
      window.electron.ipcRenderer.send('show_line', { line: entry.lines })
      const interval = setInterval(() => {
        i++
        if (i === rotatingListText.length) {
          i = 0
        }
        window.electron.ipcRenderer.send('show_line', { line: rotatingListText[i].lines })
      }, 5000)

      return () => clearInterval(interval)
    }
    return
  }, [rotatingList])

  useEffect(() => {
    window.electron.ipcRenderer.on('subtitle_status_update', (_event, data) => {
      setConnectedSubtitleDevices(data.devices)
    })
    window.electron.ipcRenderer.send('subtitle_status_poll')
    const interval = setInterval(() => {
      window.electron.ipcRenderer.send('subtitle_status_poll')
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (localStorage.getItem('TEXT_INDEX') !== null) {
      onActiveTextChange(Number.parseInt(localStorage.getItem('TEXT_INDEX')!, 10))
    }
  }, [])

  useEffect(() => {
    window.electron.ipcRenderer.on('show_line_ack', () => {
      setShowCheckIcon(true)
      setTimeout(() => {
        setShowCheckIcon(false)
      }, 1000)
    })
  }, [setShowCheckIcon])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || rotatingList === true) {
        return
      }

      if (event.key === 'ArrowLeft') {
        onActiveTextChange(activeText - 1)
      } else if (event.key === 'ArrowRight') {
        onActiveTextChange(activeText + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeText, rotatingList])

  return (
    <div className="h-full">
      <div className="w-full absolute flex items-center justify-between space-x-2 p-4 px-6 z-50 bg-teal-300">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Current Line:</p>
            <p className="text-xl font-medium text-white">{activeText}</p>
          </div>
          <SubtitleStatus connectedIds={connectedSubtitleDevices} />
        </div>
        <form
          className="flex items-center space-x-2"
          onSubmit={() => {
            onActiveTextChange(
              Number.parseInt(
                (document.getElementById('number-input') as HTMLInputElement).value,
                10
              )
            )
          }}
        >
          <Input
            id="number-input"
            type="number"
            defaultValue={activeText}
            placeholder="Line number"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onActiveTextChange(
                  Number.parseInt(
                    (document.getElementById('number-input') as HTMLInputElement).value,
                    10
                  )
                )
              }
            }}
          />
          <Button type="submit" disabled={rotatingList === true}>
            Go to line
          </Button>
        </form>
      </div>
      <div className="p-20 flex flex-col h-[100vh] w-[100vw] items-center justify-center overflow-hidden bg-background">
        <div className="flex flex-col h-full items-center h-[80%] bg-red bg-opacity-100">
          <AnimatePresence mode={'popLayout'}>
            {visibleTexts.map(([entry, id], index) => (
              <motion.div
                layout
                animate={{ scale: 1, opacity: index === 1 ? 1 : 0.7 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: 'just' }}
                key={id}
              >
                <p className={cn(index === 1 ? 'text-4xl' : 'text-2xl opacity-20', 'm-2 ')}>
                  {entry?.lines?.[0]?.trim() === '' && entry?.lines?.[1]?.trim() === ''
                    ? '<EMPTY>'
                    : entry?.lines?.[0]}
                </p>
                <p className={cn(index === 1 ? 'text-4xl' : 'text-2xl opacity-20', 'm-2 ')}>
                  {entry?.lines?.[1]}
                </p>
                {index === 1 && <LightingPreview lights={currentLighting} />}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <DotPattern
          width={16}
          height={16}
          x={10}
          y={10}
          cx={1}
          cy={1}
          cr={1}
          className={
            'w-full h-full [mask-image:linear-gradient(to_bottom_right,white,transparent,transparent)]'
          }
        />
      </div>
      <div className="fixed bottom-0 left-0 flex flex-col w-full items-center justify-center">
        <div className="h-5 flex w-full justify-end">
          {showCheckIcon && <CheckIcon className="h-5 w-5 mr-5" />}
        </div>
        <div className="flex w-full justify-around">
          <div className="flex space-x-2 p-4 px-6 bg-teal-300/15 rounded-xl">
            <Input
              id="text-input"
              type="text"
              placeholder="Custom line to display"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  const newText = (document.getElementById('text-input') as HTMLInputElement).value
                  window.electron.ipcRenderer.send('show_line', { line: [newText, ''] })
                }
              }}
            />
            <Button
              onClick={() => {
                const newText = (document.getElementById('text-input') as HTMLInputElement).value
                window.electron.ipcRenderer.send('show_line', { line: [newText, ''] })
              }}
              disabled={rotatingList === true}
            >
              Send
            </Button>
          </div>
          <div className="p-4 px-6 bg-teal-300/15 rounded-xl">
            <Button
              onClick={() => {
                window.electron.ipcRenderer.send('show_line', { line: ['', ''] })
              }}
              disabled={rotatingList === true}
            >
              Blank
            </Button>
          </div>
          <div className="p-4 px-6 bg-teal-300/15 rounded-xl flex items-center space-x-2">
            <Checkbox name="rotating-list" onCheckedChange={setRotatingList}>
              Rotating List
            </Checkbox>
            <label
              htmlFor="rotating-list"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Rotating List
            </label>
          </div>
        </div>
        <div>
          <Button
            disabled={activeText === 0 || rotatingList === true}
            className="min-w-20 m-5 px-7"
            onClick={() => onActiveTextChange(activeText - 1)}
          >
            Previous <ChevronUpIcon className="ml-2" />
          </Button>
          <Button
            className="min-w-20 m-5 px-7"
            disabled={activeText === text.length - 1 || rotatingList === true}
            onClick={() => onActiveTextChange(activeText + 1)}
          >
            Next <ChevronDownIcon className="ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default App
