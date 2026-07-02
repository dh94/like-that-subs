#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "config.h"

WebSocketsClient webSocket;

// --- Transition State ---
enum Effect { NONE, FADE, ABRUPT, FLASH, PULSE };

struct LightState {
  uint8_t current;
  uint8_t target;
  uint8_t start;
  unsigned long transitionStart;
  unsigned long duration;
  Effect effect;
  uint8_t flashCount;
  uint8_t flashesDone;
  bool flashOn;
  unsigned long lastFlashToggle;
};

LightState state = {0, 0, 0, 0, 0, NONE, 0, 0, false, 0};

void applyBrightness(uint8_t val) {
  ledcWrite(PIN_LIGHT, val);
  state.current = val;
}

void startTransition(uint8_t r, uint8_t g, uint8_t b, const char* fx, unsigned long dur) {
  uint8_t brightness = max(r, max(g, b));

  state.target = brightness;
  state.start = state.current;
  state.transitionStart = millis();
  state.duration = dur;
  state.flashesDone = 0;
  state.flashOn = false;
  state.lastFlashToggle = 0;

  if (strcmp(fx, "fade") == 0) {
    state.effect = FADE;
    if (dur == 0) state.duration = 1000;
  } else if (strcmp(fx, "flash") == 0) {
    state.effect = FLASH;
    state.flashCount = 3;
    if (dur == 0) state.duration = 150;
  } else if (strcmp(fx, "pulse") == 0) {
    state.effect = PULSE;
    if (dur == 0) state.duration = 2000;
  } else {
    state.effect = ABRUPT;
    applyBrightness(brightness);
  }
}

void updateTransition() {
  if (state.effect == NONE || state.effect == ABRUPT) return;

  unsigned long elapsed = millis() - state.transitionStart;

  if (state.effect == FADE) {
    if (elapsed >= state.duration) {
      applyBrightness(state.target);
      state.effect = NONE;
    } else {
      float progress = (float)elapsed / (float)state.duration;
      uint8_t val = state.start + (state.target - state.start) * progress;
      applyBrightness(val);
    }
  } else if (state.effect == FLASH) {
    unsigned long flashInterval = state.duration;
    if (millis() - state.lastFlashToggle >= flashInterval) {
      state.lastFlashToggle = millis();
      if (state.flashOn) {
        applyBrightness(0);
        state.flashOn = false;
        state.flashesDone++;
      } else {
        applyBrightness(state.target);
        state.flashOn = true;
      }
      if (state.flashesDone >= state.flashCount) {
        applyBrightness(state.target);
        state.effect = NONE;
      }
    }
  } else if (state.effect == PULSE) {
    float phase = (float)(elapsed % state.duration) / (float)state.duration;
    float brightness = (sin(phase * 2.0 * PI) + 1.0) / 2.0;
    uint8_t val = state.target * brightness;
    applyBrightness(val);
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
      if (id == DEVICE_ID) {
        uint8_t r = cue["r"];
        uint8_t g = cue["g"];
        uint8_t b = cue["b"];
        const char* fx = cue["fx"] | "abrupt";
        unsigned long dur = cue["dur"] | 0;
        startTransition(r, g, b, fx, dur);
        uint8_t brightness = max(r, max(g, b));
        Serial.printf("[WS] Cue: brightness=%d fx=%s dur=%lu\n", brightness, fx, dur);
        break;
      }
    }
  } else if (strcmp(type, "sync") == 0) {
    int id = doc["id"];
    if (id == DEVICE_ID) {
      uint8_t r = doc["r"];
      uint8_t g = doc["g"];
      uint8_t b = doc["b"];
      uint8_t brightness = max(r, max(g, b));
      applyBrightness(brightness);
      state.effect = NONE;
      Serial.printf("[WS] Sync: brightness=%d\n", brightness);
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
        char response[16];
        snprintf(response, sizeof(response), "Light %d", DEVICE_ID);
        webSocket.sendTXT(response);
        Serial.printf("[WS] Identified as Light %d (Tie)\n", DEVICE_ID);
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
  Serial.printf("  Tie Switch Controller - Device %d\n", DEVICE_ID);
  Serial.println("  Mode: WebSocket only (always active)");
  Serial.printf("  Server: %s:%d\n", WS_HOST, WS_PORT);
  Serial.println("========================================");

  // PWM setup — single channel
  ledcAttach(PIN_LIGHT, 5000, 8);
  applyBrightness(0);
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

  // WebSocket
  webSocket.begin(WS_HOST, WS_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
  Serial.printf("[WS] Connecting to ws://%s:%d/\n", WS_HOST, WS_PORT);
  Serial.println("========================================");
  Serial.println("[READY] Waiting for cues...");
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
  updateTransition();
  yield();

  // Heartbeat every 30s
  static unsigned long lastHB = 0;
  if (millis() - lastHB > 30000) {
    lastHB = millis();
    Serial.printf("[STATUS] uptime=%lus msgs=%lu brightness=%d RSSI=%d WiFi=%s WS=%s disconnects=%lu\n",
                  millis() / 1000, wsMessageCount,
                  state.current,
                  WiFi.RSSI(),
                  WiFi.isConnected() ? "OK" : "DISC",
                  webSocket.isConnected() ? "OK" : "DISC",
                  wsDisconnectCount);
  }
}
