#include <algorithm>
#include <windows.h>
#include <chrono>
#include <cstdint>
#include <string>
#include <vector>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Globalization.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.Media.Ocr.h>
#include <winrt/Windows.Storage.Streams.h>

#include "common/ocr_types.h"

namespace tuff::native {

namespace {

std::wstring ToWide(const std::string& value) {
  if (value.empty()) {
    return std::wstring();
  }
  const int length = MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0);
  if (length <= 0) {
    return std::wstring();
  }
  std::wstring output(static_cast<size_t>(length), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), output.data(), length);
  return output;
}

std::string ToUtf8(const winrt::hstring& value) {
  if (value.empty()) {
    return std::string();
  }
  const auto wide = std::wstring(value.c_str());
  const int length = WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
  if (length <= 0) {
    return std::string();
  }
  std::string output(static_cast<size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), output.data(), length, nullptr, nullptr);
  return output;
}

winrt::Windows::Media::Ocr::OcrEngine CreateEngine(const std::string& languageHint) {
  using namespace winrt::Windows::Globalization;
  using namespace winrt::Windows::Media::Ocr;

  if (!languageHint.empty()) {
    try {
      auto language = Language(winrt::hstring(ToWide(languageHint)));
      auto fromLanguage = OcrEngine::TryCreateFromLanguage(language);
      if (fromLanguage) {
        return fromLanguage;
      }
    } catch (...) {
      // ignore and fallback
    }
  }

  auto fromProfile = OcrEngine::TryCreateFromUserProfileLanguages();
  if (fromProfile) {
    return fromProfile;
  }

  auto fallbackLanguage = Language(L"en-US");
  auto fallback = OcrEngine::TryCreateFromLanguage(fallbackLanguage);
  return fallback;
}

bool BuildBitmapFromBytes(
    const std::vector<uint8_t>& image,
    winrt::Windows::Graphics::Imaging::SoftwareBitmap& outBitmap,
    OcrError& error) {
  using namespace winrt::Windows::Graphics::Imaging;
  using namespace winrt::Windows::Storage::Streams;

  if (image.empty()) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Image payload is empty";
    return false;
  }

  try {
    InMemoryRandomAccessStream stream;
    DataWriter writer(stream);
    writer.WriteBytes(winrt::array_view<const uint8_t>(image.data(), image.size()));
    writer.StoreAsync().get();
    writer.FlushAsync().get();
    writer.DetachStream();
    stream.Seek(0);

    auto decoder = BitmapDecoder::CreateAsync(stream).get();
    outBitmap = decoder.GetSoftwareBitmapAsync(BitmapPixelFormat::Bgra8, BitmapAlphaMode::Ignore).get();
    return true;
  } catch (const winrt::hresult_error& ex) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = ToUtf8(ex.message());
    if (error.message.empty()) {
      error.message = "Failed to decode image bytes";
    }
    return false;
  } catch (...) {
    error.code = "ERR_OCR_DECODE_FAILED";
    error.message = "Failed to decode image bytes";
    return false;
  }
}

std::array<double, 4> MergeWordBoundingBox(const winrt::Windows::Media::Ocr::OcrLine& line) {
  bool initialized = false;
  double minX = 0.0;
  double minY = 0.0;
  double maxX = 0.0;
  double maxY = 0.0;

  for (const auto& word : line.Words()) {
    const auto rect = word.BoundingRect();
    const double left = static_cast<double>(rect.X);
    const double top = static_cast<double>(rect.Y);
    const double right = static_cast<double>(rect.X + rect.Width);
    const double bottom = static_cast<double>(rect.Y + rect.Height);

    if (!initialized) {
      minX = left;
      minY = top;
      maxX = right;
      maxY = bottom;
      initialized = true;
      continue;
    }

    minX = std::min(minX, left);
    minY = std::min(minY, top);
    maxX = std::max(maxX, right);
    maxY = std::max(maxY, bottom);
  }

  if (!initialized) {
    return {0.0, 0.0, 0.0, 0.0};
  }

  return {minX, minY, std::max(0.0, maxX - minX), std::max(0.0, maxY - minY)};
}

} // namespace

bool PerformPlatformOcr(const OcrOptions& options, OcrResult& result, OcrError& error) {
  using namespace winrt::Windows::Media::Ocr;

  const auto startedAt = std::chrono::steady_clock::now();

  try {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);

    winrt::Windows::Graphics::Imaging::SoftwareBitmap bitmap{nullptr};
    if (!BuildBitmapFromBytes(options.image, bitmap, error)) {
      return false;
    }

    auto engine = CreateEngine(options.languageHint);
    if (!engine) {
      error.code = "ERR_OCR_ENGINE_UNAVAILABLE";
      error.message = "Windows OCR engine is unavailable";
      return false;
    }

    auto ocrResult = engine.RecognizeAsync(bitmap).get();
    result.text = ToUtf8(ocrResult.Text());

    if (result.text.empty()) {
      error.code = "ERR_OCR_RECOGNIZE_FAILED";
      error.message = "No text recognized from image";
      return false;
    }

    if (options.includeLayout) {
      const int maxBlocks = options.maxBlocks;
      for (const auto& line : ocrResult.Lines()) {
        OcrBlock block;
        block.text = ToUtf8(line.Text());
        if (block.text.empty()) {
          continue;
        }
        block.hasBoundingBox = true;
        block.boundingBox = MergeWordBoundingBox(line);
        result.blocks.push_back(std::move(block));

        if (maxBlocks > 0 && static_cast<int>(result.blocks.size()) >= maxBlocks) {
          break;
        }
      }
    }

    result.engine = "windows-ocr";
    if (engine.RecognizerLanguage()) {
      result.language = ToUtf8(engine.RecognizerLanguage().LanguageTag());
    }

    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - startedAt);
    result.durationMs = static_cast<uint64_t>(std::max<int64_t>(0, elapsed.count()));

    return true;
  } catch (const winrt::hresult_error& ex) {
    error.code = "ERR_OCR_RECOGNIZE_FAILED";
    error.message = ToUtf8(ex.message());
    if (error.message.empty()) {
      error.message = "Windows OCR recognition failed";
    }
    return false;
  } catch (const std::exception& ex) {
    error.code = "ERR_OCR_RECOGNIZE_FAILED";
    error.message = ex.what();
    return false;
  } catch (...) {
    error.code = "ERR_OCR_RECOGNIZE_FAILED";
    error.message = "Windows OCR recognition failed";
    return false;
  }
}

} // namespace tuff::native
