#include <Adafruit_GFX.h>
#include <Adafruit_NeoMatrix.h>
#include <Adafruit_NeoPixel.h>
#include "fonts.h"
#include "opensanshebrew8pt_hebrew.h"
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>

WebSocketsClient webSocket;
#define PAYLOAD_MAX 0x1F
#define PAYLOAD_MAX_G 0x3F

const char* ssid = "like-that-subs";
const char* password = "shooliboom";


#define PIN 4
#define mw 96
#define mh 32
#define BRIGHTNESS 5
Adafruit_NeoMatrix *matrix = new Adafruit_NeoMatrix(16, 16,
  mw/16, mh/16,
  PIN,
  NEO_MATRIX_TOP     + NEO_MATRIX_RIGHT +
  NEO_MATRIX_ROWS + NEO_MATRIX_ZIGZAG +
  NEO_TILE_TOP + NEO_TILE_LEFT +
  NEO_TILE_COLUMNS + NEO_TILE_ZIGZAG,
  NEO_GRB            + NEO_KHZ800 );

#define LED_BLACK		0

#define LED_RED_VERYLOW 	(3 <<  11)
#define LED_RED_LOW 		(7 <<  11)
#define LED_RED_MEDIUM 		(15 << 11)
#define LED_RED_HIGH 		(31 << 11)

#define LED_GREEN_VERYLOW	(1 <<  5)
#define LED_GREEN_LOW 		(15 << 5)
#define LED_GREEN_MEDIUM 	(31 << 5)
#define LED_GREEN_HIGH 		(63 << 5)

#define LED_BLUE_VERYLOW	3
#define LED_BLUE_LOW 		7
#define LED_BLUE_MEDIUM 	15
#define LED_BLUE_HIGH 		31

#define LED_ORANGE_VERYLOW	(LED_RED_VERYLOW + LED_GREEN_VERYLOW)
#define LED_ORANGE_LOW		(LED_RED_LOW     + LED_GREEN_LOW)
#define LED_ORANGE_MEDIUM	(LED_RED_MEDIUM  + LED_GREEN_MEDIUM)
#define LED_ORANGE_HIGH		(LED_RED_HIGH    + LED_GREEN_HIGH)

#define LED_PURPLE_VERYLOW	(LED_RED_VERYLOW + LED_BLUE_VERYLOW)
#define LED_PURPLE_LOW		(LED_RED_LOW     + LED_BLUE_LOW)
#define LED_PURPLE_MEDIUM	(LED_RED_MEDIUM  + LED_BLUE_MEDIUM)
#define LED_PURPLE_HIGH		(LED_RED_HIGH    + LED_BLUE_HIGH)

#define LED_CYAN_VERYLOW	(LED_GREEN_VERYLOW + LED_BLUE_VERYLOW)
#define LED_CYAN_LOW		(LED_GREEN_LOW     + LED_BLUE_LOW)
#define LED_CYAN_MEDIUM		(LED_GREEN_MEDIUM  + LED_BLUE_MEDIUM)
#define LED_CYAN_HIGH		(LED_GREEN_HIGH    + LED_BLUE_HIGH)

#define LED_WHITE_VERYLOW	(LED_RED_VERYLOW + LED_GREEN_VERYLOW + LED_BLUE_VERYLOW)
#define LED_WHITE_LOW		(LED_RED_LOW     + LED_GREEN_LOW     + LED_BLUE_LOW)
#define LED_WHITE_MEDIUM	(LED_RED_MEDIUM  + LED_GREEN_MEDIUM  + LED_BLUE_MEDIUM)
#define LED_WHITE_HIGH		(LED_RED_HIGH    + LED_GREEN_HIGH    + LED_BLUE_HIGH)


/*****************************************************************
 *    webSocketEvent()
 *    Parameters: WStype_t type, uint8_t * payload, size_t length
 *    Returns: void
 *
 *    On connection the server will ask "Who?" and expect a
 *    response with the device number.
 *    Receives data from the server as a payload,
 *    then store that data into the LED array buffer before
 *    pushing the pixel data to the display.
 *****************************************************************/
void webSocketEvent(WStype_t type, uint8_t * payload, size_t welength) {
  // Check for data
  if (type == WStype_TEXT){
    if (strcmp((char *)payload, "Who?") == 0){
      webSocket.sendTXT("Device 1");
      return;
    }

    char *line1 = NULL;
    char *line2 = NULL;

    line1 = strtok((char *)payload, ";");
    if (line1 != NULL) {
        line2 = strtok(NULL, ";");
    }
    matrix->fillScreen(LED_BLACK);
    matrix->show();
    
    // Print line1
    if (line1 != NULL) {
        printTextRTL(line1, 12);
    }
    
    // Print line2
    if (line2 != NULL) {
        printTextRTL(line2, 27);
    }
    
    matrix->show();
    webSocket.sendTXT("ACK");
    // Loop through LED array
  }
}


void loop() {
	  webSocket.loop();
    // matrix->clear();
    // matrix->setCursor(0, 5);
    // matrix->setTextWrap(false);  // we don't wrap text so it scrolls nicely
    // matrix->setTextSize(1);
    // matrix->setRotation(0);
    // matrix->setFont( &RobotoCondensed_Regular8pt7b );
    // // matrix->setFont( &FreeSans9pt7b );
    // matrix->setTextColor(matrix->Color(255, 255, 255));
    // matrix->print("Avocado\nAnd Mouse");
    // matrix->show();
    // delay(5000);
}

// Parse UTF-8 text and extract character codepoints
int parseText(const char* utf8Text, uint16_t* codepoints, int maxChars) {
    int i = 0;
    int charCount = 0;
    
    while (utf8Text[i] != '\0' && charCount < maxChars) {
        if ((unsigned char)utf8Text[i] == 0xD7) {  // Hebrew UTF-8 starts with 0xD7
            if (utf8Text[i+1] != '\0') {
                unsigned char secondByte = (unsigned char)utf8Text[i+1];
                if (secondByte >= 0x90 && secondByte <= 0xAA) {
                    // Hebrew letters א-ת (0x5D0-0x5EA)
                    codepoints[charCount] = 0x5D0 + (secondByte - 0x90);
                    charCount++;
                    i += 2;  // Skip both UTF-8 bytes
                    continue;
                }
            }
        }
        codepoints[charCount] = (uint16_t)utf8Text[i];
        charCount++;
        i++;
    }
    
    return charCount;
}

// Check if text contains Hebrew characters
bool containsHebrew(const char* utf8Text) {
    int i = 0;
    while (utf8Text[i] != '\0') {
        if ((unsigned char)utf8Text[i] == 0xD7) {
            if (utf8Text[i+1] != '\0') {
                unsigned char secondByte = (unsigned char)utf8Text[i+1];
                if (secondByte >= 0x90 && secondByte <= 0xAA) {
                    return true;
                }
            }
        }
        i++;
    }
    return false;
}

// Calculate text width for positioning
int getTextWidth(const char* utf8Text) {
    int16_t x1, y1;
    uint16_t w, h;
    matrix->getTextBounds(utf8Text, 0, 0, &x1, &y1, &w, &h);
    return w;
}

// Print text with proper RTL support and positioning
void printTextRTL(const char* utf8Text, int y) {
    uint16_t codepoints[100];  // Adjust size as needed
    int charCount = parseText(utf8Text, codepoints, 100);
    
    if (containsHebrew(utf8Text)) {
        // For Hebrew text, calculate width and right-align to total display (192px)
        int textWidth = getTextWidth(utf8Text);
        int totalWidth = mw * 2;  // Total display width (96 * 2 = 192)
        int xPos = totalWidth - textWidth;  // Right align to total display
        if (xPos < 0) xPos = 0;     // Prevent negative position
        
        // For right screen, offset by -96 to show right portion
        matrix->setCursor(xPos - 96, y);
        
        // Print right-to-left
        for (int i = charCount - 1; i >= 0; i--) {
            matrix->write(codepoints[i]);
        }
    } else {
        // For non-Hebrew text, print left-to-right with right screen offset
        matrix->setCursor(-96, y);
        for (int i = 0; i < charCount; i++) {
            matrix->write(codepoints[i]);
        }
    }
}

void setup() {
    Serial.begin(115200);
    matrix->begin();
    matrix->setTextWrap(false);
    matrix->setBrightness(BRIGHTNESS);
    // Test full bright of all LEDs. If brightness is too high
    // for your current limit (i.e. USB), decrease it.
    matrix->fillScreen(LED_BLACK);


    matrix->show();
    delay(10);
    matrix->clear();
    matrix->setCursor(0, 5);
    matrix->setTextWrap(false);  // we don't wrap text so it scrolls nicely
    matrix->setTextSize(1);
    matrix->setRotation(0);
    matrix->setFont( &Helvetica8pt7b );
    matrix->setTextColor(matrix->Color(255, 255, 255));

    matrix->setCursor(0, 12);
    matrix->fillScreen(LED_BLACK);
    matrix->show();
    matrix->print("Like");
    matrix->setCursor(0, 27);
    matrix->print("That!");
    matrix->show();

    matrix->setFont( &opensanshebrew_regular_webfont8pt8b );

    //-----------------------------------------------
    // Connect to WiFi
    Serial.print("Connecting to ");
    Serial.println(ssid);
    WiFi.begin(ssid, password);

    while(WiFi.status() != WL_CONNECTED) {
      Serial.print(".");
      delay(500);
    }
    Serial.println("");
    Serial.println("WiFi connected.");
    Serial.println("IP address: ");
    Serial.println(WiFi.localIP());
    //-----------------------------------------------
    // server address, port and URL
    webSocket.begin("192.168.1.102", 8081, "/");
    // event handler
    webSocket.onEvent(webSocketEvent);
    // try again if connection has failed
    webSocket.setReconnectInterval(5000);
}
