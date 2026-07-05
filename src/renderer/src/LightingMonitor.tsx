import { useEffect, useState } from 'react'

type TieEffect = 'on' | 'off' | 'slow_blink' | 'fast_blink'

interface TieState {
  connected: boolean
  effect: TieEffect
  interval?: number
}

const EFFECTS: { id: TieEffect; label: string }[] = [
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
  { id: 'slow_blink', label: 'Slow Blink' },
  { id: 'fast_blink', label: 'Fast Blink' }
]

function TieGraphic({ effect, interval }: { effect: TieEffect; interval?: number }) {
  const [blinkOn, setBlinkOn] = useState(true)

  useEffect(() => {
    if (effect !== 'slow_blink' && effect !== 'fast_blink') {
      setBlinkOn(true)
      return
    }
    const rate = interval ?? (effect === 'slow_blink' ? 600 : 150)
    const t = setInterval(() => setBlinkOn((v) => !v), rate)
    return () => clearInterval(t)
  }, [effect, interval])

  const lit = effect === 'on' || ((effect === 'slow_blink' || effect === 'fast_blink') && blinkOn)
  const color = lit ? '#00E5FF' : '#14384f'
  const glow = lit ? 'drop-shadow(0 0 16px #00E5FF)' : 'none'

  return (
    <svg width="80" height="300" viewBox="0 0 40 160" style={{ filter: glow, transition: 'filter 80ms' }}>
      <path d="M8 8 L20 20 L32 8 L28 0 L12 0 Z" fill={color} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      <path d="M14 18 L20 24 L26 18 L24 14 L16 14 Z" fill={color} stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
      <path
        d="M16 24 L12 60 L10 100 L14 130 L20 148 L26 130 L30 100 L28 60 L24 24 Z"
        fill={color}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.5"
      />
      <line x1="20" y1="28" x2="20" y2="145" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
    </svg>
  )
}

function LightingMonitor() {
  const [tie, setTie] = useState<TieState>({ connected: false, effect: 'off' })

  useEffect(() => {
    window.electron.ipcRenderer.on('tie_state_update', (_event, data: TieState) => {
      setTie(data)
    })
    window.electron.ipcRenderer.send('tie_monitor_ready')
    const interval = setInterval(() => {
      window.electron.ipcRenderer.send('tie_monitor_poll')
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const sendEffect = (effect: TieEffect) => {
    window.electron.ipcRenderer.send('tie_effect', effect)
    setTie((prev) => ({ ...prev, effect }))
  }

  return (
    <div
      className="h-screen flex flex-col items-center p-8"
      style={{
        background: 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #0d1f3c 100%)',
        color: '#e0f7fa'
      }}
    >
      <div className="w-full flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: '#00E5FF', textShadow: '0 0 10px rgba(0,229,255,0.4)' }}
        >
          Tie Monitor
        </h1>
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              tie.connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-500 animate-pulse'
            }`}
          />
          <span className="text-xs font-mono">{tie.connected ? 'CONNECTED' : 'OFFLINE'}</span>
        </div>
      </div>

      <TieGraphic effect={tie.effect} interval={tie.interval} />

      <div className="mt-4 text-sm font-mono uppercase tracking-widest" style={{ color: '#00B0FF' }}>
        {tie.effect.replace('_', ' ')}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        {EFFECTS.map(({ id, label }) => {
          const active = tie.effect === id
          return (
            <button
              key={id}
              onClick={() => sendEffect(id)}
              className="px-6 py-3 rounded-xl font-medium transition-all text-white"
              style={{
                backgroundColor: active ? '#00B0FF' : 'rgba(10,22,40,0.8)',
                border: `1px solid ${active ? '#00E5FF' : 'rgba(0,176,255,0.3)'}`,
                boxShadow: active ? '0 0 12px rgba(0,229,255,0.5)' : 'none'
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default LightingMonitor
