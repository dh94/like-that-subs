import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CheckIcon } from '@radix-ui/react-icons'
import DotPattern from '@renderer/components/magicui/dot-pattern'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from './lib/utils'
import textRaw from './HeathersScript.json'
import rotatingListTextRaw from './RotatingList.json'
import tieCuesRaw from './TieCues.json'
import { Checkbox } from './components/ui/checkbox'
import { transformTextList } from './textTransformer'

const text = transformTextList(textRaw as string[])
const rotatingListText = transformTextList(rotatingListTextRaw as string[])

type TieEffect = 'on' | 'off' | 'slow_blink' | 'fast_blink'
const tieCues = tieCuesRaw as Record<string, TieEffect>

const TIE_LABELS: Record<TieEffect, string> = {
  on: 'ON',
  off: 'OFF',
  slow_blink: 'SLOW BLINK',
  fast_blink: 'FAST BLINK'
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
  const [currentTie, setCurrentTie] = useState<TieEffect>('off')
  const [activeText, setActiveText] = useState(1)
  const activeLineRef = useRef<HTMLDivElement>(null)

  const onActiveTextChange = (newActiveTextIndex: number) => {
    const newEntry = text[newActiveTextIndex]

    ;(document.getElementById('number-input') as HTMLInputElement).value =
      newActiveTextIndex.toString()
    setActiveText(newActiveTextIndex)
    localStorage.setItem('TEXT_INDEX', newActiveTextIndex.toString())

    const tie = tieCues[String(newActiveTextIndex)]
    if (tie) setCurrentTie(tie)

    try {
      window.electron.ipcRenderer.send('show_line', {
        line: newEntry.lines,
        tie
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
    activeLineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeText])

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
          <div className="flex items-center space-x-1" title="Current tie effect">
            <span className="text-xs font-medium">Tie:</span>
            <span className="text-xs font-mono font-bold text-white">{TIE_LABELS[currentTie]}</span>
          </div>
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
        <div className="flex flex-col items-center h-[80%] w-full overflow-y-auto py-[40vh] no-scrollbar">
          {text.map((entry, index) => {
            const isActive = index === activeText
            const isEmpty =
              entry?.lines?.[0]?.trim() === '' && entry?.lines?.[1]?.trim() === ''
            const tieCue = tieCues[String(index)]
            return (
              <div
                key={index}
                ref={isActive ? activeLineRef : undefined}
                className={cn(
                  'flex items-center gap-6 my-2 transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-30'
                )}
              >
                <div className="flex flex-col items-center">
                  <p className={cn(isActive ? 'text-4xl' : 'text-2xl', 'm-1')}>
                    {isEmpty ? '<EMPTY>' : entry?.lines?.[0]}
                  </p>
                  <p className={cn(isActive ? 'text-4xl' : 'text-2xl', 'm-1')}>
                    {entry?.lines?.[1]}
                  </p>
                  {tieCue && (
                    <span className="mt-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-500 text-white">
                      TIE: {TIE_LABELS[tieCue]}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    'font-mono tabular-nums text-teal-500 shrink-0',
                    isActive ? 'text-2xl' : 'text-lg'
                  )}
                >
                  {index}
                </span>
              </div>
            )
          })}
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
