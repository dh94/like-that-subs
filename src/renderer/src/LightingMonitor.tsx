import { useEffect, useState, useRef } from 'react'
import { colorMap } from './colorMap'

interface DeviceState {
  connected: boolean
  r: number
  g: number
  b: number
  fx: string
  dur: number
  startedAt: number
}

const DEVICE_COUNT = 14

const CYCLE_COLORS: [number, number, number][] = [
  [100, 149, 237], // light blue
  [128, 0, 128],   // purple
  [255, 105, 180], // pink
  [0, 206, 209],   // torquoise
  [50, 180, 50],   // green
  [255, 220, 100], // soft yellow
  [0, 0, 255],     // blue
]

function FxProgressBar({ fx, dur, startedAt }: { fx: string; dur: number; startedAt: number }) {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!dur || dur === 0 || fx === 'none' || fx === 'abrupt') {
      setProgress(1)
      return
    }

    const animate = () => {
      const elapsed = Date.now() - startedAt
      const p = Math.min(elapsed / dur, 1)
      setProgress(p)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [fx, dur, startedAt])

  const isActive = fx !== 'none' && fx !== 'abrupt' && dur > 0 && progress < 1

  return (
    <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden border border-gray-600">
      <div
        className="h-full rounded-full transition-none"
        style={{
          width: `${progress * 100}%`,
          backgroundColor: isActive ? '#14b8a6' : '#4b5563'
        }}
      />
    </div>
  )
}

function LightingMonitor() {
  const [devices, setDevices] = useState<DeviceState[]>(
    Array.from({ length: DEVICE_COUNT }, () => ({
      connected: false,
      r: 0,
      g: 0,
      b: 0,
      fx: 'none',
      dur: 0,
      startedAt: 0
    }))
  )
  const [cycleMode, setCycleMode] = useState(false)
  const cycleRef = useRef<NodeJS.Timeout | null>(null)
  const cycleIndexRef = useRef(0)

  useEffect(() => {
    window.electron.ipcRenderer.on('lighting_state_update', (_event, data) => {
      setDevices(data.devices)
    })

    window.electron.ipcRenderer.send('lighting_monitor_ready')

    const interval = setInterval(() => {
      window.electron.ipcRenderer.send('lighting_monitor_poll')
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (cycleMode) {
      cycleIndexRef.current = 0
      sendCycleColor(0)

      cycleRef.current = setInterval(() => {
        cycleIndexRef.current = (cycleIndexRef.current + 1) % CYCLE_COLORS.length
        sendCycleColor(cycleIndexRef.current)
      }, 4000)
    } else {
      if (cycleRef.current) {
        clearInterval(cycleRef.current)
        cycleRef.current = null
      }
    }

    return () => {
      if (cycleRef.current) {
        clearInterval(cycleRef.current)
      }
    }
  }, [cycleMode])

  const sendCycleColor = (index: number) => {
    const cues = Array.from({ length: DEVICE_COUNT }, (_, i) => {
      const offset = (index + i) % CYCLE_COLORS.length
      const c = CYCLE_COLORS[offset]
      return { id: i + 1, r: c[0], g: c[1], b: c[2], fx: 'fade', dur: 3000 }
    })
    window.electron.ipcRenderer.send('lighting_cycle', { cues })
  }

  const activeFx = devices[0]?.fx ?? 'none'
  const activeDur = devices[0]?.dur ?? 0
  const activeStartedAt = devices[0]?.startedAt ?? 0

  return (
    <div className="h-screen bg-gray-900 text-white p-6 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Lighting Monitor</h1>
        <button
          onClick={() => setCycleMode(!cycleMode)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            cycleMode
              ? 'bg-orange-500 hover:bg-orange-600'
              : 'bg-teal-500 hover:bg-teal-600'
          }`}
        >
          {cycleMode ? 'Stop Cycle' : 'Start Cycle Mode'}
        </button>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-gray-400 uppercase">
            {activeFx !== 'none' && activeFx !== 'abrupt' ? activeFx : 'idle'}
          </span>
          {activeDur > 0 && activeFx !== 'abrupt' && (
            <span className="text-xs text-gray-500">{activeDur}ms</span>
          )}
        </div>
        <FxProgressBar fx={activeFx} dur={activeDur} startedAt={activeStartedAt} />
      </div>

      {cycleMode && (
        <div className="mb-4 px-3 py-2 bg-orange-500/20 border border-orange-500/40 rounded-lg text-orange-300 text-sm">
          Cycle mode active — smooth color wave across all components
        </div>
      )}

      <div className="grid grid-cols-7 gap-3">
        {devices.map((device, i) => (
          <div
            key={i}
            className={`relative rounded-xl border p-3 flex flex-col items-center gap-2 transition-all ${
              device.connected
                ? 'border-gray-600 bg-gray-800'
                : 'border-red-800/50 bg-gray-800/50 opacity-60'
            }`}
          >
            <div className="text-xs font-mono text-gray-400">#{i + 1}</div>

            <div
              className="w-12 h-12 rounded-lg border-2 border-gray-600 transition-colors duration-500"
              style={{
                backgroundColor: `rgb(${device.r}, ${device.g}, ${device.b})`,
                boxShadow:
                  device.r + device.g + device.b > 30
                    ? `0 0 12px rgba(${device.r}, ${device.g}, ${device.b}, 0.5)`
                    : 'none'
              }}
            />

            <div
              className={`w-2 h-2 rounded-full ${
                device.connected ? 'bg-green-400' : 'bg-red-500'
              }`}
              title={device.connected ? 'Connected' : 'Disconnected'}
            />

            {device.fx !== 'none' && device.fx !== 'abrupt' && (
              <div className="text-[10px] font-mono text-gray-500 uppercase">
                {device.fx}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2 flex-wrap">
        <span className="text-xs text-gray-500">Color legend:</span>
        {Object.entries(colorMap).map(([name, rgb]) => (
          <div key={name} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-sm border border-gray-600"
              style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
            />
            <span className="text-[10px] text-gray-500">{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LightingMonitor
