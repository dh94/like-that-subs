import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  wsClients,
  connectedSubtitleDevices,
  tieState,
  setTieEffect,
  tiePayload,
  blinkIntervalFor,
  TieEffect,
  getWsTie
} from './ws-server'

let lightingWindow: BrowserWindow | null = null

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
    title: 'Tie Monitor',
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

function sendTieStateToMonitor() {
  if (lightingWindow && !lightingWindow.isDestroyed()) {
    lightingWindow.webContents.send('tie_state_update', {
      connected: tieState.connected,
      effect: tieState.effect,
      interval: blinkIntervalFor(tieState.effect)
    })
  }
}

function broadcastTieEffect(effect: TieEffect) {
  setTieEffect(effect)
  const payload = tiePayload(effect)
  getWsTie()?.send(payload);
  sendTieStateToMonitor()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('show_line', (event, args) => {
    const subtitlePayload = args.line.map((line: string) => (line === '-' ? '' : line)).join(';')
    console.log('Received show_line', subtitlePayload)

    wsClients.forEach((ws) => ws.send(subtitlePayload))

    if (args.tie) {
      broadcastTieEffect(args.tie as TieEffect)
    }

    event.reply('show_line_ack')
  })

  ipcMain.on('tie_effect', (_event, effect: TieEffect) => {
    console.log('Received tie_effect', effect)
    broadcastTieEffect(effect)
  })

  ipcMain.on('subtitle_status_poll', (event) => {
    event.reply('subtitle_status_update', {
      devices: Array.from(connectedSubtitleDevices)
    })
  })

  ipcMain.on('tie_monitor_ready', () => {
    sendTieStateToMonitor()
  })

  ipcMain.on('tie_monitor_poll', () => {
    sendTieStateToMonitor()
  })

  createWindow()
  createLightingWindow()

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
