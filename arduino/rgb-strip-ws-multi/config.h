#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// DEVICE IDs — this ESP32 handles TWO devices
// ============================================
#define DEVICE_ID_A 1
#define DEVICE_ID_B 2

// WiFi
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"

// WebSocket server (Electron app / laptop)
#define WS_HOST "2.10.10.100"
#define WS_PORT 8081

// RGB PWM pins — LED A
// ESP32-C3 Super Mini available GPIOs: 0-10, 20, 21
#define PIN_R_A 2
#define PIN_G_A 3
#define PIN_B_A 4

// RGB PWM pins — LED B
#define PIN_R_B 5
#define PIN_G_B 6
#define PIN_B_B 7

// PWM config
#define PWM_FREQ 5000
#define PWM_RESOLUTION 8  // 8-bit = 0-255

#endif
