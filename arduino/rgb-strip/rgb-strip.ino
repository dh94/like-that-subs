#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "config.h"

WebSocketsClient webSocket;

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
  analogWrite(PIN_R, r);
  analogWrite(PIN_G, g);
  analogWrite(PIN_B, b);
  state.currentR = r;
  state.currentG = g;
  state.currentB = b;
}

void startTransition(uint8_t r, uint8_t g, uint8_t b, const char* fx, unsigned long dur) {
  state.targetR = r;
  state.targetG = g;
  state.targetB = b;
  state.startR = state.currentR;
  state.startG = state.currentG;
  state.startB = state.currentB;
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
    // "abrupt" or unknown
    state.effect = ABRUPT;
    applyColor(r, g, b);
  }
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

// --- Message Parsing ---

void handleBatch(uint8_t* payload) {
  StaticJsonDocument<2048> doc;
  DeserializationError error = deserializeJson(doc, (char*)payload);
  if (error) {
    Serial.print("JSON parse error: ");
    Serial.println(error.c_str());
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
        Serial.printf("Cue: rgb(%d,%d,%d) fx=%s dur=%lu\n", r, g, b, fx, dur);
        break;
      }
    }
  } else if (strcmp(type, "sync") == 0) {
    int id = doc["id"];
    if (id == DEVICE_ID) {
      uint8_t r = doc["r"];
      uint8_t g = doc["g"];
      uint8_t b = doc["b"];
      applyColor(r, g, b);
      state.effect = NONE;
      Serial.printf("Sync: rgb(%d,%d,%d)\n", r, g, b);
    }
  }
}

// --- WebSocket Events ---

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      break;

    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to %s\n", (char*)payload);
      break;

    case WStype_TEXT:
      if (length == 0) return;

      // Respond to identification probe
      if (strcmp((char*)payload, "Who?") == 0) {
        char response[16];
        snprintf(response, sizeof(response), "Light %d", DEVICE_ID);
        webSocket.sendTXT(response);
        Serial.printf("Identified as Light %d\n", DEVICE_ID);
        return;
      }

      // Only parse JSON messages (starts with '{')
      if (payload[0] == '{') {
        handleBatch(payload);
      }
      // Ignore plain text (subtitle data for other devices)
      break;

    default:
      break;
  }
}

// --- Setup & Loop ---

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.printf("RGB Strip Controller - Device %d\n", DEVICE_ID);

  // PWM setup
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  analogWriteFreq(5000);
  analogWriteRange(255);
  applyColor(0, 0, 0);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());

  // WebSocket
  webSocket.begin(WS_HOST, WS_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  webSocket.loop();
  updateTransition();
}
