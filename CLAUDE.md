# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A subtitle teleprompter system for live theater/performances. An Electron desktop app controls subtitle text and sends it over WebSocket to ESP8266-powered LED matrix panels that display Hebrew text to the audience.

## Commands

```bash
pnpm install        # install deps
pnpm dev            # run electron app in dev mode (HMR)
pnpm build:mac      # production build for macOS
pnpm lint           # eslint with auto-fix
pnpm typecheck      # typecheck both node and web tsconfigs
```

## Architecture

### Data Flow

1. Script JSON files (`src/renderer/src/HeathersScript.json`, `RotatingList.json`) contain arrays of Hebrew text lines
2. `textTransformer.ts` splits lines into display pairs `[line1, line2]` based on pixel width constraints (max 192px per line, using `charMap.ts` for per-character widths)
3. The React renderer shows the current/surrounding lines and sends the active line via IPC (`show_line`)
4. The Electron main process receives IPC and forwards to all connected WebSocket clients (`ws-server.ts` on port 8081)
5. ESP8266 Arduino clients connect to the WebSocket, receive semicolon-delimited text, and render it on 96x32 NeoPixel LED matrices using a custom Hebrew font

### Key Modules

- **`src/main/index.ts`** — Electron main process, IPC handler, bridges renderer to WS server
- **`src/main/ws-server.ts`** — WebSocket server (port 8081) that maintains connected LED panel clients
- **`src/renderer/src/App.tsx`** — Teleprompter UI with line navigation (arrow keys, go-to-line, custom text input, rotating list mode)
- **`src/renderer/src/textTransformer.ts`** — Splits script text into display-ready line pairs based on pixel-width calculation
- **`src/renderer/src/charMap.ts`** — Character-to-pixel-width mapping for the LED panel font
- **`arduino/mvp/`** — ESP8266 firmware for the left LED panel (connects to WiFi "like-that-subs", renders Hebrew via WebSocket)
- **`arduino/mvp-right/`** — Same for the right panel

### Text Transformation

The `charMap` maps each Hebrew character to its rendered pixel width on the LED matrix. `textTransformer` uses this to word-wrap script lines into pairs that fit the physical display (192px wide). Lines too long get split at sentence-ending punctuation first, then word-wrapped.
