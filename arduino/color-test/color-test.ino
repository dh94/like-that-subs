#include "config.h"

void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial.println();
  Serial.println("=== COLOR TEST v1 ===");
  Serial.printf("PIN_R=GPIO%d, PIN_G=GPIO%d, PIN_B=GPIO%d\n", PIN_R, PIN_G, PIN_B);

  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);

  digitalWrite(PIN_R, LOW);
  digitalWrite(PIN_G, LOW);
  digitalWrite(PIN_B, LOW);

  Serial.println("All pins LOW - strip should be OFF");
  Serial.println("Starting test in 3 seconds...");
  delay(3000);
}

void loop() {
  // RED
  Serial.println("RED ON (GPIO HIGH)");
  digitalWrite(PIN_R, HIGH);
  delay(2000);
  Serial.println("RED OFF");
  digitalWrite(PIN_R, LOW);
  delay(1000);

  // GREEN
  Serial.println("GREEN ON (GPIO HIGH)");
  digitalWrite(PIN_G, HIGH);
  delay(2000);
  Serial.println("GREEN OFF");
  digitalWrite(PIN_G, LOW);
  delay(1000);

  // BLUE
  Serial.println("BLUE ON (GPIO HIGH)");
  digitalWrite(PIN_B, HIGH);
  delay(2000);
  Serial.println("BLUE OFF");
  digitalWrite(PIN_B, LOW);
  delay(1000);

  // ALL WHITE
  Serial.println("ALL ON (WHITE)");
  digitalWrite(PIN_R, HIGH);
  digitalWrite(PIN_G, HIGH);
  digitalWrite(PIN_B, HIGH);
  delay(2000);
  Serial.println("ALL OFF");
  digitalWrite(PIN_R, LOW);
  digitalWrite(PIN_G, LOW);
  digitalWrite(PIN_B, LOW);
  delay(2000);

  Serial.println("--- cycle complete, repeating ---");
}
