#!/usr/bin/env node

/**
 * Minimal sACN network test — sends packets and listens for PONG.
 *
 * Tests three modes:
 *   1. Multicast to 239.255.0.4:5568 (standard sACN)
 *   2. Unicast to ESP32 IP:5568
 *   3. Raw tiny UDP packet (not sACN, just to test connectivity)
 *
 * Usage:
 *   node scripts/sacn-network-test.mjs <ESP32_IP>
 *   node scripts/sacn-network-test.mjs 2.10.10.166
 */

import dgram from 'dgram'

const ESP_IP = process.argv[2]
if (!ESP_IP) {
  console.error('Usage: node scripts/sacn-network-test.mjs <ESP32_IP>')
  console.error('Example: node scripts/sacn-network-test.mjs 2.10.10.166')
  process.exit(1)
}

const MULTICAST_ADDR = '239.255.0.4'
const SACN_PORT = 5568
const PONG_PORT = 5569

const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })

// Listen for PONG responses
const pongSock = dgram.createSocket('udp4')
pongSock.bind(PONG_PORT, () => {
  console.log(`Listening for PONG on port ${PONG_PORT}\n`)
})
pongSock.on('message', (msg, rinfo) => {
  const rtt = Date.now() - lastSentAt
  console.log(`  ✓ PONG from ${rinfo.address}: "${msg.toString()}" (RTT: ${rtt}ms)\n`)
})

let lastSentAt = 0
let testNum = 0

function buildSacnPacket() {
  const buf = Buffer.alloc(174, 0)
  // Preamble
  buf[0] = 0x00; buf[1] = 0x10
  // ACN Packet Identifier
  Buffer.from('ASC-E1.17\x00\x00\x00').copy(buf, 4)
  // Universe = 4 (bytes 113-114)
  buf[113] = 0x00; buf[114] = 0x04
  // DMX start code at 126
  buf[126] = 0x00
  // Channel 1 = 255 (R), 2 = 0 (G), 3 = 0 (B)
  buf[127] = 255
  buf[128] = 0
  buf[129] = 0
  return buf
}

function send(target, port, data, label) {
  testNum++
  lastSentAt = Date.now()
  console.log(`[TEST ${testNum}] ${label}`)
  console.log(`  Sending to ${target}:${port} (${data.length} bytes)`)
  sock.send(data, port, target, (err) => {
    if (err) console.log(`  ✗ Send error: ${err.message}`)
    else console.log(`  → Sent at ${new Date().toISOString()}`)
  })
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function runTests() {
  console.log('=== sACN Network Test ===')
  console.log(`ESP32 IP: ${ESP_IP}`)
  console.log(`Multicast: ${MULTICAST_ADDR}:${SACN_PORT}\n`)

  // Test 1: Raw UDP unicast (tiny packet, just to test connectivity)
  send(ESP_IP, SACN_PORT, Buffer.from('PING'), 'Raw UDP unicast to ESP32')
  await sleep(3000)

  // Test 2: sACN unicast
  send(ESP_IP, SACN_PORT, buildSacnPacket(), 'sACN packet unicast to ESP32')
  await sleep(3000)

  // Test 3: sACN multicast
  send(MULTICAST_ADDR, SACN_PORT, buildSacnPacket(), 'sACN packet MULTICAST')
  await sleep(3000)

  // Test 4: Rapid burst (5 packets)
  console.log(`[TEST ${++testNum}] Rapid burst: 5 multicast packets 200ms apart`)
  for (let i = 0; i < 5; i++) {
    lastSentAt = Date.now()
    const pkt = buildSacnPacket()
    pkt[127] = i * 50 // vary R value so ESP detects change
    sock.send(pkt, SACN_PORT, MULTICAST_ADDR)
    console.log(`  → Burst ${i + 1}/5 (R=${i * 50}) at ${new Date().toISOString()}`)
    await sleep(200)
  }
  await sleep(3000)

  console.log('\n=== Tests complete ===')
  console.log('If you saw no PONGs, check:')
  console.log('  1. ESP32 Serial shows "Multicast OK" and "[ALIVE]" heartbeats')
  console.log('  2. Both devices on same subnet (2.10.10.x)')
  console.log('  3. Try connecting laptop to same WiFi as ESP32')
  console.log('  4. Firewall blocking UDP 5568/5569?')
  process.exit(0)
}

runTests()
