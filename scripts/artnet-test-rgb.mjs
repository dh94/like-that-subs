#!/usr/bin/env node

/**
 * ArtNet unicast test sender for RGB strip devices.
 * Sends to all device IPs individually and measures round-trip latency via PONG.
 *
 * Usage:
 *   node scripts/artnet-test-rgb.mjs                         # cycle colors on all devices
 *   node scripts/artnet-test-rgb.mjs --ping                  # latency ping test (alternating red/off)
 *   node scripts/artnet-test-rgb.mjs --all --color ff0000    # all devices red
 *   node scripts/artnet-test-rgb.mjs --device 3 --color 00ff00  # device 3 green
 *   node scripts/artnet-test-rgb.mjs --blackout              # all off
 *
 * Configure DEVICE_IPS below with your ESP32 addresses.
 */

import dgram from 'dgram'

// ============================================
// CONFIGURE DEVICE IPs HERE
// ============================================
const DEVICE_IPS = {
  1: '2.10.10.111',
  // 2: '2.10.10.112',
  // 3: '2.10.10.113',
  // ... add all 15 device IPs
}

const ARTNET_PORT = 6454
const PONG_PORT = 5569
const CHANNELS_PER_DEVICE = 3
const ARTNET_UNIVERSE = 0
const FADE_DURATION_MS = 2000
const FADE_FPS = 40

const sock = dgram.createSocket('udp4')

// --- PONG listener for latency measurement ---
const pongSock = dgram.createSocket('udp4')
const pendingPings = new Map()

pongSock.bind(PONG_PORT, () => {
  console.log(`[LATENCY] Listening for PONG on port ${PONG_PORT}\n`)
})

pongSock.on('message', (msg, rinfo) => {
  const parts = msg.toString().split(' ')
  const deviceId = parseInt(parts[1])
  const sentAt = pendingPings.get(deviceId)
  if (sentAt) {
    const rtt = Date.now() - sentAt
    console.log(`  [PONG] Device ${deviceId} (${rinfo.address}) — RTT: ${rtt}ms, latency: ~${(rtt / 2).toFixed(0)}ms`)
    pendingPings.delete(deviceId)
  }
})

// --- ArtNet packet builder ---
function buildArtnetPacket(deviceColors) {
  // ArtDmx packet: header(18) + DMX data(512 max)
  const dmxLength = 15 * CHANNELS_PER_DEVICE
  const buf = Buffer.alloc(18 + dmxLength, 0)

  // Header: "Art-Net\0"
  Buffer.from('Art-Net\x00').copy(buf, 0)
  // Opcode: 0x5000 (ArtDmx) little-endian
  buf[8] = 0x00
  buf[9] = 0x50
  // Protocol version: 14 (big-endian)
  buf[10] = 0x00
  buf[11] = 0x0e
  // Sequence: 0
  buf[12] = 0x00
  // Physical: 0
  buf[13] = 0x00
  // Universe (little-endian)
  buf[14] = ARTNET_UNIVERSE & 0xFF
  buf[15] = (ARTNET_UNIVERSE >> 8) & 0xFF
  // Length (big-endian)
  buf[16] = (dmxLength >> 8) & 0xFF
  buf[17] = dmxLength & 0xFF

  // Fill DMX data (0-indexed channels)
  for (const [deviceId, [r, g, b]] of Object.entries(deviceColors)) {
    const ch = (Number(deviceId) - 1) * CHANNELS_PER_DEVICE
    buf[18 + ch] = r
    buf[18 + ch + 1] = g
    buf[18 + ch + 2] = b
  }
  return buf
}

function sendToAll(deviceColors) {
  const packet = buildArtnetPacket(deviceColors)
  const now = Date.now()

  for (const [deviceId, ip] of Object.entries(DEVICE_IPS)) {
    const id = Number(deviceId)
    if (deviceColors[id]) {
      pendingPings.set(id, now)
      sock.send(packet, ARTNET_PORT, ip)
    }
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const currentColors = {}
for (const id of Object.keys(DEVICE_IPS)) currentColors[id] = [0, 0, 0]

async function fadeTo(targetColors, durationMs = FADE_DURATION_MS) {
  const startColors = {}
  for (const id of Object.keys(DEVICE_IPS)) startColors[id] = [...(currentColors[id] || [0, 0, 0])]

  const steps = Math.ceil((durationMs / 1000) * FADE_FPS)
  const stepMs = durationMs / steps

  for (let step = 1; step <= steps; step++) {
    const t = step / steps
    const frameColors = {}
    for (const id of Object.keys(DEVICE_IPS)) {
      const numId = Number(id)
      const target = targetColors[numId] ?? startColors[id]
      currentColors[id] = [
        lerp(startColors[id][0], target[0], t),
        lerp(startColors[id][1], target[1], t),
        lerp(startColors[id][2], target[2], t),
      ]
      frameColors[numId] = currentColors[id]
    }
    sendToAll(frameColors)
    await sleep(stepMs)
  }
}

const CYCLE_COLORS = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [0, 255, 255],
  [255, 0, 255],
  [255, 128, 0],
]

async function cycleMode() {
  const deviceIds = Object.keys(DEVICE_IPS).map(Number)
  console.log(`[CYCLE] Fading colors across ${deviceIds.length} devices: ${deviceIds.join(', ')}`)
  console.log(`[CYCLE] IPs: ${deviceIds.map(id => `${id}→${DEVICE_IPS[id]}`).join(', ')}\n`)

  let colorIndex = 0
  while (true) {
    const targets = {}
    for (const id of deviceIds) {
      const idx = (colorIndex + id) % CYCLE_COLORS.length
      targets[id] = CYCLE_COLORS[idx]
    }
    const colors = deviceIds.map(id => `D${id}:rgb(${targets[id].join(',')})`).join(' ')
    console.log(`[SEND] ${colors}`)
    await fadeTo(targets)
    await sleep(500)
    colorIndex++
  }
}

async function pingMode() {
  const deviceIds = Object.keys(DEVICE_IPS).map(Number)
  console.log(`[PING] Latency test — alternating red/off every 2s to ${deviceIds.length} devices`)
  console.log(`[PING] IPs: ${deviceIds.map(id => `${id}→${DEVICE_IPS[id]}`).join(', ')}\n`)

  let on = false
  while (true) {
    on = !on
    const color = on ? [255, 0, 0] : [0, 0, 0]
    const targets = {}
    for (const id of deviceIds) targets[id] = color

    console.log(`[SEND] All devices → rgb(${color.join(',')}) at ${new Date().toISOString()}`)
    sendToAll(targets)
    await sleep(2000)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const deviceIds = Object.keys(DEVICE_IPS).map(Number)

  console.log('=== ArtNet Unicast RGB Test ===')
  console.log(`Universe: ${ARTNET_UNIVERSE}, Devices: ${deviceIds.length}`)
  console.log(`Configured: ${deviceIds.map(id => `Device ${id} → ${DEVICE_IPS[id]}`).join(', ')}`)
  console.log('')

  if (args.includes('--ping')) {
    await pingMode()
    return
  }

  if (args.includes('--blackout')) {
    const targets = {}
    for (const id of deviceIds) targets[id] = [0, 0, 0]
    console.log('[SEND] Blackout → all devices')
    await fadeTo(targets, 1000)
    console.log('[DONE] Blackout complete')
    await sleep(200)
    process.exit(0)
  }

  const colorIdx = args.indexOf('--color')
  const deviceIdx = args.indexOf('--device')
  const allFlag = args.includes('--all')

  if (colorIdx !== -1) {
    const rgb = hexToRgb(args[colorIdx + 1])
    const targets = {}

    if (allFlag) {
      for (const id of deviceIds) targets[id] = rgb
      console.log(`[SEND] All devices → rgb(${rgb.join(',')})`)
    } else if (deviceIdx !== -1) {
      const id = parseInt(args[deviceIdx + 1])
      targets[id] = rgb
      console.log(`[SEND] Device ${id} (${DEVICE_IPS[id]}) → rgb(${rgb.join(',')})`)
    } else {
      console.error('Specify --device <id> or --all with --color')
      process.exit(1)
    }

    await fadeTo(targets)
    await sleep(200)
    process.exit(0)
  }

  await cycleMode()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
