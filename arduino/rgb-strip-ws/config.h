#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// CHANGE THIS FOR EACH DEVICE (1-15)
// ============================================
#define DEVICE_ID 1

// WiFi
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"

// WebSocket server (Electron app / laptop)
#define WS_HOST "2.10.10.100"
#define WS_PORT 8081

// RGB PWM pins (connect to MOSFET gates)
// ESP32-C3 Super Mini available GPIOs: 0-10, 20, 21
#define PIN_R 2
#define PIN_G 3
#define PIN_B 4

// PWM config
#define PWM_FREQ 5000
#define PWM_RESOLUTION 8  // 8-bit = 0-255

#endif
