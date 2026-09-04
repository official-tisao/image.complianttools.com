/* 1x1, argb8888 */
#include <stdint.h>
#include "lvgl.h"
static const uint8_t phase2_v8_map[] = {
  0x00, 0x00, 0xff, 0x80,
};
const lv_img_dsc_t phase2_v8 = {
  .header = { .always_zero = 0, .w = 1, .h = 1, .cf = LV_IMG_CF_TRUE_COLOR_ALPHA },
  .data_size = sizeof(phase2_v8_map),
  .data = phase2_v8_map,
};
/* In a separate translation unit:
 * LV_IMG_DECLARE(phase2_v8);
 * lv_img_set_src(image, &phase2_v8);
 */

void phase2_bind_v8(lv_obj_t * image) { lv_img_set_src(image, &phase2_v8); }
