#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "config.h"

WebSocketsClient webSocket;

// --- Tie state ---
enum TieEffect { TIE_OFF, TIE_ON, TIE_BLINK };

TieEffect effect = TIE_OFF;
bool blinkPhaseOn = false;
unsigned long lastToggle = 0;
unsigned long blinkInterval = DEFAULT_BLINK_MS;  // set by server per cue

const uint8_t ON_LEVEL = ACTIVE_LOW ? LOW : HIGH;
const uint8_t OFF_LEVEL = ACTIVE_LOW ? HIGH : LOW;

void setLight(bool on) {
  if (on == true) {
    Serial.printf("Send digital Turn on \n");
  } else {
    Serial.printf("Send digital Turn off \n");
  }
  digitalWrite(PIN_LIGHT, on ? 0x0 : OFF_LEVEL);
}

void setEffect(const char* fx, unsigned long interval) {
  if (strcmp(fx, "on") == 0) {
    effect = TIE_ON;
    setLight(true);
  } else if (strcmp(fx, "off") == 0) {
    effect = TIE_OFF;
    setLight(false);
  } else if (strcmp(fx, "slow_blink") == 0 || strcmp(fx, "fast_blink") == 0) {
    effect = TIE_BLINK;
    blinkInterval = interval > 0 ? interval : DEFAULT_BLINK_MS;
    blinkPhaseOn = true;
    setLight(true);
    lastToggle = millis();
  } else {
    Serial.printf("[WS] Unknown effect: %s\n", fx);
    return;
  }
  Serial.printf("[WS] Effect -> %s (interval=%lu)\n", fx, blinkInterval);
}

void updateBlink() {
  if (effect != TIE_BLINK) return;

  if (millis() - lastToggle >= blinkInterval) {
    lastToggle = millis();
    blinkPhaseOn = !blinkPhaseOn;
    setLight(blinkPhaseOn);
  }
}

// --- Message Parsing ---

void handleMessage(uint8_t* payload) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, (char*)payload);
  if (error) {
    Serial.printf("[WS] JSON parse error: %s\n", error.c_str());
    return;
  }

  const char* type = doc["type"];
  if (!type || strcmp(type, "tie") != 0) return;

  const char* fx = doc["effect"];
  unsigned long interval = doc["interval"] | 0;
  if (fx) setEffect(fx, interval);
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
        webSocket.sendTXT("Tie");
        Serial.println("[WS] Identified as Tie");
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
  Serial.println("  Tie Switch Controller [ESP8266]");
  Serial.println("  Mode: WebSocket (on/off/blink)");
  Serial.printf("  Server: %s:%d\n", WS_HOST, WS_PORT);
  Serial.printf("  Active %s\n", ACTIVE_LOW ? "LOW" : "HIGH");
  Serial.println("========================================");

  pinMode(PIN_LIGHT, OUTPUT);
  setLight(false);
  Serial.println("[INIT] Light off");

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[WIFI] Connecting to '%s'...\n", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.printf("[WIFI] status: %d\n", WiFi.status());
  }
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
  updateBlink();
  yield();

  // Heartbeat every 30s
  static unsigned long lastHB = 0;
  if (millis() - lastHB > 30000) {
    lastHB = millis();
    const char* fxName = effect == TIE_ON ? "on" : effect == TIE_OFF ? "off" : "blink";
    Serial.printf("[STATUS] uptime=%lus msgs=%lu effect=%s RSSI=%d WiFi=%s WS=%s disconnects=%lu\n",
                  millis() / 1000, wsMessageCount, fxName,
                  WiFi.RSSI(),
                  WiFi.isConnected() ? "OK" : "DISC",
                  webSocket.isConnected() ? "OK" : "DISC",
                  wsDisconnectCount);
  }
}
