#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// CHANGE THIS FOR EACH DEVICE (1-15)
// ============================================
#define DEVICE_ID 13

// WiFi
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"

// WebSocket server (Electron app / laptop)
#define WS_HOST "2.10.10.100"
#define WS_PORT 8081

// RGB PWM pins (connect to MOSFET gates)
// ESP8266 (NodeMCU / Wemos D1 mini) — D1=GPIO5, D2=GPIO4, D3=GPIO0
#define PIN_R D1
#define PIN_G D2
#define PIN_B D3

// PWM config
#define PWM_FREQ 5000
#define PWM_RANGE 255  // 0-255 duty range

#endif
