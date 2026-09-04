#include <Adafruit_GFX.h>
#include "phase2_adafruit.h"

class Phase2Display final : public Adafruit_GFX {
public:
  Phase2Display() : Adafruit_GFX(1, 1) {}
  void drawPixel(int16_t, int16_t, uint16_t) override {}
};

Phase2Display display;
void setup() { display.drawBitmap(0, 0, phase2_adafruit, 1, 1, 1); }
void loop() {}
