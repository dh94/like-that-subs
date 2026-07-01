import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { createSocket, Socket } from 'dgram'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { wsClients, lightingState, connectedDevices, connectedSubtitleDevices } from './ws-server'

let lightingWindow: BrowserWindow | null = null
let lightingMode: 'websocket' | 'sacn' | 'sacn-bridge' | 'artnet-bridge' = 'sacn-bridge'
let bridgeSocket: Socket | null = null

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: false,
      allowRunningInsecureContent: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createLightingWindow(): void {
  lightingWindow = new BrowserWindow({
    width: 700,
    height: 500,
    show: false,
    autoHideMenuBar: true,
    title: 'Lighting Monitor',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: false,
      allowRunningInsecureContent: true
    }
  })

  lightingWindow.on('ready-to-show', () => {
    lightingWindow!.show()
  })

  lightingWindow.on('closed', () => {
    lightingWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    lightingWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/lighting.html')
  } else {
    lightingWindow.loadFile(join(__dirname, '../renderer/lighting.html'))
  }
}

function getLightingDeviceStates() {
  return Array.from({ length: 15 }, (_, i) => {
    const id = i + 1
    const state = lightingState.get(id)
    const connected = connectedDevices.has(id)
    return {
      connected,
      r: state?.r ?? 0,
      g: state?.g ?? 0,
      b: state?.b ?? 0,
      fx: state?.fx ?? 'none',
      dur: state?.dur ?? 0,
      startedAt: state?.startedAt ?? 0
    }
  })
}

function sendLightingStateToMonitor() {
  if (lightingWindow && !lightingWindow.isDestroyed()) {
    lightingWindow.webContents.send('lighting_state_update', {
      devices: getLightingDeviceStates()
    })
  }
}

// --- sACN/ArtNet → WebSocket Bridge ---

const SACN_BRIDGE_PORT = 5568
const ARTNET_BRIDGE_PORT = 6454
const DEVICE_COUNT = 15

function parseSacnPacket(
  buf: Buffer,
  rinfo: { address: string; port: number }
): { id: number; r: number; g: number; b: number }[] | null {
  if (buf.length < 126 + DEVICE_COUNT * 3 + 1) {
    console.log(
      `[Bridge] WARN: sACN packet too small (${buf.length} bytes) from ${rinfo.address}:${rinfo.port}`
    )
    return null
  }
  if (buf[0] !== 0x00 || buf[1] !== 0x10) {
    console.log(`[Bridge] WARN: Invalid sACN preamble from ${rinfo.address}:${rinfo.port}`)
    return null
  }
  const universe = (buf[113] << 8) | buf[114]
  if (universe !== 4) {
    // console.log(`[Bridge] WARN: Wrong universe ${universe} (expected 4) from ${rinfo.address}:${rinfo.port}`)
    return null
  }

  const cues: { id: number; r: number; g: number; b: number }[] = []
  for (let device = 1; device <= DEVICE_COUNT; device++) {
    const ch = (device - 1) * 3
    cues.push({ id: device, r: buf[126 + ch], g: buf[126 + ch + 1], b: buf[126 + ch + 2] })
  }
  return cues
}

function parseArtnetPacket(
  buf: Buffer,
  rinfo: { address: string; port: number }
): { id: number; r: number; g: number; b: number }[] | null {
  if (buf.length < 18 + DEVICE_COUNT * 3) {
    console.log(
      `[Bridge] WARN: ArtNet packet too small (${buf.length} bytes) from ${rinfo.address}:${rinfo.port}`
    )
    return null
  }
  const header = buf.subarray(0, 8).toString('ascii')
  if (header !== 'Art-Net\x00') {
    console.log(`[Bridge] WARN: Invalid ArtNet header from ${rinfo.address}:${rinfo.port}`)
    return null
  }
  const opcode = buf[8] | (buf[9] << 8)
  if (opcode !== 0x5000) {
    console.log(
      `[Bridge] WARN: Non-ArtDmx opcode 0x${opcode.toString(16)} from ${rinfo.address}:${rinfo.port}`
    )
    return null
  }

  const cues: { id: number; r: number; g: number; b: number }[] = []
  for (let device = 1; device <= DEVICE_COUNT; device++) {
    const ch = (device - 1) * 3
    cues.push({ id: device, r: buf[18 + ch], g: buf[18 + ch + 1], b: buf[18 + ch + 2] })
  }
  return cues
}

let bridgePacketCount = 0
let lastBridgeLogTime = 0

function forwardToWsClients(
  cues: { id: number; r: number; g: number; b: number }[],
  source: string
) {
  const now = Date.now()
  const batchCues = cues.map((c) => ({ ...c, fx: 'abrupt', dur: 0 }))
  const payload = JSON.stringify({ type: 'batch', cues: batchCues })

  for (const cue of cues) {
    lightingState.set(cue.id, {
      r: cue.r,
      g: cue.g,
      b: cue.b,
      fx: 'abrupt',
      dur: 0,
      startedAt: now
    })
  }

  const clientCount = wsClients.size
  wsClients.forEach((ws) => ws.send(payload))
  sendLightingStateToMonitor()

  bridgePacketCount++

  // Log every packet for first 10, then every 100th, plus every 5 seconds
  if (bridgePacketCount <= 10 || bridgePacketCount % 100 === 0 || now - lastBridgeLogTime > 5000) {
    const litDevices = cues.filter((c) => c.r > 0 || c.g > 0 || c.b > 0)
    const lines: string[] = []

    lines.push(`[Bridge] Packet #${bridgePacketCount} from ${source}`)
    lines.push(`  Forwarded to ${clientCount} connected WS client(s)`)

    if (litDevices.length === 0) {
      lines.push(`  All 15 devices → OFF`)
    } else {
      for (const c of litDevices) {
        const online = connectedDevices.has(c.id)
        lines.push(
          `  Device ${c.id} → rgb(${c.r},${c.g},${c.b}) ${online ? '✓ online' : '✗ OFFLINE'}`
        )
      }
      const offDevices = cues.filter((c) => c.r === 0 && c.g === 0 && c.b === 0)
      if (offDevices.length > 0 && offDevices.length < 15) {
        lines.push(`  Devices ${offDevices.map((c) => c.id).join(',')} → OFF`)
      }
    }

    // console.log(lines.join('\n'))
    lastBridgeLogTime = now
  }
}

function startBridge(mode: 'sacn-bridge' | 'artnet-bridge') {
  stopBridge()
  const port = mode === 'sacn-bridge' ? SACN_BRIDGE_PORT : ARTNET_BRIDGE_PORT
  bridgeSocket = createSocket('udp4')

  let lastForwardedState = ''

  bridgeSocket.on('message', (buf, rinfo) => {
    const cues =
      mode === 'sacn-bridge' ? parseSacnPacket(buf, rinfo) : parseArtnetPacket(buf, rinfo)
    if (!cues) return

    // Only forward when DMX values actually change (grandMA2 sends same state at 40Hz)
    const stateKey = cues.map((c) => `${c.r},${c.g},${c.b}`).join('|')
    if (stateKey === lastForwardedState) return
    lastForwardedState = stateKey

    forwardToWsClients(cues, `${rinfo.address}:${rinfo.port}`)
  })

  bridgeSocket.bind(port, () => {
    console.log(`[Bridge] ${mode} listening on UDP port ${port}`)
  })
}

function stopBridge() {
  if (bridgeSocket) {
    bridgeSocket.close()
    bridgeSocket = null
    console.log('[Bridge] Stopped')
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('show_line', (event, args) => {
    const subtitlePayload = args.line.map((line: string) => (line === '-' ? '' : line)).join(';')
    console.log('Received show_line', subtitlePayload)

    if (args.lighting?.cues && lightingMode === 'websocket') {
      const now = Date.now()
      const immediate = args.lighting.cues.filter((c: any) => !c.delay || c.delay === 0)
      const delayed = args.lighting.cues.filter((c: any) => c.delay && c.delay > 0)

      if (immediate.length > 0) {
        const payload = JSON.stringify({ type: 'batch', cues: immediate })
        for (const cue of immediate) {
          lightingState.set(cue.id, {
            r: cue.r,
            g: cue.g,
            b: cue.b,
            fx: cue.fx,
            dur: cue.dur ?? 0,
            startedAt: now
          })
        }
        wsClients.forEach((ws) => {
          ws.send(subtitlePayload)
          ws.send(payload)
        })
      } else {
        wsClients.forEach((ws) => ws.send(subtitlePayload))
      }

      if (delayed.length > 0) {
        const delayMs = delayed[0].delay

        // t=delayMs: turn OFF immediate group, turn ON delayed group
        setTimeout(() => {
          const delayedNow = Date.now()
          const offCues = immediate.map((c: any) => ({
            id: c.id,
            r: 0,
            g: 0,
            b: 0,
            fx: 'abrupt',
            dur: 0
          }))
          const onCues = delayed.map((c: any) => ({
            id: c.id,
            r: c.r,
            g: c.g,
            b: c.b,
            fx: c.fx,
            dur: c.dur
          }))
          const payload = JSON.stringify({ type: 'batch', cues: [...offCues, ...onCues] })
          for (const cue of offCues) {
            lightingState.set(cue.id, {
              r: 0,
              g: 0,
              b: 0,
              fx: 'abrupt',
              dur: 0,
              startedAt: delayedNow
            })
          }
          for (const cue of delayed) {
            lightingState.set(cue.id, {
              r: cue.r,
              g: cue.g,
              b: cue.b,
              fx: cue.fx,
              dur: cue.dur ?? 0,
              startedAt: delayedNow
            })
          }
          wsClients.forEach((ws) => ws.send(payload))
          sendLightingStateToMonitor()
        }, delayMs)

        // t=delayMs*2: turn OFF delayed group
        setTimeout(() => {
          const offNow = Date.now()
          const offCues = delayed.map((c: any) => ({
            id: c.id,
            r: 0,
            g: 0,
            b: 0,
            fx: 'abrupt',
            dur: 0
          }))
          const payload = JSON.stringify({ type: 'batch', cues: offCues })
          for (const cue of offCues) {
            lightingState.set(cue.id, { r: 0, g: 0, b: 0, fx: 'abrupt', dur: 0, startedAt: offNow })
          }
          wsClients.forEach((ws) => ws.send(payload))
          sendLightingStateToMonitor()
        }, delayMs * 2)
      }

      sendLightingStateToMonitor()
    } else {
      wsClients.forEach((ws) => ws.send(subtitlePayload))
    }

    event.reply('show_line_ack')
  })

  ipcMain.on('subtitle_status_poll', (event) => {
    event.reply('subtitle_status_update', {
      devices: Array.from(connectedSubtitleDevices)
    })
  })

  ipcMain.on('lighting_monitor_ready', () => {
    sendLightingStateToMonitor()
  })

  ipcMain.on('lighting_monitor_poll', () => {
    sendLightingStateToMonitor()
  })

  ipcMain.on(
    'set_lighting_mode',
    (_event, mode: 'websocket' | 'sacn' | 'sacn-bridge' | 'artnet-bridge') => {
      lightingMode = mode
      console.log(`Lighting mode set to: ${mode}`)

      if (mode === 'sacn-bridge' || mode === 'artnet-bridge') {
        startBridge(mode)
      } else {
        stopBridge()
      }

      if (lightingWindow && !lightingWindow.isDestroyed()) {
        lightingWindow.webContents.send('lighting_mode_update', lightingMode)
      }
    }
  )

  ipcMain.on('get_lighting_mode', (event) => {
    event.reply('lighting_mode_update', lightingMode)
  })

  ipcMain.on('lighting_cycle', (_event, args) => {
    if (lightingMode !== 'websocket') return

    const lightingPayload = JSON.stringify({ type: 'batch', cues: args.cues })
    const now = Date.now()
    for (const cue of args.cues) {
      lightingState.set(cue.id, {
        r: cue.r,
        g: cue.g,
        b: cue.b,
        fx: cue.fx,
        dur: cue.dur ?? 0,
        startedAt: now
      })
    }

    wsClients.forEach((ws) => {
      ws.send(lightingPayload)
    })

    sendLightingStateToMonitor()
  })

  createWindow()
  createLightingWindow()
  startBridge('sacn-bridge')

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      createLightingWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
