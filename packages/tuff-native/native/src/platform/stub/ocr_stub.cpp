#include "common/ocr_types.h"

namespace tuff::native {

bool PerformPlatformOcr(const OcrOptions&, OcrResult&, OcrError& error) {
  error.code = "ERR_OCR_UNSUPPORTED_PLATFORM";
  error.message = "Native OCR is not supported on this platform";
  return false;
}

} // namespace tuff::native
