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

const DEVICE_COUNT = 15

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
    <div className="w-full h-3 rounded-full overflow-hidden border border-cyan-900/50" style={{ backgroundColor: '#0a1628' }}>
      <div
        className="h-full rounded-full transition-none"
        style={{
          width: `${progress * 100}%`,
          backgroundColor: isActive ? '#00E5FF' : '#1e3a5f',
          boxShadow: isActive ? '0 0 8px #00E5FF' : 'none'
        }}
      />
    </div>
  )
}

function DeviceCell({ device, index, wide }: { device: DeviceState; index: number; wide?: boolean }) {
  const glowColor = `rgba(${device.r}, ${device.g}, ${device.b}, 0.6)`

  return (
    <div
      className={`relative rounded-xl border p-2 flex items-center gap-3 transition-all ${
        wide ? 'justify-center' : ''
      } ${
        device.connected
          ? 'border-cyan-800/40'
          : 'border-red-900/40 opacity-40'
      }`}
      style={{
        backgroundColor: `rgba(${device.r}, ${device.g}, ${device.b}, 0.15)`,
        boxShadow: `inset 0 0 24px rgba(${device.r}, ${device.g}, ${device.b}, 0.25), 0 0 12px rgba(${device.r}, ${device.g}, ${device.b}, 0.3)`
      }}
    >
      <div
        className="w-8 h-8 rounded-lg border border-white/10 transition-colors duration-500 shrink-0"
        style={{
          backgroundColor: `rgb(${device.r}, ${device.g}, ${device.b})`,
          boxShadow: `0 0 14px ${glowColor}`
        }}
      />
      <div className="flex flex-col items-start">
        <div className="text-xs font-bold text-cyan-200">#{index + 1}</div>
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            device.connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-500'
          }`}
        />
      </div>
      {device.fx !== 'none' && device.fx !== 'abrupt' && (
        <div className="absolute top-1 right-2 text-[9px] font-mono uppercase" style={{ color: '#00E5FF' }}>
          {device.fx}
        </div>
      )}
    </div>
  )
}

function TieDevice({ device }: { device: DeviceState }) {
  const glowColor = `rgba(${device.r}, ${device.g}, ${device.b}, 0.6)`
  const color = `rgb(${device.r}, ${device.g}, ${device.b})`
  const isOff = device.r === 0 && device.g === 0 && device.b === 0

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border p-4 ${
        device.connected ? 'border-cyan-800/40' : 'border-red-900/40 opacity-40'
      }`}
      style={{
        backgroundColor: `rgba(${device.r}, ${device.g}, ${device.b}, 0.1)`,
        boxShadow: isOff ? 'none' : `0 0 24px ${glowColor}`,
        minWidth: '80px'
      }}
    >
      <div className="text-xs font-mono uppercase tracking-wider mb-2 text-center" style={{ color: '#00B0FF' }}>Tie</div>
      <svg
        width="40"
        height="160"
        viewBox="0 0 40 160"
        style={{ filter: isOff ? 'none' : `drop-shadow(0 0 10px ${glowColor})` }}
      >
        {/* Collar wings */}
        <path
          d="M8 8 L20 20 L32 8 L28 0 L12 0 Z"
          fill={color}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.5"
        />
        {/* Knot */}
        <path
          d="M14 18 L20 24 L26 18 L24 14 L16 14 Z"
          fill={color}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.5"
        />
        {/* Main blade - widens then tapers to point */}
        <path
          d="M16 24 L12 60 L10 100 L14 130 L20 148 L26 130 L30 100 L28 60 L24 24 Z"
          fill={color}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.5"
        />
        {/* Subtle center crease line */}
        <line
          x1="20" y1="28" x2="20" y2="145"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.5"
        />
      </svg>
      <div className="mt-2 flex items-center gap-1">
        <div className="text-xs font-bold text-cyan-200">#15</div>
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            device.connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-500'
          }`}
        />
      </div>
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
  const [lightingMode, setLightingMode] = useState<'websocket' | 'sacn' | 'sacn-bridge' | 'artnet-bridge'>('sacn-bridge')
  const cycleRef = useRef<NodeJS.Timeout | null>(null)
  const cycleIndexRef = useRef(0)

  useEffect(() => {
    window.electron.ipcRenderer.on('lighting_state_update', (_event, data) => {
      setDevices(data.devices)
    })

    window.electron.ipcRenderer.on('lighting_mode_update', (_event, mode) => {
      setLightingMode(mode)
    })

    window.electron.ipcRenderer.send('lighting_monitor_ready')
    window.electron.ipcRenderer.send('get_lighting_mode')

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
    <div className="h-screen p-6 overflow-auto" style={{ background: 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #0d1f3c 100%)', color: '#e0f7fa' }}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold" style={{ color: '#00E5FF', textShadow: '0 0 10px rgba(0,229,255,0.4)' }}>Lighting Monitor</h1>
        <div className="flex items-center gap-3">
          <select
            value={lightingMode}
            onChange={(e) => {
              const mode = e.target.value as typeof lightingMode
              setLightingMode(mode)
              window.electron.ipcRenderer.send('set_lighting_mode', mode)
            }}
            className="rounded-lg px-3 py-2 text-xs font-mono cursor-pointer outline-none"
            style={{ backgroundColor: 'rgba(10,22,40,0.8)', border: '1px solid rgba(0,176,255,0.3)', color: '#e0f7fa' }}
          >
            <option value="websocket">WS (Electron controls)</option>
            <option value="sacn">sACN Direct (grandMA2 → ESP)</option>
            <option value="sacn-bridge">sACN Bridge (grandMA2 → Electron → ESP)</option>
            <option value="artnet-bridge">ArtNet Bridge (grandMA2 → Electron → ESP)</option>
          </select>
          <button
            onClick={() => setCycleMode(!cycleMode)}
            disabled={lightingMode === 'sacn'}
            className="px-4 py-2 rounded-lg font-medium transition-all text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: cycleMode ? '#ff6b35' : '#0077FF',
              boxShadow: cycleMode ? '0 0 12px rgba(255,107,53,0.4)' : '0 0 12px rgba(0,119,255,0.4)'
            }}
          >
            {cycleMode ? 'Stop Cycle' : 'Start Cycle Mode'}
          </button>
        </div>
      </div>

      {lightingMode !== 'websocket' && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)', color: '#c4b5fd' }}>
          {lightingMode === 'sacn' && 'Lighting controlled by grandMA2 — sACN Direct to ESPs'}
          {lightingMode === 'sacn-bridge' && 'Bridge active — grandMA2 → sACN → Electron → WebSocket → ESPs'}
          {lightingMode === 'artnet-bridge' && 'Bridge active — grandMA2 → ArtNet → Electron → WebSocket → ESPs'}
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono uppercase" style={{ color: '#00B0FF' }}>
            {activeFx !== 'none' && activeFx !== 'abrupt' ? activeFx : 'idle'}
          </span>
          {activeDur > 0 && activeFx !== 'abrupt' && (
            <span className="text-xs" style={{ color: '#4a6fa5' }}>{activeDur}ms</span>
          )}
        </div>
        <FxProgressBar fx={activeFx} dur={activeDur} startedAt={activeStartedAt} />
      </div>

      {cycleMode && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(255,107,53,0.15)', border: '1px solid rgba(255,107,53,0.4)', color: '#ffab91' }}>
          Cycle mode active — smooth color wave across all components
        </div>
      )}

      <div className="flex gap-6">
        {/* Left Panel */}
        <div className="flex-1 rounded-2xl border p-4" style={{ borderColor: 'rgba(0,176,255,0.25)', backgroundColor: 'rgba(10,22,40,0.6)', boxShadow: 'inset 0 1px 0 rgba(0,229,255,0.1)' }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-3 text-center" style={{ color: '#00B0FF' }}>Left Panel</div>
          <div className="grid grid-rows-4 gap-2">
            {/* Row 1: Device 1 (wide) */}
            <div className="grid grid-cols-6 gap-2">
              <div className="col-start-2 col-span-4">
                <DeviceCell device={devices[0]} index={0} wide />
              </div>
            </div>
            {/* Row 2: Devices 2, 3, 4 */}
            <div className="grid grid-cols-3 gap-2">
              <DeviceCell device={devices[1]} index={1} />
              <DeviceCell device={devices[2]} index={2} />
              <DeviceCell device={devices[3]} index={3} />
            </div>
            {/* Row 3: Devices 5, 6 */}
            <div className="grid grid-cols-2 gap-2">
              <DeviceCell device={devices[4]} index={4} />
              <DeviceCell device={devices[5]} index={5} />
            </div>
            {/* Row 4: Device 7 (full width) */}
            <div>
              <DeviceCell device={devices[6]} index={6} wide />
            </div>
          </div>
        </div>

        {/* Tie (Device 15) */}
        <TieDevice device={devices[14]} />

        {/* Right Panel */}
        <div className="flex-1 rounded-2xl border p-4" style={{ borderColor: 'rgba(0,176,255,0.25)', backgroundColor: 'rgba(10,22,40,0.6)', boxShadow: 'inset 0 1px 0 rgba(0,229,255,0.1)' }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-3 text-center" style={{ color: '#00B0FF' }}>Right Panel</div>
          <div className="grid grid-rows-4 gap-2">
            {/* Row 1: Device 8 (wide) */}
            <div>
              <DeviceCell device={devices[7]} index={7} wide />
            </div>
            {/* Row 2: Devices 9, 10, 11 */}
            <div className="grid grid-cols-3 gap-2">
              <DeviceCell device={devices[8]} index={8} />
              <DeviceCell device={devices[9]} index={9} />
              <DeviceCell device={devices[10]} index={10} />
            </div>
            {/* Row 3: Devices 12, 13 */}
            <div className="grid grid-cols-2 gap-2">
              <DeviceCell device={devices[11]} index={11} />
              <DeviceCell device={devices[12]} index={12} />
            </div>
            {/* Row 4: Device 14 (full width) */}
            <div>
              <DeviceCell device={devices[13]} index={13} wide />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-2 flex-wrap">
        <span className="text-xs" style={{ color: '#4a6fa5' }}>Color legend:</span>
        {Object.entries(colorMap).map(([name, rgb]) => (
          <div key={name} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-sm border border-white/10"
              style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
            />
            <span className="text-[10px]" style={{ color: '#7eb8da' }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LightingMonitor
