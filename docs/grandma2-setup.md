# grandMA2 sACN Integration

## Overview

The ESP32 RGB strip controllers receive lighting data via **sACN (E1.31) unicast** from a grandMA2 console. Each ESP32 listens on UDP port 5568 for E1.31 packets addressed directly to its IP.

The Electron app has a mode toggle — when set to "sACN", it stops sending lighting commands over WebSocket, letting grandMA2 take full control.

## Architecture

```
grandMA2 console (wired to router)
    │
    │  sACN unicast (UDP 5568) — one packet per ESP32 IP
    ▼
┌─────────────────────────────────────────┐
│  Xiaomi AX3000 Router                   │
│  IP: 2.10.10.1                          │
│  SSID: "like-that-subs" (WPA2)         │
│  DHCP: 2.10.10.100 - 2.10.10.249       │
└─────────────────────────────────────────┘
    │ WiFi
    ▼
ESP32-C3 devices (15x) — each with unique IP
```

## Why Unicast (not Multicast)

Multicast does not work on the Xiaomi AX3000 — the router drops multicast packets between WiFi clients regardless of IGMP/AP isolation settings. This was tested and confirmed.

Unicast latency is excellent: **<5ms one-way**.

With grandMA2 sending continuously at ~40Hz, occasional packet drops (~10%) are invisible — the next packet arrives 25ms later with current values.

## Network Configuration

| Item | Value |
|------|-------|
| Router IP | `2.10.10.1` |
| Subnet mask | `255.255.255.0` |
| DHCP range | `2.10.10.100` - `2.10.10.249` |
| WiFi SSID | `like-that-subs` |
| WiFi password | `shooliboom` |
| WiFi encryption | WPA2 (psk2) |
| grandMA2 IP | Static, e.g. `2.10.10.50` |

### Router SSH Access

```
ssh root@2.10.10.1
```

Key settings applied:
```bash
uci set network.lan.ipaddr='2.10.10.1'
uci set network.lan.netmask='255.255.255.0'
uci set dhcp.lan.start='100'
uci set dhcp.lan.limit='150'
uci set wireless.miot_2G.ap_isolate='0'
```

## grandMA2 Configuration

1. Connect grandMA2 Ethernet to the router LAN port
2. Assign static IP: `2.10.10.50`, subnet `255.255.255.0`, gateway `2.10.10.1`
3. Open **Network Protocols → sACN** tab
4. Configure output:
   - Mode: **OutputUnicast**
   - Universe: **4**
   - Priority: 100
   - Add a row for each ESP32 IP (see table below)

## DMX Channel Mapping (Universe 4)

| Device | Start Channel | R | G | B | ESP32 IP |
|--------|--------------|---|---|---|----------|
| 1  | 1  | 1  | 2  | 3  | (assign) |
| 2  | 4  | 4  | 5  | 6  | (assign) |
| 3  | 7  | 7  | 8  | 9  | (assign) |
| 4  | 10 | 10 | 11 | 12 | (assign) |
| 5  | 13 | 13 | 14 | 15 | (assign) |
| 6  | 16 | 16 | 17 | 18 | (assign) |
| 7  | 19 | 19 | 20 | 21 | (assign) |
| 8  | 22 | 22 | 23 | 24 | (assign) |
| 9  | 25 | 25 | 26 | 27 | (assign) |
| 10 | 28 | 28 | 29 | 30 | (assign) |
| 11 | 31 | 31 | 32 | 33 | (assign) |
| 12 | 34 | 34 | 35 | 36 | (assign) |
| 13 | 37 | 37 | 38 | 39 | (assign) |
| 14 | 40 | 40 | 41 | 42 | (assign) |
| 15 | 43 | 43 | 44 | 45 | (assign) |

Formula: Device N → start channel = `(N-1) * 3 + 1`

## ESP32 Firmware

**Board:** ESP32C3 Dev Module  
**USB CDC On Boot:** Enabled (required for Serial output)

Each device needs `config.h` flashed with its unique `DEVICE_ID` (1-15). The firmware:
- Connects to WiFi, disables power save
- Listens on UDP 5568 for E1.31 packets
- Validates preamble, universe, extracts RGB from its assigned channels
- Applies color to PWM outputs (8-bit, 0-255)

### Flashing Checklist

For each of the 15 ESP32s:
1. Set `DEVICE_ID` in `config.h` (1-15)
2. Verify pin assignments match wiring (`PIN_R`, `PIN_G`, `PIN_B`)
3. Flash with Arduino IDE (Board: ESP32C3 Dev Module, USB CDC: Enabled)
4. Note the IP from Serial output — add to grandMA2 unicast destinations

## Electron App

In the Lighting Monitor window, toggle **WS / sACN**:
- **WS mode** (default): Electron sends lighting cues over WebSocket
- **sACN mode**: Electron stops sending lighting commands; grandMA2 has full control

## Testing Without grandMA2

```bash
# Install dependencies
pnpm install

# Ping test — measures latency
node scripts/sacn-test-rgb.mjs --ping

# Cycle colors across all configured devices
node scripts/sacn-test-rgb.mjs

# Set all devices to red
node scripts/sacn-test-rgb.mjs --all --color ff0000

# Set device 3 to green
node scripts/sacn-test-rgb.mjs --device 3 --color 00ff00

# Blackout
node scripts/sacn-test-rgb.mjs --blackout
```

Configure device IPs in `scripts/sacn-test-rgb.mjs` at the top (`DEVICE_IPS` object).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| ESP32 won't connect to WiFi | Check USB CDC On Boot = Enabled. Verify SSID/password. Power cycle. |
| WiFi status 4 (connect failed) | Router might need `wifi down && wifi up` via SSH. Or re-flash ESP32. |
| No packets received | Confirm ESP32 IP is in grandMA2's unicast destination list. Check universe = 4. |
| Wrong colors | Verify DEVICE_ID matches the grandMA2 channel assignment. |
| High latency (>100ms) | Should not happen with unicast. Check WiFi signal (RSSI in Serial log). |
| Packet drops | Normal at ~5-10% on WiFi. grandMA2's 40Hz refresh makes this invisible. |
| Multicast doesn't work | Known limitation of Xiaomi AX3000. Use unicast only. |
| Serial shows nothing | Set USB CDC On Boot = Enabled in Arduino IDE board settings. |

## Static IP Assignment

For production, assign static IPs via DHCP reservation on the router. SSH in and:

```bash
# Example: bind ESP32 MAC to fixed IP
uci add dhcp host
uci set dhcp.@host[-1].mac='XX:XX:XX:XX:XX:XX'
uci set dhcp.@host[-1].ip='2.10.10.111'
uci set dhcp.@host[-1].name='light-1'
uci commit dhcp
/etc/init.d/dnsmasq restart
```

Get each ESP32's MAC from its Serial boot log (`[WIFI] MAC: ...`).
