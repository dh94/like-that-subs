# Arduino IDE Setup

How to configure a fresh Arduino IDE to build and flash the firmware in `arduino/`.

There are **two board families** in this project:

| Sketch(es) | Board | What it drives |
| --- | --- | --- |
| `arduino/mvp/`, `arduino/mvp-right/` | **ESP8266** (NodeMCU / Wemos D1 mini) | 96×32 NeoPixel LED matrix (subtitles) |
| `arduino/rgb-strip-ws/`, `arduino/rgb-strip-artnet/`, `arduino/tie-switch/`, `arduino/sacn-network-test/`, `arduino/color-test/` | **ESP32-C3** (Super Mini) | RGB LED strips / single-channel switch via MOSFETs |

## 1. Install the IDE

Arduino IDE 2.x — https://www.arduino.cc/en/software

## 2. Add board manager URLs

`Arduino IDE → Settings → Additional boards manager URLs`, add both:

```
https://arduino.esp8266.com/stable/package_esp8266com_index.json
https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
```

Then `Tools → Board → Boards Manager` and install:

- **esp8266** by ESP8266 Community
- **esp32** by Espressif Systems — **use 3.x**. The RGB sketches call `ledcAttach(pin, freq, res)` / `ledcWrite(pin, val)`, which is the 3.x LEDC API. On 2.x it won't compile (that used `ledcSetup`/`ledcAttachPin`).

## 3. Install libraries

`Tools → Manage Libraries`, install:

| Library | Author | Used by |
| --- | --- | --- |
| **WebSockets** (`arduinoWebSockets`) | Markus Sattler (Links2004) | all WS sketches (`#include <WebSocketsClient.h>`) |
| **ArduinoJson** (v6.x) | Benoit Blanchon | `rgb-strip-ws`, `tie-switch` (`StaticJsonDocument`, v6 API) |
| **Adafruit GFX Library** | Adafruit | `mvp`, `mvp-right` |
| **Adafruit NeoMatrix** | Adafruit | `mvp`, `mvp-right` |
| **Adafruit NeoPixel** | Adafruit | `mvp`, `mvp-right` (dep of NeoMatrix) |

`WiFi.h`, `WiFiUdp.h`, `ESP8266WiFi.h` ship with the board cores — no separate install.

> ArduinoJson: stay on **v6**. v7 deprecates `StaticJsonDocument` and the code will warn/break.

The Hebrew fonts (`fonts.h`, `opensanshebrew_bold_8pt_full.h`) live next to the `mvp` sketch and load automatically as tabs — nothing to install.

## 4. Board settings

### ESP8266 (subtitle matrix)
- **Board:** NodeMCU 1.0 (ESP-12E Module) — or your specific ESP8266 board
- **Upload Speed:** 115200
- **CPU Frequency:** 80 MHz (160 fine)
- **Flash Size:** 4MB

### ESP32-C3 (RGB / switches)
- **Board:** ESP32C3 Dev Module (Super Mini is compatible)
- **USB CDC On Boot:** **Enabled** — required to see `Serial` output over USB on the C3
- **Upload Speed:** 115200

## 5. Per-device config

The ESP32 sketches read an adjacent `config.h`. Before flashing each unit, set:

```c
#define DEVICE_ID 1          // unique 1..15 per device
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"
#define WS_HOST   "2.10.10.100"  // laptop running the Electron app
#define WS_PORT   8081
#define PIN_R 2                  // ESP32-C3 usable GPIOs: 0-10, 20, 21
#define PIN_G 3
#define PIN_B 4
```

For `rgb-strip-artnet` also set `ARTNET_UNIVERSE`; DMX channel is derived (`(DEVICE_ID-1)*3`).

The ESP8266 `mvp` sketch has WiFi creds and the WS server IP hardcoded in the `.ino` — edit `ssid`/`password` and the `webSocket.begin("192.168.1.102", 8081, "/")` line directly.

## 6. Flash

1. USB-connect the board, pick the port under `Tools → Port`.
2. If upload fails on the ESP32-C3, hold **BOOT**, tap **RST**, release BOOT, then upload.
3. Open Serial Monitor at **115200** to watch WiFi/WS connection logs.

## Hardware summary

- **ESP8266** → NeoPixel matrix data pin on **GPIO4** (`#define PIN 4`), 8×(16×16) tiles = 96×32, `NEO_GRB + NEO_KHZ800`.
- **ESP32-C3** → 3× PWM (`GPIO2/3/4`) into MOSFET gates driving R/G/B strip channels; 5 kHz, 8-bit.
- WiFi network: SSID `like-that-subs`, router at `2.10.10.1`, DHCP `2.10.10.100–249`.
