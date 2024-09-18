import { useEffect, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CheckIcon } from '@radix-ui/react-icons'
import { motion, AnimatePresence } from 'framer-motion'
import DotPattern from '@renderer/components/magicui/dot-pattern'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from './lib/utils'
import textRaw from './HeathersScript.json'
import rotatingListTextRaw from './rotatingList.json'
import { Checkbox } from './components/ui/checkbox'
import { transformTextList } from './textTransformer'

const text = transformTextList(textRaw)
const rotatingListText = transformTextList(rotatingListTextRaw)

function App() {
  const [showCheckIcon, setShowCheckIcon] = useState(false)
  const [rotatingList, setRotatingList] = useState<boolean | 'indeterminate'>(false)
  const [visibleTexts, setVisibleTexts] = useState<[[string, string], number][]>([
    [[...text[0]], 1],
    [[...text[1]], 2],
    [[...text[2]], 3],
    [[...text[3]], 4]
  ])
  const [activeText, setActiveText] = useState(1)

  const onActiveTextChange = (newActiveTextIndex: number) => {
    const newText = text[newActiveTextIndex]

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
    try {
      window.electron.ipcRenderer.send('show_line', { line: newText })
    } catch (err) {
      console.error('whoops', err)
    }
  }

  useEffect(() => {
    if (rotatingList === true) {
      let i = 0

      window.electron.ipcRenderer.send('show_line', { line: rotatingListText[i] })
      const interval = setInterval(() => {
        i++
        if (i === rotatingListText.length) {
          i = 0
        }
        window.electron.ipcRenderer.send('show_line', { line: rotatingListText[i] })
      }, 5000)

      return () => clearInterval(interval)
    }
    return
  }, [rotatingList])

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
      }, 1000) // Hide after 1 second
    })
  }, [setShowCheckIcon])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || rotatingList === true) {
        return // Ignore keydown events if focused inside an input or textarea
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
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Current Line:</p>
          <p className="text-xl font-medium text-white">{activeText}</p>
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
                // Submit the form
                event.preventDefault()
                // Assuming you have a form submission function
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
            {visibleTexts.map(([text, id], index) => (
              <motion.div
                layout
                animate={{ scale: 1, opacity: index === 1 ? 1 : 0.7 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: 'just' }}
                key={id}
              >
                <p className={cn(index === 1 ? 'text-4xl' : 'text-2xl opacity-20', 'm-2 ')}>
                  {text?.[0]}
                </p>
                <p className={cn(index === 1 ? 'text-4xl' : 'text-2xl opacity-20', 'm-2 ')}>
                  {text?.[1]}
                </p>
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
