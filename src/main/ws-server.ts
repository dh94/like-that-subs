import { WebSocket, WebSocketServer } from 'ws'

const port = 8081

const wss = new WebSocketServer({ port })

export const wsClients = new Set<WebSocket>()
export const lightingState = new Map<number, { r: number; g: number; b: number; fx: string; dur: number; startedAt: number }>()
export const connectedDevices = new Set<number>()
export const connectedSubtitleDevices = new Set<number>()

const deviceToWs = new Map<number, WebSocket>()
const subtitleDeviceToWs = new Map<number, WebSocket>()

wss.on('connection', function connection(ws, request) {
  console.info(`WebSocket Connection Established ${request.socket.remoteAddress}`)
  wsClients.add(ws)
  ws.send('Who?')
  ws.on('error', console.error)

  ws.on('close', function close() {
    console.info(`WebSocket Connection Closed ${request.socket.remoteAddress}`)
    wsClients.delete(ws)

    for (const [id, socket] of deviceToWs.entries()) {
      if (socket === ws) {
        deviceToWs.delete(id)
        connectedDevices.delete(id)
        console.info(`Light ${id} disconnected`)
        break
      }
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

    if (msg.startsWith('Light ')) {
      const id = parseInt(msg.split(' ')[1])
      connectedDevices.add(id)
      deviceToWs.set(id, ws)
      console.info(`Light ${id} identified`)

      const state = lightingState.get(id)
      if (state) {
        ws.send(JSON.stringify({ type: 'sync', id, r: state.r, g: state.g, b: state.b }))
        console.info(`Sent sync to Light ${id}: rgb(${state.r},${state.g},${state.b})`)
      }
    }

    if (msg.startsWith('Device ')) {
      const id = parseInt(msg.split(' ')[1])
      connectedSubtitleDevices.add(id)
      subtitleDeviceToWs.set(id, ws)
      console.info(`Subtitle Device ${id} identified`)
    }
  })
})

// Ping all clients every 5s to detect dead connections
const PING_INTERVAL = 5000
const aliveClients = new WeakMap<WebSocket, boolean>()

wss.on('connection', function (ws) {
  aliveClients.set(ws, true)
  ws.on('pong', () => {
    aliveClients.set(ws, true)
  })
})

setInterval(() => {
  wsClients.forEach((ws) => {
    if (aliveClients.get(ws) === false) {
      ws.terminate()
      return
    }
    aliveClients.set(ws, false)
    ws.ping()
  })
}, PING_INTERVAL)

console.info('Started WebSocket Server on port', port)
