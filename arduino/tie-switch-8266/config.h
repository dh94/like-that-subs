#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// Tie light switch controller (ESP8266) — on/off only
// ============================================

// WiFi
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"

// WebSocket server (Electron app / laptop)
#define WS_HOST "2.10.10.101"
#define WS_PORT 8081

// Light pin
// ESP8266 (NodeMCU / Wemos D1 mini) — D1 = GPIO5
#define PIN_LIGHT D1

// Set to 1 if the light turns ON when the pin is LOW (low-trigger board / inverted wiring)
#define ACTIVE_LOW 0

// Fallback blink interval (ms) — only used if the server doesn't send one.
// Actual blink rates are controlled by the server (ws-server.ts BLINK_RATES).
#define DEFAULT_BLINK_MS 500

#endif
