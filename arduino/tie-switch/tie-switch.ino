#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "config.h"

// --- sACN (E1.31) via raw UDP ---
#define SACN_PORT 5568
#define SACN_HEADER_SIZE 126
#define SACN_PACKET_MIN_SIZE (SACN_HEADER_SIZE + DMX_START_CHANNEL)

WiFiUDP sacnUdp;
uint8_t sacnBuf[638];

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
  // Collapse RGB to single brightness (use max channel as on/off proxy)
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

// --- sACN Packet Handling ---

void handleSacnPacket(int len) {
  if (len < SACN_PACKET_MIN_SIZE) return;

  if (sacnBuf[0] != 0x00 || sacnBuf[1] != 0x10) return;

  uint16_t universe = (sacnBuf[113] << 8) | sacnBuf[114];
  if (universe != SACN_UNIVERSE) return;

  // Use the R channel as brightness for the switch
  uint8_t brightness = sacnBuf[SACN_HEADER_SIZE + DMX_START_CHANNEL];

  if (brightness != state.current) {
    state.effect = NONE;
    applyBrightness(brightness);
    Serial.printf("[sACN] brightness=%d ch%d\n", brightness, DMX_START_CHANNEL);
  }
}

// --- Message Parsing ---

void handleMessage(uint8_t* payload) {
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
        uint8_t brightness = max(r, max(g, b));
        Serial.printf("Cue: brightness=%d fx=%s dur=%lu\n", brightness, fx, dur);
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
      Serial.printf("Sync: brightness=%d\n", brightness);
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

      if (strcmp((char*)payload, "Who?") == 0) {
        char response[16];
        snprintf(response, sizeof(response), "Light %d", DEVICE_ID);
        webSocket.sendTXT(response);
        Serial.printf("Identified as Light %d\n", DEVICE_ID);
        return;
      }

      if (payload[0] == '{') {
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
  Serial.printf("Tie Switch Controller (ESP32) - Device %d\n", DEVICE_ID);

  // PWM setup — single channel on PIN_LIGHT
  ledcAttach(PIN_LIGHT, 5000, 8);
  applyBrightness(0);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Connecting to WiFi '%s'...\n", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.printf("  status: %d\n", WiFi.status());
  }
  applyBrightness(0);
  WiFi.setSleep(false);
  Serial.println();
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());

  // sACN (E1.31) multicast listener
  IPAddress multicastAddr(239, 255, 0, SACN_UNIVERSE);
  sacnUdp.beginMulticast(multicastAddr, SACN_PORT);
  Serial.printf("sACN listening on 239.255.0.%d:%d, Universe %d, channel %d\n",
                SACN_UNIVERSE, SACN_PORT, SACN_UNIVERSE, DMX_START_CHANNEL);

  // WebSocket
  webSocket.begin(WS_HOST, WS_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  int packetSize = sacnUdp.parsePacket();
  if (packetSize > 0) {
    int len = sacnUdp.read(sacnBuf, sizeof(sacnBuf));
    handleSacnPacket(len);
  }

  webSocket.loop();
  updateTransition();
}
