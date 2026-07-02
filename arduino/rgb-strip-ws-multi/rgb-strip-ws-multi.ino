#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "config.h"

WebSocketsClient webSocket;

// --- Transition State (per LED output) ---
enum Effect { NONE, FADE, ABRUPT, FLASH, PULSE };

struct LightState {
  uint8_t pinR, pinG, pinB;
  int deviceId;
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

LightState lights[2] = {
  { PIN_R_A, PIN_G_A, PIN_B_A, DEVICE_ID_A, 0,0,0, 0,0,0, 0,0,0, 0, 0, NONE, 0, 0, false, 0 },
  { PIN_R_B, PIN_G_B, PIN_B_B, DEVICE_ID_B, 0,0,0, 0,0,0, 0,0,0, 0, 0, NONE, 0, 0, false, 0 },
};

void applyColor(LightState &s, uint8_t r, uint8_t g, uint8_t b) {
  ledcWrite(s.pinR, r);
  ledcWrite(s.pinG, g);
  ledcWrite(s.pinB, b);
  s.currentR = r;
  s.currentG = g;
  s.currentB = b;
}

void startTransition(LightState &s, uint8_t r, uint8_t g, uint8_t b, const char* fx, unsigned long dur) {
  s.targetR = r;
  s.targetG = g;
  s.targetB = b;
  s.startR = s.currentR;
  s.startG = s.currentG;
  s.startB = s.currentB;
  s.transitionStart = millis();
  s.duration = dur;
  s.flashesDone = 0;
  s.flashOn = false;
  s.lastFlashToggle = 0;

  if (strcmp(fx, "fade") == 0) {
    s.effect = FADE;
    if (dur == 0) s.duration = 1000;
  } else if (strcmp(fx, "flash") == 0) {
    s.effect = FLASH;
    s.flashCount = 3;
    if (dur == 0) s.duration = 150;
  } else if (strcmp(fx, "pulse") == 0) {
    s.effect = PULSE;
    if (dur == 0) s.duration = 2000;
  } else {
    s.effect = ABRUPT;
    applyColor(s, r, g, b);
  }
}

void updateTransition(LightState &s) {
  if (s.effect == NONE || s.effect == ABRUPT) return;

  unsigned long elapsed = millis() - s.transitionStart;

  if (s.effect == FADE) {
    if (elapsed >= s.duration) {
      applyColor(s, s.targetR, s.targetG, s.targetB);
      s.effect = NONE;
    } else {
      float progress = (float)elapsed / (float)s.duration;
      uint8_t r = s.startR + (s.targetR - s.startR) * progress;
      uint8_t g = s.startG + (s.targetG - s.startG) * progress;
      uint8_t b = s.startB + (s.targetB - s.startB) * progress;
      applyColor(s, r, g, b);
    }
  } else if (s.effect == FLASH) {
    unsigned long flashInterval = s.duration;
    if (millis() - s.lastFlashToggle >= flashInterval) {
      s.lastFlashToggle = millis();
      if (s.flashOn) {
        applyColor(s, 0, 0, 0);
        s.flashOn = false;
        s.flashesDone++;
      } else {
        applyColor(s, s.targetR, s.targetG, s.targetB);
        s.flashOn = true;
      }
      if (s.flashesDone >= s.flashCount) {
        applyColor(s, s.targetR, s.targetG, s.targetB);
        s.effect = NONE;
      }
    }
  } else if (s.effect == PULSE) {
    float phase = (float)(elapsed % s.duration) / (float)s.duration;
    float brightness = (sin(phase * 2.0 * PI) + 1.0) / 2.0;
    uint8_t r = s.targetR * brightness;
    uint8_t g = s.targetG * brightness;
    uint8_t b = s.targetB * brightness;
    applyColor(s, r, g, b);
  }
}

// --- Message Parsing ---

void handleMessage(uint8_t* payload) {
  StaticJsonDocument<2048> doc;
  DeserializationError error = deserializeJson(doc, (char*)payload);
  if (error) {
    Serial.printf("[WS] JSON parse error: %s\n", error.c_str());
    return;
  }

  const char* type = doc["type"];
  if (!type) return;

  if (strcmp(type, "batch") == 0) {
    JsonArray cues = doc["cues"];
    for (JsonObject cue : cues) {
      int id = cue["id"];
      for (int i = 0; i < 2; i++) {
        if (id == lights[i].deviceId) {
          uint8_t r = cue["r"];
          uint8_t g = cue["g"];
          uint8_t b = cue["b"];
          const char* fx = cue["fx"] | "abrupt";
          unsigned long dur = cue["dur"] | 0;
          startTransition(lights[i], r, g, b, fx, dur);
          Serial.printf("[WS] Cue D%d: rgb(%d,%d,%d) fx=%s dur=%lu\n", id, r, g, b, fx, dur);
          break;
        }
      }
    }
  } else if (strcmp(type, "sync") == 0) {
    int id = doc["id"];
    for (int i = 0; i < 2; i++) {
      if (id == lights[i].deviceId) {
        uint8_t r = doc["r"];
        uint8_t g = doc["g"];
        uint8_t b = doc["b"];
        applyColor(lights[i], r, g, b);
        lights[i].effect = NONE;
        Serial.printf("[WS] Sync D%d: rgb(%d,%d,%d)\n", id, r, g, b);
        break;
      }
    }
  }
}

// --- WebSocket Events ---

unsigned long wsMessageCount = 0;
unsigned long wsDisconnectCount = 0;

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsDisconnectCount++;
      Serial.printf("[WS] Disconnected (total: %lu)\n", wsDisconnectCount);
      break;

    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to %s\n", (char*)payload);
      break;

    case WStype_TEXT:
      if (length == 0) return;

      if (strcmp((char*)payload, "Who?") == 0) {
        char response[32];
        snprintf(response, sizeof(response), "Light %d", lights[0].deviceId);
        webSocket.sendTXT(response);
        Serial.printf("[WS] Identified as Light %d (also handling %d)\n",
                      lights[0].deviceId, lights[1].deviceId);
        return;
      }

      if (payload[0] == '{') {
        wsMessageCount++;
        handleMessage(payload);
      }
      break;

    default:
      break;
  }
}

// --- Setup & Loop ---

void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial.println();
  Serial.println("========================================");
  Serial.printf("  RGB Strip Controller (Multi)\n");
  Serial.printf("  LED A: Device %d (pins %d,%d,%d)\n", DEVICE_ID_A, PIN_R_A, PIN_G_A, PIN_B_A);
  Serial.printf("  LED B: Device %d (pins %d,%d,%d)\n", DEVICE_ID_B, PIN_R_B, PIN_G_B, PIN_B_B);
  Serial.println("  Mode: WebSocket (Bridge)");
  Serial.printf("  Server: %s:%d\n", WS_HOST, WS_PORT);
  Serial.println("========================================");

  // PWM setup for both outputs
  ledcAttach(PIN_R_A, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_G_A, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_B_A, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_R_B, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_G_B, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(PIN_B_B, PWM_FREQ, PWM_RESOLUTION);
  applyColor(lights[0], 0, 0, 0);
  applyColor(lights[1], 0, 0, 0);
  Serial.println("[INIT] PWM configured (6 channels)");

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

  // WebSocket
  webSocket.begin(WS_HOST, WS_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
  Serial.printf("[WS] Connecting to ws://%s:%d/\n", WS_HOST, WS_PORT);
  Serial.println("========================================");
  Serial.println("[READY] Waiting for commands...");
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

  if (WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
  }
  updateTransition(lights[0]);
  updateTransition(lights[1]);
  yield();

  // Heartbeat every 30s
  static unsigned long lastHB = 0;
  if (millis() - lastHB > 30000) {
    lastHB = millis();
    Serial.printf("[STATUS] uptime=%lus msgs=%lu RSSI=%d WiFi=%s WS=%s disconnects=%lu\n",
                  millis() / 1000, wsMessageCount,
                  WiFi.RSSI(),
                  WiFi.isConnected() ? "OK" : "DISC",
                  webSocket.isConnected() ? "OK" : "DISC",
                  wsDisconnectCount);
    Serial.printf("  LED A (D%d): rgb(%d,%d,%d)\n", lights[0].deviceId, lights[0].currentR, lights[0].currentG, lights[0].currentB);
    Serial.printf("  LED B (D%d): rgb(%d,%d,%d)\n", lights[1].deviceId, lights[1].currentR, lights[1].currentG, lights[1].currentB);
  }
}
