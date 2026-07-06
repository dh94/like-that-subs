import { WebSocket, WebSocketServer } from 'ws'

const port = 8081

const wss = new WebSocketServer({ port })

export const wsClients = new Set<WebSocket>()
export const connectedSubtitleDevices = new Set<number>()

export type TieEffect = 'on' | 'off' | 'slow_blink' | 'fast_blink'
export const tieState = { connected: false, effect: 'off' as TieEffect }

// Blink toggle intervals (ms) — change here, no firmware reflash needed
export const BLINK_RATES: Record<'slow_blink' | 'fast_blink', number> = {
  slow_blink: 600,
  fast_blink: 150
}

let tieWs: WebSocket | null = null
const subtitleDeviceToWs = new Map<number, WebSocket>()

export function setTieEffect(effect: TieEffect) {
  tieState.effect = effect
}

export function blinkIntervalFor(effect: TieEffect): number | undefined {
  return effect === 'slow_blink' || effect === 'fast_blink' ? BLINK_RATES[effect] : undefined
}

export function tiePayload(effect: TieEffect): string {
  const interval = blinkIntervalFor(effect)
  return JSON.stringify({ type: 'tie', effect, ...(interval !== undefined ? { interval } : {}) })
}

wss.on('connection', function connection(ws, request) {
  console.info(`WebSocket Connection Established ${request.socket.remoteAddress}`)
  wsClients.add(ws)
  ws.send('Who?')
  ws.on('error', console.error)

  ws.on('close', function close() {
    console.info(`WebSocket Connection Closed ${request.socket.remoteAddress}`)
    wsClients.delete(ws)

    if (ws === tieWs) {
      tieWs = null
      tieState.connected = false
      console.info('Tie disconnected')
    }

    for (const [id, socket] of subtitleDeviceToWs.entries()) {
      if (socket === ws) {
        subtitleDeviceToWs.delete(id)
        connectedSubtitleDevices.delete(id)
        console.info(`Subtitle Device ${id} disconnected`)
        break
      }
    }
  })

  ws.on('message', function message(data) {
    const msg = data.toString()
    console.log(`Received from ${request.socket.remoteAddress}: %s`, msg)

    if (msg === 'Tie') {
      tieWs = ws
      tieState.connected = true
      console.info('Tie identified')
      // Resync current effect (with rate) so a reconnecting tie catches up
      ws.send(tiePayload(tieState.effect))
    }

    if (msg.startsWith('Device ')) {
      const id = parseInt(msg.split(' ')[1])
      connectedSubtitleDevices.add(id)
      subtitleDeviceToWs.set(id, ws)
      console.info(`Subtitle Device ${id} identified`)
    }
  })
})

console.info('Started WebSocket Server on port', port)


export const getWsTie = () => tieWs