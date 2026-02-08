#include <algorithm>
#include <chrono>

#include <napi.h>

#include "common/ocr_types.h"

namespace tuff::native {

namespace {

Napi::Object ToJsResult(Napi::Env env, const OcrResult& result) {
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
      const auto& block = result.blocks[i];
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
  output.Set("durationMs", Napi::Number::New(env, static_cast<double>(result.durationMs)));

  return output;
}

bool ParseOptions(Napi::Env env, const Napi::Object& input, OcrOptions& options, Napi::Error& error) {
  if (!input.Has("image") || !input.Get("image").IsBuffer()) {
    error = Napi::TypeError::New(env, "recognizeImageText options.image must be a Buffer");
    return false;
  }

  const auto imageBuffer = input.Get("image").As<Napi::Buffer<uint8_t>>();
  if (imageBuffer.Length() == 0) {
    error = Napi::TypeError::New(env, "recognizeImageText options.image cannot be empty");
    return false;
  }

  options.image.assign(imageBuffer.Data(), imageBuffer.Data() + imageBuffer.Length());

  if (input.Has("languageHint") && input.Get("languageHint").IsString()) {
    options.languageHint = input.Get("languageHint").As<Napi::String>().Utf8Value();
  }

  if (input.Has("includeLayout") && input.Get("includeLayout").IsBoolean()) {
    options.includeLayout = input.Get("includeLayout").As<Napi::Boolean>().Value();
  }

  if (input.Has("maxBlocks") && input.Get("maxBlocks").IsNumber()) {
    const auto maxBlocks = input.Get("maxBlocks").As<Napi::Number>().Int32Value();
    options.maxBlocks = std::max(0, maxBlocks);
  }

  return true;
}

class RecognizeWorker : public Napi::AsyncWorker {
 public:
  RecognizeWorker(
      Napi::Env env,
      OcrOptions options,
      Napi::Promise::Deferred deferred)
      : Napi::AsyncWorker(env),
        options_(std::move(options)),
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
      const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::steady_clock::now() - startedAt);
      result_.durationMs = static_cast<uint64_t>(std::max<int64_t>(0, elapsed.count()));
    }
  }

  void OnOK() override {
    deferred_.Resolve(ToJsResult(Env(), result_));
  }

  void OnError(const Napi::Error& error) override {
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

Napi::Value RecognizeImageText(const Napi::CallbackInfo& info) {
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
  auto* worker = new RecognizeWorker(env, std::move(options), deferred);
  worker->Queue();
  return deferred.Promise();
}

Napi::Value GetNativeOcrSupport(const Napi::CallbackInfo& info) {
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

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(
      "recognizeImageText",
      Napi::Function::New(env, RecognizeImageText, "recognizeImageText"));
  exports.Set(
      "getNativeOcrSupport",
      Napi::Function::New(env, GetNativeOcrSupport, "getNativeOcrSupport"));
  return exports;
}

}  // namespace tuff::native

Napi::Object InitTuffNativeOcrAddon(Napi::Env env, Napi::Object exports) {
  return tuff::native::Init(env, exports);
}

NODE_API_MODULE(tuff_native_ocr, InitTuffNativeOcrAddon)
