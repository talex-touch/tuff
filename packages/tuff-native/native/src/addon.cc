#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>

#include <napi.h>

#include "common/app_icon_types.h"
#include "common/notification_types.h"
#include "common/ocr_types.h"

namespace tuff::native {

namespace {

Napi::Object ToJsResult(Napi::Env env, const OcrResult &result) {
  auto output = Napi::Object::New(env);
  output.Set("text", Napi::String::New(env, result.text));

  if (result.hasConfidence) {
    output.Set("confidence", Napi::Number::New(env, result.confidence));
  }

  if (!result.language.empty()) {
    output.Set("language", Napi::String::New(env, result.language));
  }

  if (!result.blocks.empty()) {
    auto blocks = Napi::Array::New(env, result.blocks.size());
    for (size_t i = 0; i < result.blocks.size(); ++i) {
      const auto &block = result.blocks[i];
      auto jsBlock = Napi::Object::New(env);
      jsBlock.Set("text", Napi::String::New(env, block.text));
      if (block.hasConfidence) {
        jsBlock.Set("confidence", Napi::Number::New(env, block.confidence));
      }
      if (block.hasBoundingBox) {
        auto box = Napi::Array::New(env, 4);
        box.Set(uint32_t{0}, Napi::Number::New(env, block.boundingBox[0]));
        box.Set(uint32_t{1}, Napi::Number::New(env, block.boundingBox[1]));
        box.Set(uint32_t{2}, Napi::Number::New(env, block.boundingBox[2]));
        box.Set(uint32_t{3}, Napi::Number::New(env, block.boundingBox[3]));
        jsBlock.Set("boundingBox", box);
      }
      blocks.Set(static_cast<uint32_t>(i), jsBlock);
    }
    output.Set("blocks", blocks);
  }

  output.Set("engine", Napi::String::New(env, result.engine));
  output.Set("durationMs",
             Napi::Number::New(env, static_cast<double>(result.durationMs)));

  return output;
}

bool ParseOptions(Napi::Env env, const Napi::Object &input, OcrOptions &options,
                  Napi::Error &error) {
  if (!input.Has("image") || !input.Get("image").IsBuffer()) {
    error = Napi::TypeError::New(
        env, "recognizeImageText options.image must be a Buffer");
    return false;
  }

  const auto imageBuffer = input.Get("image").As<Napi::Buffer<uint8_t>>();
  if (imageBuffer.Length() == 0) {
    error = Napi::TypeError::New(
        env, "recognizeImageText options.image cannot be empty");
    return false;
  }

  options.image.assign(imageBuffer.Data(),
                       imageBuffer.Data() + imageBuffer.Length());

  if (input.Has("languageHint") && input.Get("languageHint").IsString()) {
    options.languageHint =
        input.Get("languageHint").As<Napi::String>().Utf8Value();
  }

  if (input.Has("includeLayout") && input.Get("includeLayout").IsBoolean()) {
    options.includeLayout =
        input.Get("includeLayout").As<Napi::Boolean>().Value();
  }

  if (input.Has("maxBlocks") && input.Get("maxBlocks").IsNumber()) {
    const auto maxBlocks =
        input.Get("maxBlocks").As<Napi::Number>().Int32Value();
    options.maxBlocks = std::max(0, maxBlocks);
  }

  return true;
}

class RecognizeWorker : public Napi::AsyncWorker {
public:
  RecognizeWorker(Napi::Env env, OcrOptions options,
                  Napi::Promise::Deferred deferred)
      : Napi::AsyncWorker(env), options_(std::move(options)),
        deferred_(deferred) {}

  void Execute() override {
    const auto startedAt = std::chrono::steady_clock::now();

    if (!PerformPlatformOcr(options_, result_, error_)) {
      if (error_.message.empty()) {
        error_.message = "Native OCR recognition failed";
      }
      SetError(error_.message);
      return;
    }

    if (result_.durationMs == 0) {
      const auto elapsed =
          std::chrono::duration_cast<std::chrono::milliseconds>(
              std::chrono::steady_clock::now() - startedAt);
      result_.durationMs =
          static_cast<uint64_t>(std::max<int64_t>(0, elapsed.count()));
    }
  }

  void OnOK() override { deferred_.Resolve(ToJsResult(Env(), result_)); }

  void OnError(const Napi::Error &error) override {
    auto errorObject = error.Value();
    if (!error_.code.empty()) {
      errorObject.Set("code", Napi::String::New(Env(), error_.code));
    }
    deferred_.Reject(errorObject);
  }

private:
  OcrOptions options_;
  OcrResult result_;
  OcrError error_;
  Napi::Promise::Deferred deferred_;
};

Napi::Value RecognizeImageText(const Napi::CallbackInfo &info) {
  auto env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "recognizeImageText expects an options object")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  OcrOptions options;
  Napi::Error parseError = Napi::Error::New(env, "");
  if (!ParseOptions(env, info[0].As<Napi::Object>(), options, parseError)) {
    parseError.ThrowAsJavaScriptException();
    return env.Null();
  }

  auto deferred = Napi::Promise::Deferred::New(env);
  auto *worker = new RecognizeWorker(env, std::move(options), deferred);
  worker->Queue();
  return deferred.Promise();
}

Napi::Value GetNativeOcrSupport(const Napi::CallbackInfo &info) {
  auto env = info.Env();
  auto support = Napi::Object::New(env);

#if defined(__APPLE__)
  support.Set("supported", Napi::Boolean::New(env, true));
  support.Set("platform", Napi::String::New(env, "darwin"));
#elif defined(_WIN32)
  support.Set("supported", Napi::Boolean::New(env, true));
  support.Set("platform", Napi::String::New(env, "win32"));
#else
  support.Set("supported", Napi::Boolean::New(env, false));
  support.Set("platform", Napi::String::New(env, "unsupported"));
  support.Set("reason", Napi::String::New(env, "platform-not-supported"));
#endif

  return support;
}

Napi::Object ToJsResult(Napi::Env env, const DarwinAppIconWriteResult &result) {
  auto output = Napi::Object::New(env);
  output.Set("path", Napi::String::New(env, result.path));
  output.Set("width", Napi::Number::New(env, result.width));
  output.Set("height", Napi::Number::New(env, result.height));
  return output;
}

bool ParseDarwinAppIconOptions(const Napi::Object &input,
                               DarwinAppIconWriteOptions &options,
                               std::string &errorCode,
                               std::string &errorMessage) {
  if (!input.Has("sourcePath") || !input.Get("sourcePath").IsString() ||
      !input.Has("outputPath") || !input.Get("outputPath").IsString()) {
    errorCode = "ERR_DARWIN_APP_ICON_INVALID_ARGUMENT";
    errorMessage =
        "writeDarwinAppIcon requires string sourcePath and outputPath values";
    return false;
  }

  options.sourcePath = input.Get("sourcePath").As<Napi::String>().Utf8Value();
  options.outputPath = input.Get("outputPath").As<Napi::String>().Utf8Value();
  if (options.sourcePath.empty() || options.outputPath.empty() ||
      options.sourcePath.find('\0') != std::string::npos ||
      options.outputPath.find('\0') != std::string::npos ||
      !std::filesystem::path(options.sourcePath).is_absolute() ||
      !std::filesystem::path(options.outputPath).is_absolute()) {
    errorCode = "ERR_DARWIN_APP_ICON_INVALID_ARGUMENT";
    errorMessage = "writeDarwinAppIcon paths must be non-empty absolute paths";
    return false;
  }

  if (!input.Has("size") || !input.Get("size").IsNumber()) {
    errorCode = "ERR_DARWIN_APP_ICON_INVALID_SIZE";
    errorMessage =
        "writeDarwinAppIcon size must be an integer between 16 and 1024";
    return false;
  }

  const double size = input.Get("size").As<Napi::Number>().DoubleValue();
  if (!std::isfinite(size) || std::floor(size) != size || size < 16 ||
      size > 1024) {
    errorCode = "ERR_DARWIN_APP_ICON_INVALID_SIZE";
    errorMessage =
        "writeDarwinAppIcon size must be an integer between 16 and 1024";
    return false;
  }

  options.size = static_cast<int>(size);
  return true;
}

Napi::Value WriteDarwinAppIconSync(const Napi::CallbackInfo &info) {
  auto env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    auto error = Napi::TypeError::New(
        env, "writeDarwinAppIcon expects an options object");
    error.Value().Set(
        "code", Napi::String::New(env, "ERR_DARWIN_APP_ICON_INVALID_ARGUMENT"));
    error.ThrowAsJavaScriptException();
    return env.Null();
  }

  DarwinAppIconWriteOptions options;
  std::string errorCode;
  std::string errorMessage;
  if (!ParseDarwinAppIconOptions(info[0].As<Napi::Object>(), options, errorCode,
                                 errorMessage)) {
    auto error = Napi::TypeError::New(env, errorMessage);
    error.Value().Set("code", Napi::String::New(env, errorCode));
    error.ThrowAsJavaScriptException();
    return env.Null();
  }

  DarwinAppIconWriteResult result;
  DarwinAppIconWriteError writeError;
  if (!WriteDarwinAppIconBlocking(options, result, writeError)) {
    if (writeError.code.empty())
      writeError.code = "ERR_DARWIN_APP_ICON_UNAVAILABLE";
    if (writeError.message.empty()) {
      writeError.message = "Darwin application icon extraction failed";
    }
    auto error = Napi::Error::New(env, writeError.message);
    error.Value().Set("code", Napi::String::New(env, writeError.code));
    error.ThrowAsJavaScriptException();
    return env.Null();
  }

  return ToJsResult(env, result);
}

const char *NotificationStatusToString(NotificationAuthStatus status) {
  switch (status) {
  case NotificationAuthStatus::Granted:
    return "granted";
  case NotificationAuthStatus::Denied:
    return "denied";
  case NotificationAuthStatus::NotDetermined:
    return "notDetermined";
  case NotificationAuthStatus::Unsupported:
    return "unsupported";
  case NotificationAuthStatus::Unverifiable:
  default:
    return "unverifiable";
  }
}

// Reads the notification authorization status off the main thread; the platform
// call blocks briefly on an OS callback, so it runs on the libuv thread pool.
class NotificationStatusWorker : public Napi::AsyncWorker {
public:
  NotificationStatusWorker(Napi::Env env, Napi::Promise::Deferred deferred)
      : Napi::AsyncWorker(env), deferred_(deferred) {}

  void Execute() override {
    status_ = GetNotificationAuthorizationStatusBlocking(error_);
  }

  void OnOK() override {
    auto env = Env();
    auto result = Napi::Object::New(env);
    result.Set("status",
               Napi::String::New(env, NotificationStatusToString(status_)));
    if (!error_.empty()) {
      result.Set("reason", Napi::String::New(env, error_));
    }
    deferred_.Resolve(result);
  }

  void OnError(const Napi::Error &error) override {
    deferred_.Reject(error.Value());
  }

private:
  NotificationAuthStatus status_ = NotificationAuthStatus::Unverifiable;
  std::string error_;
  Napi::Promise::Deferred deferred_;
};

Napi::Value GetNotificationAuthorizationStatus(const Napi::CallbackInfo &info) {
  auto env = info.Env();
  auto deferred = Napi::Promise::Deferred::New(env);
  auto *worker = new NotificationStatusWorker(env, deferred);
  worker->Queue();
  return deferred.Promise();
}

} // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("recognizeImageText", Napi::Function::New(env, RecognizeImageText,
                                                        "recognizeImageText"));
  exports.Set(
      "getNativeOcrSupport",
      Napi::Function::New(env, GetNativeOcrSupport, "getNativeOcrSupport"));
  exports.Set("writeDarwinAppIconSync",
              Napi::Function::New(env, WriteDarwinAppIconSync,
                                  "writeDarwinAppIconSync"));
  exports.Set("getNotificationAuthorizationStatus",
              Napi::Function::New(env, GetNotificationAuthorizationStatus,
                                  "getNotificationAuthorizationStatus"));
  return exports;
}

} // namespace tuff::native

Napi::Object InitTuffNativeOcrAddon(Napi::Env env, Napi::Object exports) {
  return tuff::native::Init(env, exports);
}

NODE_API_MODULE(tuff_native_ocr, InitTuffNativeOcrAddon)
