#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// CHANGE THIS FOR EACH DEVICE (1-14)
// ============================================
#define DEVICE_ID 1

// WiFi
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"

// WebSocket server (Electron app)
#define WS_HOST "192.168.1.102"
#define WS_PORT 8081

// RGB PWM pins (connect to MOSFET gates)
#define PIN_R 12  // D6
#define PIN_G 13  // D7
#define PIN_B 14  // D5

#endif
