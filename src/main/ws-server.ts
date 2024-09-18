import { WebSocket, WebSocketServer } from 'ws'
import { createInterface } from 'node:readline/promises'

const port = 8081

const wss = new WebSocketServer({ port })

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
})

export const wsClients = new Set<WebSocket>()

wss.on('connection', function connection(ws, request) {
  console.info(`WebSocket Connection Established ${request.socket.remoteAddress}`)
  wsClients.add(ws)
  ws.on('error', console.error)

  ws.on('close', function close() {
    console.info(`WebSocket Connection Closed ${request.socket.remoteAddress}`)

    wsClients.delete(ws)
  })

  ws.on('message', function message(data) {
    console.log(`Received from ${request.socket.remoteAddress}: %s`, data)
  })
})

console.info('Started WebSocket Server ')
