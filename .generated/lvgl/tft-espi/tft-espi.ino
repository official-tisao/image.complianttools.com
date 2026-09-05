#include <TFT_eSPI.h>
#include "phase2_tft.h"

TFT_eSPI display;
void setup() {
  display.init();
  display.pushImage(0, 0, 1, 1, phase2_tft);
}
void loop() {}
