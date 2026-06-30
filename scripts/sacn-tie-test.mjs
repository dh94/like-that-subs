#!/usr/bin/env node

/**
 * sACN (E1.31) test sender for the tie switch (Device 16).
 *
 * Usage:
 *   node scripts/sacn-tie-test.mjs                # cycle on/off with fade
 *   node scripts/sacn-tie-test.mjs --on            # fade to full brightness
 *   node scripts/sacn-tie-test.mjs --off           # fade to off
 *   node scripts/sacn-tie-test.mjs --brightness 128 # fade to specific level (0-255)
 *   node scripts/sacn-tie-test.mjs --strobe        # rapid on/off strobe
 */

import { Sender } from 'sacn'

const UNIVERSE = 4
const DEVICE_ID = 16
const CHANNELS_PER_DEVICE = 3
const DMX_START_CHANNEL = (DEVICE_ID - 1) * CHANNELS_PER_DEVICE + 1 // channel 46

const FADE_DURATION_MS = 2000
const FADE_FPS = 40

const sender = new Sender({
  universe: UNIVERSE,
  rateLimit: FADE_FPS,
})

let currentBrightness = 0

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

async function sendBrightness(val) {
  const payload = {
    [DMX_START_CHANNEL]: val,
    [DMX_START_CHANNEL + 1]: 0,
    [DMX_START_CHANNEL + 2]: 0,
  }
  await sender.send({ payload, sourceName: 'Tie Test Sender', priority: 100 })
}

async function fadeTo(target, durationMs = FADE_DURATION_MS) {
  const start = currentBrightness
  const steps = Math.ceil((durationMs / 1000) * FADE_FPS)
  const stepMs = durationMs / steps

  for (let step = 1; step <= steps; step++) {
    const t = step / steps
    currentBrightness = lerp(start, target, t)
    await sendBrightness(currentBrightness)
    await new Promise((r) => setTimeout(r, stepMs))
  }
}

async function cycleMode() {
  console.log('Cycling tie on/off with fade (Ctrl+C to stop)...')
  console.log(`DMX channel: ${DMX_START_CHANNEL} (Universe ${UNIVERSE})`)

  while (true) {
    console.log('  → ON (255)')
    await fadeTo(255)
    await new Promise((r) => setTimeout(r, 1500))

    console.log('  → OFF (0)')
    await fadeTo(0)
    await new Promise((r) => setTimeout(r, 1500))
  }
}

async function strobeMode() {
  console.log('Strobe mode — rapid on/off (Ctrl+C to stop)...')
  const interval = 150

  while (true) {
    await sendBrightness(255)
    currentBrightness = 255
    await new Promise((r) => setTimeout(r, interval))

    await sendBrightness(0)
    currentBrightness = 0
    await new Promise((r) => setTimeout(r, interval))
  }
}

async function main() {
  const args = process.argv.slice(2)

  console.log(`Tie Switch Test — Device ${DEVICE_ID}, DMX ch ${DMX_START_CHANNEL}, Universe ${UNIVERSE}`)

  if (args.includes('--on')) {
    console.log('Fading to full brightness...')
    await fadeTo(255)
    setTimeout(() => process.exit(0), 100)
    return
  }

  if (args.includes('--off')) {
    console.log('Fading to off...')
    await fadeTo(0, 1000)
    setTimeout(() => process.exit(0), 100)
    return
  }

  const brightnessIdx = args.indexOf('--brightness')
  if (brightnessIdx !== -1) {
    const val = Math.min(255, Math.max(0, parseInt(args[brightnessIdx + 1])))
    console.log(`Fading to brightness ${val}...`)
    await fadeTo(val)
    setTimeout(() => process.exit(0), 100)
    return
  }

  if (args.includes('--strobe')) {
    await strobeMode()
    return
  }

  await cycleMode()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
