#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <Vision/Vision.h>

#include <algorithm>
#include <chrono>
#include <numeric>
#include <string>
#include <vector>

#include "common/ocr_types.h"

namespace tuff::native {

namespace {

std::string ToStdString(NSString* text) {
  if (text == nil) return std::string();
  const char* cstr = [text UTF8String];
  return cstr ? std::string(cstr) : std::string();
}

CGImageRef CreateImageFromBytes(const std::vector<uint8_t>& bytes, OcrError& error) {
  if (bytes.empty()) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Image payload is empty";
    return nil;
  }

  NSData* data = [NSData dataWithBytes:bytes.data() length:bytes.size()];
  if (data == nil || [data length] == 0) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Failed to create NSData from image bytes";
    return nil;
  }

  CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)data, nullptr);
  if (source == nullptr) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Failed to decode image source";
    return nil;
  }

  CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, nullptr);
  CFRelease(source);

  if (image == nullptr) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Failed to create CGImage from source";
    return nil;
  }

  return image;
}

std::array<double, 4> ToBoundingBox(CGRect normalizedRect, size_t imageWidth, size_t imageHeight) {
  const double width = normalizedRect.size.width * static_cast<double>(imageWidth);
  const double height = normalizedRect.size.height * static_cast<double>(imageHeight);
  const double x = normalizedRect.origin.x * static_cast<double>(imageWidth);
  const double y =
      (1.0 - normalizedRect.origin.y - normalizedRect.size.height) * static_cast<double>(imageHeight);

  return {x, y, width, height};
}

} // namespace

bool PerformPlatformOcr(const OcrOptions& options, OcrResult& result, OcrError& error) {
  @autoreleasepool {
    const auto startedAt = std::chrono::steady_clock::now();

    CGImageRef image = CreateImageFromBytes(options.image, error);
    if (image == nullptr) {
      return false;
    }

    const size_t imageWidth = CGImageGetWidth(image);
    const size_t imageHeight = CGImageGetHeight(image);

    VNRecognizeTextRequest* request = [[VNRecognizeTextRequest alloc] init];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = YES;

    if (!options.languageHint.empty()) {
      NSString* language = [NSString stringWithUTF8String:options.languageHint.c_str()];
      if (language != nil && [language length] > 0) {
        request.recognitionLanguages = @[ language ];
      }
    }

    NSError* nsError = nil;
    VNImageRequestHandler* handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
    BOOL ok = [handler performRequests:@[ request ] error:&nsError];

    if (!ok || nsError != nil) {
      error.code = "ERR_OCR_RECOGNIZE_FAILED";
      error.message = ToStdString([nsError localizedDescription]);
      if (error.message.empty()) {
        error.message = "Vision OCR request failed";
      }
      CGImageRelease(image);
      return false;
    }

    NSArray<VNRecognizedTextObservation*>* observations = request.results;
    std::vector<std::string> lines;
    std::vector<double> confidenceValues;

    const bool useLayout = options.includeLayout;
    const int maxBlocks = options.maxBlocks;

    for (VNRecognizedTextObservation* observation in observations) {
      NSArray<VNRecognizedText*>* candidates = [observation topCandidates:1];
      if ([candidates count] == 0) continue;

      VNRecognizedText* candidate = candidates[0];
      std::string text = ToStdString(candidate.string);
      if (text.empty()) continue;

      lines.push_back(text);
      confidenceValues.push_back(candidate.confidence);

      if (useLayout) {
        OcrBlock block;
        block.text = text;
        block.hasConfidence = true;
        block.confidence = candidate.confidence;
        block.hasBoundingBox = true;
        block.boundingBox = ToBoundingBox(observation.boundingBox, imageWidth, imageHeight);
        result.blocks.push_back(std::move(block));

        if (maxBlocks > 0 && static_cast<int>(result.blocks.size()) >= maxBlocks) {
          break;
        }
      }
    }

    CGImageRelease(image);

    if (lines.empty()) {
      error.code = "ERR_OCR_RECOGNIZE_FAILED";
      error.message = "No text recognized from image";
      return false;
    }

    result.text.clear();
    for (size_t i = 0; i < lines.size(); ++i) {
      if (i > 0) {
        result.text += "\n";
      }
      result.text += lines[i];
    }

    if (!confidenceValues.empty()) {
      const double total = std::accumulate(confidenceValues.begin(), confidenceValues.end(), 0.0);
      result.hasConfidence = true;
      result.confidence = total / static_cast<double>(confidenceValues.size());
    }

    result.engine = "apple-vision";
    result.language = options.languageHint;

    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - startedAt);
    result.durationMs = static_cast<uint64_t>(std::max<int64_t>(0, elapsed.count()));

    return true;
  }
}

} // namespace tuff::native
