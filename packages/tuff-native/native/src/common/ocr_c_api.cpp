#include "common/ocr_c_api.h"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <string>

#include "common/ocr_types.h"

namespace {

char* DupCString(const std::string& value) {
  if (value.empty()) return nullptr;
  char* copy = static_cast<char*>(std::malloc(value.size() + 1));
  if (!copy) return nullptr;
  std::memcpy(copy, value.data(), value.size());
  copy[value.size()] = '\0';
  return copy;
}

void ZeroResult(TuffOcrCResult* result) {
  if (!result) return;
  std::memset(result, 0, sizeof(TuffOcrCResult));
}

} // namespace

extern "C" bool tuff_ocr_is_supported(void) {
#if defined(__APPLE__) || defined(_WIN32)
  return true;
#else
  return false;
#endif
}

extern "C" void tuff_ocr_perform(
    const uint8_t* image_ptr,
    size_t image_len,
    const char* language_hint,
    bool include_layout,
    int32_t max_blocks,
    TuffOcrCResult* out) {
  if (!out) return;
  ZeroResult(out);

  if (!image_ptr || image_len == 0) {
    out->ok = false;
    out->error_code = DupCString("ERR_OCR_DECODE_FAILED");
    out->error_message = DupCString("Image payload is empty");
    return;
  }

  try {
    tuff::native::OcrOptions options;
    options.image.assign(image_ptr, image_ptr + image_len);
    if (language_hint && language_hint[0] != '\0') {
      options.languageHint = language_hint;
    }
    options.includeLayout = include_layout;
    options.maxBlocks = max_blocks > 0 ? max_blocks : 0;

    tuff::native::OcrResult result;
    tuff::native::OcrError error;
    const auto startedAt = std::chrono::steady_clock::now();
    if (!tuff::native::PerformPlatformOcr(options, result, error)) {
      out->ok = false;
      out->error_code = DupCString(error.code.empty() ? "ERR_OCR_RECOGNIZE_FAILED" : error.code);
      out->error_message =
          DupCString(error.message.empty() ? "Native OCR recognition failed" : error.message);
      return;
    }

    uint64_t durationMs = result.durationMs;
    if (durationMs == 0) {
      const auto elapsed =
          std::chrono::duration_cast<std::chrono::milliseconds>(
              std::chrono::steady_clock::now() - startedAt);
      durationMs = static_cast<uint64_t>(std::max<int64_t>(0, elapsed.count()));
    }

    out->ok = true;
    out->text = DupCString(result.text);
    out->has_confidence = result.hasConfidence;
    out->confidence = result.confidence;
    out->language = DupCString(result.language);
    out->engine = DupCString(result.engine);
    out->duration_ms = durationMs;

    if (!result.blocks.empty()) {
      out->blocks =
          static_cast<TuffOcrCBlock*>(std::calloc(result.blocks.size(), sizeof(TuffOcrCBlock)));
      if (out->blocks) {
        out->block_count = result.blocks.size();
        for (size_t i = 0; i < result.blocks.size(); ++i) {
          const auto& src = result.blocks[i];
          auto& dst = out->blocks[i];
          dst.text = DupCString(src.text);
          dst.has_confidence = src.hasConfidence;
          dst.confidence = src.confidence;
          dst.has_bounding_box = src.hasBoundingBox;
          if (src.hasBoundingBox) {
            for (size_t k = 0; k < 4; ++k) {
              dst.bounding_box[k] = src.boundingBox[k];
            }
          }
        }
      }
    }
  } catch (const std::exception& ex) {
    tuff_ocr_free_result(out);
    out->ok = false;
    out->error_code = DupCString("ERR_OCR_RECOGNIZE_FAILED");
    out->error_message = DupCString(ex.what() ? ex.what() : "Native OCR recognition failed");
  } catch (...) {
    tuff_ocr_free_result(out);
    out->ok = false;
    out->error_code = DupCString("ERR_OCR_RECOGNIZE_FAILED");
    out->error_message = DupCString("Native OCR recognition failed");
  }
}

extern "C" void tuff_ocr_free_result(TuffOcrCResult* result) {
  if (!result) return;
  std::free(result->text);
  std::free(result->language);
  std::free(result->engine);
  std::free(result->error_code);
  std::free(result->error_message);
  if (result->blocks) {
    for (size_t i = 0; i < result->block_count; ++i) {
      std::free(result->blocks[i].text);
    }
    std::free(result->blocks);
  }
  ZeroResult(result);
}
