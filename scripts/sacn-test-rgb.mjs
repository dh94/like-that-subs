#!/usr/bin/env node

/**
 * sACN (E1.31) unicast test sender for RGB strip devices.
 * Sends to all device IPs individually and measures round-trip latency via PONG.
 *
 * Usage:
 *   node scripts/sacn-test-rgb.mjs                         # cycle colors on all devices
 *   node scripts/sacn-test-rgb.mjs --ping                  # latency ping test (alternating red/off)
 *   node scripts/sacn-test-rgb.mjs --all --color ff0000    # all devices red
 *   node scripts/sacn-test-rgb.mjs --device 3 --color 00ff00  # device 3 green
 *   node scripts/sacn-test-rgb.mjs --blackout              # all off
 *
 * Configure DEVICE_IPS below with your ESP32 addresses.
 */

import dgram from 'dgram'

// ============================================
// CONFIGURE
// ============================================

// Bridge IP (Electron app / laptop) — used with --bridge
const BRIDGE_IP = '2.10.10.100'

// Direct mode: ESP32 IPs — used without --bridge
const DEVICE_IPS = {
  1: '2.10.10.100',
  // 2: '2.10.10.112',
  // 3: '2.10.10.113',
  // 4: '2.10.10.114',
  // 5: '2.10.10.115',
  // 6: '2.10.10.116',
  // 7: '2.10.10.117',
  // 8: '2.10.10.118',
  // 9: '2.10.10.119',
  // 10: '2.10.10.120',
  // 11: '2.10.10.121',
  // 12: '2.10.10.122',
  // 13: '2.10.10.123',
  // 14: '2.10.10.124',
  // 15: '2.10.10.125',
}

const UNIVERSE = 4
const SACN_PORT = 5568
const PONG_PORT = 5569
const CHANNELS_PER_DEVICE = 3
const SACN_HEADER_SIZE = 126
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

// --- sACN packet builder ---
function buildSacnPacket(deviceColors) {
  const buf = Buffer.alloc(638, 0)
  // Preamble
  buf[0] = 0x00; buf[1] = 0x10
  // ACN Packet Identifier
  Buffer.from('ASC-E1.17\x00\x00\x00').copy(buf, 4)
  // Universe (bytes 113-114)
  buf[113] = (UNIVERSE >> 8) & 0xFF
  buf[114] = UNIVERSE & 0xFF
  // DMX start code at 126
  buf[126] = 0x00

  // Fill channel data
  for (const [deviceId, [r, g, b]] of Object.entries(deviceColors)) {
    const ch = (Number(deviceId) - 1) * CHANNELS_PER_DEVICE + 1
    buf[SACN_HEADER_SIZE + ch] = r
    buf[SACN_HEADER_SIZE + ch + 1] = g
    buf[SACN_HEADER_SIZE + ch + 2] = b
  }
  return buf
}

// --bridge flag: send to Electron bridge instead of directly to ESP32s
const BRIDGE_MODE = process.argv.includes('--bridge')

function sendToAll(deviceColors) {
  const packet = buildSacnPacket(deviceColors)
  const now = Date.now()

  if (BRIDGE_MODE) {
    sock.send(packet, SACN_PORT, BRIDGE_IP)
  } else {
    for (const [deviceId, ip] of Object.entries(DEVICE_IPS)) {
      const id = Number(deviceId)
      if (deviceColors[id]) {
        pendingPings.set(id, now)
        sock.send(packet, SACN_PORT, ip)
      }
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

const DEVICE_COUNT = 15
const ALL_DEVICE_IDS = Array.from({ length: DEVICE_COUNT }, (_, i) => i + 1)

const currentColors = {}
for (const id of ALL_DEVICE_IDS) currentColors[id] = [0, 0, 0]

async function fadeTo(targetColors, durationMs = FADE_DURATION_MS) {
  const startColors = {}
  for (const id of ALL_DEVICE_IDS) startColors[id] = [...(currentColors[id] || [0, 0, 0])]

  const steps = Math.ceil((durationMs / 1000) * FADE_FPS)
  const stepMs = durationMs / steps

  for (let step = 1; step <= steps; step++) {
    const t = step / steps
    const frameColors = {}
    for (const id of ALL_DEVICE_IDS) {
      const target = targetColors[id] ?? startColors[id]
      currentColors[id] = [
        lerp(startColors[id][0], target[0], t),
        lerp(startColors[id][1], target[1], t),
        lerp(startColors[id][2], target[2], t),
      ]
      frameColors[id] = currentColors[id]
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
  console.log(`[CYCLE] Fading colors across all ${DEVICE_COUNT} devices`)
  console.log(`[CYCLE] Sending to: ${Object.entries(DEVICE_IPS).map(([id, ip]) => `D${id}→${ip}`).join(', ')}`)
  if (BRIDGE_MODE) console.log(`[CYCLE] Bridge mode: sending to ${BRIDGE_IP}:${SACN_PORT}`)
  console.log('')

  let colorIndex = 0
  while (true) {
    const targets = {}
    for (const id of ALL_DEVICE_IDS) {
      const idx = (colorIndex + id) % CYCLE_COLORS.length
      targets[id] = CYCLE_COLORS[idx]
    }
    const colors = ALL_DEVICE_IDS.map(id => `D${id}:rgb(${targets[id].join(',')})`).join(' ')
    console.log(`[SEND] ${colors}`)
    await fadeTo(targets)
    await sleep(500)
    colorIndex++
  }
}

async function pingMode() {
  console.log(`[PING] Latency test — alternating red/off every 2s to all ${DEVICE_COUNT} devices`)
  if (BRIDGE_MODE) console.log(`[PING] Bridge mode: sending to ${BRIDGE_IP}:${SACN_PORT}`)
  console.log('')

  let on = false
  while (true) {
    on = !on
    const color = on ? [255, 0, 0] : [0, 0, 0]
    const targets = {}
    for (const id of ALL_DEVICE_IDS) targets[id] = color

    console.log(`[SEND] All ${DEVICE_COUNT} devices → rgb(${color.join(',')}) at ${new Date().toISOString()}`)
    sendToAll(targets)
    await sleep(2000)
  }
}

async function main() {
  const args = process.argv.slice(2)

  console.log('=== sACN Unicast RGB Test ===')
  console.log(`Universe: ${UNIVERSE}, Total devices: ${DEVICE_COUNT}`)
  console.log(`Direct IPs: ${Object.entries(DEVICE_IPS).map(([id, ip]) => `D${id}→${ip}`).join(', ') || '(none)'}`)
  if (BRIDGE_MODE) console.log(`Bridge mode: ON — all packets go to ${BRIDGE_IP}:${SACN_PORT}`)
  console.log('')

  if (args.includes('--ping')) {
    await pingMode()
    return
  }

  if (args.includes('--blackout')) {
    const targets = {}
    for (const id of ALL_DEVICE_IDS) targets[id] = [0, 0, 0]
    console.log(`[SEND] Blackout → all ${DEVICE_COUNT} devices`)
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
      for (const id of ALL_DEVICE_IDS) targets[id] = rgb
      console.log(`[SEND] All ${DEVICE_COUNT} devices → rgb(${rgb.join(',')})`)
    } else if (deviceIdx !== -1) {
      const id = parseInt(args[deviceIdx + 1])
      targets[id] = rgb
      const ip = DEVICE_IPS[id]
      console.log(`[SEND] Device ${id}${ip ? ` (${ip})` : ''} → rgb(${rgb.join(',')})`)
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
