#include <WiFi.h>
#include <WiFiUdp.h>

// --- Config ---
#define WIFI_SSID "like-that-subs"
#define WIFI_PASS "shooliboom"
#define SACN_PORT 5568
#define LED_PIN 8  // built-in LED on most ESP32-C3 boards

WiFiUDP udp;
unsigned long lastPacketTime = 0;
unsigned long packetCount = 0;

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n=== sACN Network Test ===");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Connecting to '%s'...\n", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  WiFi.setSleep(false);
  Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());

  // Listen on sACN port (multicast)
  IPAddress multicastAddr(239, 255, 0, 4);
  if (udp.beginMulticast(multicastAddr, SACN_PORT)) {
    Serial.printf("Multicast OK: 239.255.0.4:%d\n", SACN_PORT);
  } else {
    Serial.println("Multicast join FAILED!");
  }

  // Also try plain UDP on same port as fallback test
  Serial.println("\nWaiting for ANY UDP packet on port 5568...");
  Serial.println("Send test with: node scripts/sacn-network-test.mjs");
}

void loop() {
  int size = udp.parsePacket();
  if (size > 0) {
    packetCount++;
    unsigned long now = millis();
    unsigned long gap = lastPacketTime > 0 ? now - lastPacketTime : 0;
    lastPacketTime = now;

    uint8_t buf[16];
    int read = udp.read(buf, sizeof(buf));

    // Toggle LED on each packet
    digitalWrite(LED_PIN, packetCount % 2);

    Serial.print("[PKT #");
    Serial.print(packetCount);
    Serial.print("] ");
    Serial.print(size);
    Serial.print(" bytes, gap=");
    Serial.print(gap);
    Serial.println("ms");

    // Send PONG back
    udp.beginPacket(udp.remoteIP(), 5569);
    udp.printf("PONG #%lu gap=%lums", packetCount, gap);
    udp.endPacket();
  }

  // Print heartbeat every 10s so you know it's alive
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 10000) {
    lastHeartbeat = millis();
    Serial.printf("[ALIVE] t=%lu, packets=%lu, WiFi=%s\n",
                  millis(), packetCount,
                  WiFi.isConnected() ? "OK" : "DISCONNECTED");
  }
}
