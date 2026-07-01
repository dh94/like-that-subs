#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// CHANGE THIS FOR EACH DEVICE (1-15)
// ============================================
#define DEVICE_ID 1

// WiFi
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"

// RGB PWM pins (connect to MOSFET gates)
// ESP32-C3 Super Mini available GPIOs: 0-10, 20, 21
#define PIN_R 2
#define PIN_G 3
#define PIN_B 4

// PWM config
#define PWM_FREQ 5000
#define PWM_RESOLUTION 8  // 8-bit = 0-255

// sACN (E1.31) config — unicast mode
// grandMA2 sends to each ESP32's IP directly
#define SACN_UNIVERSE 4
#define DMX_START_CHANNEL ((DEVICE_ID - 1) * 3)

#endif
