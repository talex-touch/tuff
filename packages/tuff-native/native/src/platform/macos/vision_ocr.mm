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

constexpr size_t kMaxOcrImageEdge = 2000;

struct DecodedOcrImage {
  CGImageRef image = nullptr;
  size_t originalWidth = 0;
  size_t originalHeight = 0;
};

bool ReadPositiveIntProperty(NSDictionary* dict, CFStringRef key, size_t& out) {
  id raw = dict[(__bridge NSString*)key];
  if (![raw isKindOfClass:[NSNumber class]]) return false;
  const long long value = [(NSNumber*)raw longLongValue];
  if (value <= 0) return false;
  out = static_cast<size_t>(value);
  return true;
}

DecodedOcrImage CreateImageFromBytes(const std::vector<uint8_t>& bytes, OcrError& error) {
  DecodedOcrImage decoded;
  if (bytes.empty()) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Image payload is empty";
    return decoded;
  }

  NSData* data = [NSData dataWithBytes:bytes.data() length:bytes.size()];
  if (data == nil || [data length] == 0) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Failed to create NSData from image bytes";
    return decoded;
  }

  CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)data, nullptr);
  if (source == nullptr) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Failed to decode image source";
    return decoded;
  }

  size_t orientedWidth = 0;
  size_t orientedHeight = 0;
  size_t orientation = 1;
  CFDictionaryRef rawProps = CGImageSourceCopyPropertiesAtIndex(source, 0, nullptr);
  if (rawProps != nullptr) {
    NSDictionary* props = (__bridge NSDictionary*)rawProps;
    size_t pixelWidth = 0;
    size_t pixelHeight = 0;
    ReadPositiveIntProperty(props, kCGImagePropertyPixelWidth, pixelWidth);
    ReadPositiveIntProperty(props, kCGImagePropertyPixelHeight, pixelHeight);
    ReadPositiveIntProperty(props, kCGImagePropertyOrientation, orientation);
    if (pixelWidth > 0 && pixelHeight > 0) {
      const bool swapsAxes = orientation >= 5 && orientation <= 8;
      orientedWidth = swapsAxes ? pixelHeight : pixelWidth;
      orientedHeight = swapsAxes ? pixelWidth : pixelHeight;
    }
    CFRelease(rawProps);
  }

  CGImageRef image = nullptr;
  const bool needsResize = orientedWidth > kMaxOcrImageEdge || orientedHeight > kMaxOcrImageEdge;
  const bool needsOrientationTransform = orientation > 1;
  if (needsResize || needsOrientationTransform) {
    const size_t maxEdge = std::max(orientedWidth, orientedHeight);
    const size_t targetMaxEdge =
        maxEdge > 0 ? std::min(maxEdge, kMaxOcrImageEdge) : kMaxOcrImageEdge;
    NSDictionary* options = @{
      (__bridge NSString*)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
      (__bridge NSString*)kCGImageSourceCreateThumbnailWithTransform : @YES,
      (__bridge NSString*)kCGImageSourceThumbnailMaxPixelSize : @(targetMaxEdge)
    };
    image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
  }

  if (image == nullptr) {
    image = CGImageSourceCreateImageAtIndex(source, 0, nullptr);
  }
  CFRelease(source);

  if (image == nullptr) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Failed to create CGImage from source";
    return decoded;
  }

  decoded.image = image;
  decoded.originalWidth = orientedWidth > 0 ? orientedWidth : CGImageGetWidth(image);
  decoded.originalHeight = orientedHeight > 0 ? orientedHeight : CGImageGetHeight(image);
  return decoded;
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

    const DecodedOcrImage decoded = CreateImageFromBytes(options.image, error);
    CGImageRef image = decoded.image;
    if (image == nullptr) {
      return false;
    }

    const size_t imageWidth = decoded.originalWidth;
    const size_t imageHeight = decoded.originalHeight;

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
      // See the note in winrt_ocr.cpp: both engines used to report this with the same words, so
      // the message could not tell you which one had failed (#1517).
      error.code = "ERR_OCR_RECOGNIZE_FAILED";
      error.message = "Apple Vision recognized no text in the image";
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
