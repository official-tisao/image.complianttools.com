/* 1x1, rgb565a8 */
#include <stdint.h>
#include "lvgl.h"
static const uint8_t phase2_v9_map[] = {
  0x00, 0xf8, 0x80,
};
const lv_image_dsc_t phase2_v9 = {
  .header = {
    .magic = LV_IMAGE_HEADER_MAGIC,
    .cf = LV_COLOR_FORMAT_RGB565A8,
    .flags = 0,
    .w = 1,
    .h = 1,
    .stride = 2,
    .reserved_2 = 0,
  },
  .data_size = sizeof(phase2_v9_map),
  .data = phase2_v9_map,
  .reserved = NULL,
};
/* In a separate translation unit:
 * LV_IMAGE_DECLARE(phase2_v9);
 * lv_image_set_src(image, &phase2_v9);
 */

void phase2_bind_v9(lv_obj_t * image) { lv_image_set_src(image, &phase2_v9); }
