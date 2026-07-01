#include <WiFi.h>
#include <WiFiUdp.h>
#include "config.h"

// --- sACN (E1.31) via raw UDP unicast ---
#define SACN_PORT 5568
#define PONG_PORT 5569
#define SACN_HEADER_SIZE 126
#define SACN_PACKET_MIN_SIZE (SACN_HEADER_SIZE + DMX_START_CHANNEL + 2)

WiFiUDP sacnUdp;
uint8_t sacnBuf[638];
unsigned long packetCount = 0;
unsigned long lastPacketTime = 0;

// --- Transition State ---
enum Effect { NONE, FADE, ABRUPT, FLASH, PULSE };

struct LightState {
  uint8_t currentR, currentG, currentB;
  uint8_t targetR, targetG, targetB;
  uint8_t startR, startG, startB;
  unsigned long transitionStart;
  unsigned long duration;
  Effect effect;
  uint8_t flashCount;
  uint8_t flashesDone;
  bool flashOn;
  unsigned long lastFlashToggle;
};

LightState state = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NONE, 0, 0, false, 0};

void applyColor(uint8_t r, uint8_t g, uint8_t b) {
  ledcWrite(PIN_R, r);
  ledcWrite(PIN_G, g);
  ledcWrite(PIN_B, b);
  state.currentR = r;
  state.currentG = g;
  state.currentB = b;
}

void updateTransition() {
  if (state.effect == NONE || state.effect == ABRUPT) return;

  unsigned long elapsed = millis() - state.transitionStart;

  if (state.effect == FADE) {
    if (elapsed >= state.duration) {
      applyColor(state.targetR, state.targetG, state.targetB);
      state.effect = NONE;
    } else {
      float progress = (float)elapsed / (float)state.duration;
      uint8_t r = state.startR + (state.targetR - state.startR) * progress;
      uint8_t g = state.startG + (state.targetG - state.startG) * progress;
      uint8_t b = state.startB + (state.targetB - state.startB) * progress;
      applyColor(r, g, b);
    }
  } else if (state.effect == FLASH) {
    unsigned long flashInterval = state.duration;
    if (millis() - state.lastFlashToggle >= flashInterval) {
      state.lastFlashToggle = millis();
      if (state.flashOn) {
        applyColor(0, 0, 0);
        state.flashOn = false;
        state.flashesDone++;
      } else {
        applyColor(state.targetR, state.targetG, state.targetB);
        state.flashOn = true;
      }
      if (state.flashesDone >= state.flashCount) {
        applyColor(state.targetR, state.targetG, state.targetB);
        state.effect = NONE;
      }
    }
  } else if (state.effect == PULSE) {
    float phase = (float)(elapsed % state.duration) / (float)state.duration;
    float brightness = (sin(phase * 2.0 * PI) + 1.0) / 2.0;
    uint8_t r = state.targetR * brightness;
    uint8_t g = state.targetG * brightness;
    uint8_t b = state.targetB * brightness;
    applyColor(r, g, b);
  }
}

// --- sACN Packet Handling ---

void handleSacnPacket(int len) {
  if (len < SACN_PACKET_MIN_SIZE) {
    Serial.printf("[WARN] Packet too small: %d bytes (need %d)\n", len, SACN_PACKET_MIN_SIZE);
    return;
  }

  if (sacnBuf[0] != 0x00 || sacnBuf[1] != 0x10) {
    Serial.printf("[WARN] Invalid preamble: %02X %02X\n", sacnBuf[0], sacnBuf[1]);
    return;
  }

  uint16_t universe = (sacnBuf[113] << 8) | sacnBuf[114];
  if (universe != SACN_UNIVERSE) {
    // Serial.printf("[WARN] Wrong universe: %d (expected %d)\n", universe, SACN_UNIVERSE);
    return;
  }

  uint8_t r = sacnBuf[SACN_HEADER_SIZE + DMX_START_CHANNEL];
  uint8_t g = sacnBuf[SACN_HEADER_SIZE + DMX_START_CHANNEL + 1];
  uint8_t b = sacnBuf[SACN_HEADER_SIZE + DMX_START_CHANNEL + 2];

  if (r != state.currentR || g != state.currentG || b != state.currentB) {
    state.effect = NONE;
    applyColor(r, g, b);

    unsigned long now = millis();
    unsigned long gap = lastPacketTime > 0 ? now - lastPacketTime : 0;
    lastPacketTime = now;

    Serial.printf("[sACN] rgb(%d,%d,%d) pkt#%lu gap=%lums from %s\n",
                  r, g, b, packetCount,  gap,
                  sacnUdp.remoteIP().toString().c_str());

    // PONG for latency measurement (won't interfere with grandMA2 — it ignores port 5569)
    sacnUdp.beginPacket(sacnUdp.remoteIP(), PONG_PORT);
    sacnUdp.printf("PONG %d %d %d %d", DEVICE_ID, r, g, b);
    sacnUdp.endPacket();
  }

  packetCount++;
}

// --- Setup & Loop ---

void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial.println();
  Serial.println("========================================");
  Serial.printf("  RGB Strip Controller - Device %d\n", DEVICE_ID);
  Serial.printf("  Universe: %d, Channels: %d-%d\n", SACN_UNIVERSE, DMX_START_CHANNEL, DMX_START_CHANNEL + 2);
  Serial.println("  Mode: sACN Unicast (E1.31)");
  Serial.println("========================================");

  // PWM setup
  ledcAttach(PIN_R, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_G, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_B, PWM_FREQ, PWM_RESOLUTION);
  applyColor(0, 0, 0);
  Serial.println("[INIT] PWM configured");

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[WIFI] Connecting to '%s'...\n", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.printf("[WIFI] status: %d\n", WiFi.status());
  }
  WiFi.setSleep(false);
  Serial.printf("[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[WIFI] MAC: %s\n", WiFi.macAddress().c_str());
  Serial.printf("[WIFI] RSSI: %d dBm\n", WiFi.RSSI());

  // sACN unicast listener
  sacnUdp.begin(SACN_PORT);
  Serial.printf("[sACN] Listening on UDP port %d (unicast)\n", SACN_PORT);
  Serial.printf("[sACN] Expecting Universe %d, DMX channels %d-%d (R,G,B)\n",
                SACN_UNIVERSE, DMX_START_CHANNEL, DMX_START_CHANNEL + 2);
  Serial.printf("[sACN] PONG responses on port %d\n", PONG_PORT);
  Serial.println("========================================");
  Serial.println("[READY] Waiting for sACN packets...");
}

void loop() {
  // WiFi reconnect watchdog
  static unsigned long lastWifiCheck = 0;
  if (millis() - lastWifiCheck > 5000) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WIFI] Connection lost — reconnecting...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
  }

  int packetSize = sacnUdp.parsePacket();
  if (packetSize > 0) {
    int len = sacnUdp.read(sacnBuf, sizeof(sacnBuf));
    handleSacnPacket(len);
  }
  updateTransition();

  // Heartbeat every 30s
  static unsigned long lastHB = 0;
  if (millis() - lastHB > 30000) {
    lastHB = millis();
    Serial.printf("[STATUS] uptime=%lus packets=%lu rgb=(%d,%d,%d) RSSI=%d WiFi=%s\n",
                  millis() / 1000, packetCount,
                  state.currentR, state.currentG, state.currentB,
                  WiFi.RSSI(), WiFi.isConnected() ? "OK" : "DISC");
  }
}
