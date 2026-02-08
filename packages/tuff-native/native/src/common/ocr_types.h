#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace tuff::native {

struct OcrBlock {
  std::string text;
  double confidence = 0.0;
  bool hasConfidence = false;
  std::array<double, 4> boundingBox{0.0, 0.0, 0.0, 0.0};
  bool hasBoundingBox = false;
};

struct OcrResult {
  std::string text;
  double confidence = 0.0;
  bool hasConfidence = false;
  std::string language;
  std::vector<OcrBlock> blocks;
  std::string engine;
  uint64_t durationMs = 0;
};

struct OcrOptions {
  std::vector<uint8_t> image;
  std::string languageHint;
  bool includeLayout = false;
  int maxBlocks = 0;
};

struct OcrError {
  std::string code;
  std::string message;
};

bool PerformPlatformOcr(const OcrOptions& options, OcrResult& result, OcrError& error);

} // namespace tuff::native
