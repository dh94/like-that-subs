#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// Tie light switch controller
// ============================================
#define DEVICE_ID 16

// WiFi
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"

// WebSocket server (Electron app)
#define WS_HOST "192.168.31.102"
#define WS_PORT 8081

// Light switch pin
#define PIN_LIGHT 5

// sACN (E1.31) config — single channel (on/off brightness)
#define SACN_UNIVERSE 4
#define DMX_START_CHANNEL ((DEVICE_ID - 1) * 3 + 1)

#endif
