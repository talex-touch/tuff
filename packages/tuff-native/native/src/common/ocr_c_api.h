#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct TuffOcrCBlock {
  char* text;
  bool has_confidence;
  double confidence;
  bool has_bounding_box;
  double bounding_box[4];
} TuffOcrCBlock;

typedef struct TuffOcrCResult {
  bool ok;
  char* text;
  bool has_confidence;
  double confidence;
  char* language;
  TuffOcrCBlock* blocks;
  size_t block_count;
  char* engine;
  uint64_t duration_ms;
  char* error_code;
  char* error_message;
} TuffOcrCResult;

bool tuff_ocr_is_supported(void);

void tuff_ocr_perform(
    const uint8_t* image_ptr,
    size_t image_len,
    const char* language_hint,
    bool include_layout,
    int32_t max_blocks,
    TuffOcrCResult* out);

void tuff_ocr_free_result(TuffOcrCResult* result);

#ifdef __cplusplus
}
#endif
