#include <napi.h>

#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace tuff::native::everything {

namespace {

constexpr uint32_t kDefaultMaxResults = 50;
constexpr uint32_t kMaxResultsLimit = 5000;

struct [[maybe_unused]] SearchOptions {
  uint32_t maxResults = kDefaultMaxResults;
  uint32_t offset = 0;
  uint32_t sort = 3;
  bool regex = false;
  bool matchCase = false;
  bool matchPath = false;
  bool matchWholeWord = false;
};

[[maybe_unused]] void ThrowJsError(Napi::Env env, const std::string& message, const char* code) {
  auto error = Napi::Error::New(env, message);
  error.Value().Set("code", Napi::String::New(env, code));
  error.ThrowAsJavaScriptException();
}

[[maybe_unused]] bool ParseSearchOptions(const Napi::CallbackInfo& info, SearchOptions& options) {
  if (info.Length() < 2 || !info[1].IsObject()) {
    return true;
  }

  auto rawOptions = info[1].As<Napi::Object>();

  if (rawOptions.Has("maxResults") && rawOptions.Get("maxResults").IsNumber()) {
    const int32_t maxResults = rawOptions.Get("maxResults").As<Napi::Number>().Int32Value();
    options.maxResults = static_cast<uint32_t>(
        std::clamp(maxResults, 1, static_cast<int32_t>(kMaxResultsLimit)));
  }

  if (rawOptions.Has("offset") && rawOptions.Get("offset").IsNumber()) {
    const int32_t offset = rawOptions.Get("offset").As<Napi::Number>().Int32Value();
    options.offset = static_cast<uint32_t>(std::max(offset, 0));
  }

  if (rawOptions.Has("sort") && rawOptions.Get("sort").IsNumber()) {
    const int32_t sort = rawOptions.Get("sort").As<Napi::Number>().Int32Value();
    options.sort = static_cast<uint32_t>(std::max(sort, 0));
  }

  if (rawOptions.Has("regex") && rawOptions.Get("regex").IsBoolean()) {
    options.regex = rawOptions.Get("regex").As<Napi::Boolean>().Value();
  }

  if (rawOptions.Has("matchCase") && rawOptions.Get("matchCase").IsBoolean()) {
    options.matchCase = rawOptions.Get("matchCase").As<Napi::Boolean>().Value();
  }

  if (rawOptions.Has("matchPath") && rawOptions.Get("matchPath").IsBoolean()) {
    options.matchPath = rawOptions.Get("matchPath").As<Napi::Boolean>().Value();
  }

  if (rawOptions.Has("matchWholeWord") && rawOptions.Get("matchWholeWord").IsBoolean()) {
    options.matchWholeWord = rawOptions.Get("matchWholeWord").As<Napi::Boolean>().Value();
  }

  return true;
}

#if defined(_WIN32)

constexpr DWORD kEverythingRequestFileName = 0x00000001;
constexpr DWORD kEverythingRequestPath = 0x00000002;
constexpr DWORD kEverythingRequestFullPathAndFileName = 0x00000004;
constexpr DWORD kEverythingRequestSize = 0x00000010;
constexpr DWORD kEverythingRequestDateCreated = 0x00000020;
constexpr DWORD kEverythingRequestDateModified = 0x00000040;

constexpr uint64_t kWindowsEpochOffset100Ns = 116444736000000000ULL;

typedef void(WINAPI* Everything_SetSearchW_Fn)(LPCWSTR lpString);
typedef void(WINAPI* Everything_SetRequestFlags_Fn)(DWORD dwRequestFlags);
typedef void(WINAPI* Everything_SetSort_Fn)(DWORD dwSortType);
typedef void(WINAPI* Everything_SetMax_Fn)(DWORD dwMax);
typedef void(WINAPI* Everything_SetOffset_Fn)(DWORD dwOffset);
typedef BOOL(WINAPI* Everything_QueryW_Fn)(BOOL bWait);
typedef DWORD(WINAPI* Everything_GetLastError_Fn)();
typedef DWORD(WINAPI* Everything_GetNumResults_Fn)();
typedef LPCWSTR(WINAPI* Everything_GetResultFileNameW_Fn)(DWORD nIndex);
typedef DWORD(WINAPI* Everything_GetResultFullPathNameW_Fn)(DWORD nIndex, LPWSTR lpString, DWORD nMaxCount);
typedef BOOL(WINAPI* Everything_GetResultSize_Fn)(DWORD nIndex, PLARGE_INTEGER lpFileSize);
typedef BOOL(WINAPI* Everything_GetResultDateModified_Fn)(DWORD nIndex, LPFILETIME lpFileTime);
typedef BOOL(WINAPI* Everything_GetResultDateCreated_Fn)(DWORD nIndex, LPFILETIME lpFileTime);
typedef BOOL(WINAPI* Everything_IsFolderResult_Fn)(DWORD nIndex);
typedef void(WINAPI* Everything_SetMatchPath_Fn)(BOOL bEnable);
typedef void(WINAPI* Everything_SetMatchCase_Fn)(BOOL bEnable);
typedef void(WINAPI* Everything_SetMatchWholeWord_Fn)(BOOL bEnable);
typedef void(WINAPI* Everything_SetRegex_Fn)(BOOL bEnable);
typedef DWORD(WINAPI* Everything_GetMajorVersion_Fn)();
typedef DWORD(WINAPI* Everything_GetMinorVersion_Fn)();
typedef DWORD(WINAPI* Everything_GetRevision_Fn)();
typedef DWORD(WINAPI* Everything_GetBuildNumber_Fn)();

std::wstring ReadEnvVar(const wchar_t* key) {
  const DWORD required = ::GetEnvironmentVariableW(key, nullptr, 0);
  if (required == 0) {
    return L"";
  }

  std::wstring value(required, L'\0');
  const DWORD written = ::GetEnvironmentVariableW(key, value.data(), required);
  if (written == 0) {
    return L"";
  }

  value.resize(written);
  return value;
}

std::wstring JoinPath(const std::wstring& base, const std::wstring& file) {
  if (base.empty()) {
    return file;
  }

  if (base.back() == L'\\' || base.back() == L'/') {
    return base + file;
  }

  return base + L"\\" + file;
}

std::wstring Utf8ToWide(const std::string& value) {
  if (value.empty()) {
    return L"";
  }

  const int needed = ::MultiByteToWideChar(
      CP_UTF8,
      MB_ERR_INVALID_CHARS,
      value.c_str(),
      static_cast<int>(value.size()),
      nullptr,
      0);
  if (needed <= 0) {
    return L"";
  }

  std::wstring wide(static_cast<size_t>(needed), L'\0');
  const int converted = ::MultiByteToWideChar(
      CP_UTF8,
      MB_ERR_INVALID_CHARS,
      value.c_str(),
      static_cast<int>(value.size()),
      wide.data(),
      needed);
  if (converted <= 0) {
    return L"";
  }

  return wide;
}

std::string WideToUtf8(const std::wstring& value) {
  if (value.empty()) {
    return "";
  }

  const int needed = ::WideCharToMultiByte(
      CP_UTF8,
      0,
      value.c_str(),
      static_cast<int>(value.size()),
      nullptr,
      0,
      nullptr,
      nullptr);
  if (needed <= 0) {
    return "";
  }

  std::string utf8(static_cast<size_t>(needed), '\0');
  const int converted = ::WideCharToMultiByte(
      CP_UTF8,
      0,
      value.c_str(),
      static_cast<int>(value.size()),
      utf8.data(),
      needed,
      nullptr,
      nullptr);
  if (converted <= 0) {
    return "";
  }

  return utf8;
}

double FileTimeToUnixMillis(const FILETIME& fileTime) {
  ULARGE_INTEGER value{};
  value.LowPart = fileTime.dwLowDateTime;
  value.HighPart = fileTime.dwHighDateTime;

  if (value.QuadPart <= kWindowsEpochOffset100Ns) {
    return 0;
  }

  return static_cast<double>((value.QuadPart - kWindowsEpochOffset100Ns) / 10000ULL);
}

class EverythingApi {
 public:
  static EverythingApi& Instance() {
    static EverythingApi api;
    return api;
  }

  bool EnsureLoaded(std::string& errorMessage) {
    if (loaded_) {
      return true;
    }

    std::string lastError = "Everything SDK DLL not found";
    for (const auto& candidate : BuildCandidatePaths()) {
      if (candidate.empty()) {
        continue;
      }

      if (LoadFromPath(candidate, errorMessage)) {
        return true;
      }

      if (!errorMessage.empty()) {
        lastError = errorMessage;
      }
    }

    errorMessage = lastError;
    return false;
  }

  std::string GetVersion() const {
    if (!loaded_) {
      return "";
    }

    if (!version_.empty()) {
      return version_;
    }

    return "unknown";
  }

  Everything_SetSearchW_Fn setSearch = nullptr;
  Everything_SetRequestFlags_Fn setRequestFlags = nullptr;
  Everything_SetSort_Fn setSort = nullptr;
  Everything_SetMax_Fn setMax = nullptr;
  Everything_SetOffset_Fn setOffset = nullptr;
  Everything_QueryW_Fn query = nullptr;
  Everything_GetLastError_Fn getLastError = nullptr;
  Everything_GetNumResults_Fn getNumResults = nullptr;
  Everything_GetResultFileNameW_Fn getResultFileName = nullptr;
  Everything_GetResultFullPathNameW_Fn getResultFullPathName = nullptr;
  Everything_GetResultSize_Fn getResultSize = nullptr;
  Everything_GetResultDateModified_Fn getResultDateModified = nullptr;
  Everything_GetResultDateCreated_Fn getResultDateCreated = nullptr;
  Everything_IsFolderResult_Fn isFolderResult = nullptr;
  Everything_SetMatchPath_Fn setMatchPath = nullptr;
  Everything_SetMatchCase_Fn setMatchCase = nullptr;
  Everything_SetMatchWholeWord_Fn setMatchWholeWord = nullptr;
  Everything_SetRegex_Fn setRegex = nullptr;

 private:
  EverythingApi() = default;

  template <typename T>
  bool LoadRequired(const char* symbol, T& target, std::string& errorMessage) {
    target = reinterpret_cast<T>(::GetProcAddress(module_, symbol));
    if (target != nullptr) {
      return true;
    }

    errorMessage = std::string("Everything SDK missing symbol: ") + symbol;
    return false;
  }

  template <typename T>
  void LoadOptional(const char* symbol, T& target) {
    target = reinterpret_cast<T>(::GetProcAddress(module_, symbol));
  }

  bool ResolveRequiredSymbols(std::string& errorMessage) {
    return LoadRequired("Everything_SetSearchW", setSearch, errorMessage) &&
        LoadRequired("Everything_SetRequestFlags", setRequestFlags, errorMessage) &&
        LoadRequired("Everything_SetMax", setMax, errorMessage) &&
        LoadRequired("Everything_SetOffset", setOffset, errorMessage) &&
        LoadRequired("Everything_QueryW", query, errorMessage) &&
        LoadRequired("Everything_GetLastError", getLastError, errorMessage) &&
        LoadRequired("Everything_GetNumResults", getNumResults, errorMessage) &&
        LoadRequired("Everything_GetResultFileNameW", getResultFileName, errorMessage) &&
        LoadRequired("Everything_GetResultFullPathNameW", getResultFullPathName, errorMessage);
  }

  bool LoadFromPath(const std::wstring& candidate, std::string& errorMessage) {
    module_ = ::LoadLibraryW(candidate.c_str());
    if (module_ == nullptr) {
      const DWORD winErr = ::GetLastError();
      errorMessage = "Unable to load Everything SDK DLL from candidate (winerr=" +
          std::to_string(winErr) + ")";
      return false;
    }

    if (!ResolveRequiredSymbols(errorMessage)) {
      ::FreeLibrary(module_);
      module_ = nullptr;
      return false;
    }

    LoadOptional("Everything_SetSort", setSort);
    LoadOptional("Everything_GetResultSize", getResultSize);
    LoadOptional("Everything_GetResultDateModified", getResultDateModified);
    LoadOptional("Everything_GetResultDateCreated", getResultDateCreated);
    LoadOptional("Everything_IsFolderResult", isFolderResult);
    LoadOptional("Everything_SetMatchPath", setMatchPath);
    LoadOptional("Everything_SetMatchCase", setMatchCase);
    LoadOptional("Everything_SetMatchWholeWord", setMatchWholeWord);
    LoadOptional("Everything_SetRegex", setRegex);

    Everything_GetMajorVersion_Fn getMajorVersion = nullptr;
    Everything_GetMinorVersion_Fn getMinorVersion = nullptr;
    Everything_GetRevision_Fn getRevision = nullptr;
    Everything_GetBuildNumber_Fn getBuildNumber = nullptr;

    LoadOptional("Everything_GetMajorVersion", getMajorVersion);
    LoadOptional("Everything_GetMinorVersion", getMinorVersion);
    LoadOptional("Everything_GetRevision", getRevision);
    LoadOptional("Everything_GetBuildNumber", getBuildNumber);

    if (getMajorVersion && getMinorVersion && getRevision && getBuildNumber) {
      version_ = std::to_string(getMajorVersion()) + "." +
          std::to_string(getMinorVersion()) + "." +
          std::to_string(getRevision()) + "." +
          std::to_string(getBuildNumber());
    }

    loaded_ = true;
    return true;
  }

  std::vector<std::wstring> BuildCandidatePaths() const {
    std::vector<std::wstring> candidates;

    const auto customDllPath = ReadEnvVar(L"TALEX_EVERYTHING_DLL_PATH");
    if (!customDllPath.empty()) {
      candidates.push_back(customDllPath);
    }

#if defined(_WIN64)
    candidates.push_back(L"Everything64.dll");
#else
    candidates.push_back(L"Everything32.dll");
#endif
    candidates.push_back(L"Everything.dll");

    const auto programFiles = ReadEnvVar(L"PROGRAMFILES");
    const auto programFilesX86 = ReadEnvVar(L"PROGRAMFILES(X86)");
    if (!programFiles.empty()) {
      candidates.push_back(JoinPath(programFiles, L"Everything\\Everything64.dll"));
      candidates.push_back(JoinPath(programFiles, L"Everything\\Everything.dll"));
      candidates.push_back(JoinPath(programFiles, L"Everything\\Everything32.dll"));
    }
    if (!programFilesX86.empty()) {
      candidates.push_back(JoinPath(programFilesX86, L"Everything\\Everything32.dll"));
      candidates.push_back(JoinPath(programFilesX86, L"Everything\\Everything.dll"));
    }

    return candidates;
  }

  HMODULE module_ = nullptr;
  bool loaded_ = false;
  std::string version_;
};

std::wstring GetResultFullPath(EverythingApi& api, DWORD index) {
  std::vector<wchar_t> buffer(4096, L'\0');

  while (true) {
    const DWORD copied = api.getResultFullPathName(index, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (copied == 0) {
      return L"";
    }

    if (copied < buffer.size()) {
      return std::wstring(buffer.data(), copied);
    }

    buffer.resize(static_cast<size_t>(copied) + 1U, L'\0');
  }
}

Napi::Value SearchWindows(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    ThrowJsError(env, "Everything search expects a query string", "ERR_INVALID_ARGUMENT");
    return env.Null();
  }

  SearchOptions options;
  ParseSearchOptions(info, options);

  const auto query = info[0].As<Napi::String>().Utf8Value();
  if (query.empty()) {
    return Napi::Array::New(env, 0);
  }

  std::string loadError;
  auto& api = EverythingApi::Instance();
  if (!api.EnsureLoaded(loadError)) {
    ThrowJsError(
        env,
        "Everything SDK is unavailable: " + loadError,
        "ERR_EVERYTHING_SDK_UNAVAILABLE");
    return env.Null();
  }

  const auto wideQuery = Utf8ToWide(query);
  if (wideQuery.empty()) {
    ThrowJsError(env, "Failed to convert query string to UTF-16", "ERR_EVERYTHING_QUERY_ENCODING");
    return env.Null();
  }

  api.setSearch(wideQuery.c_str());

  DWORD requestFlags =
      kEverythingRequestFileName |
      kEverythingRequestPath |
      kEverythingRequestFullPathAndFileName |
      kEverythingRequestSize |
      kEverythingRequestDateModified |
      kEverythingRequestDateCreated;
  api.setRequestFlags(requestFlags);

  if (api.setSort != nullptr) {
    api.setSort(options.sort);
  }

  api.setMax(options.maxResults);
  api.setOffset(options.offset);

  if (api.setMatchCase != nullptr) {
    api.setMatchCase(options.matchCase ? TRUE : FALSE);
  }
  if (api.setMatchPath != nullptr) {
    api.setMatchPath(options.matchPath ? TRUE : FALSE);
  }
  if (api.setMatchWholeWord != nullptr) {
    api.setMatchWholeWord(options.matchWholeWord ? TRUE : FALSE);
  }
  if (api.setRegex != nullptr) {
    api.setRegex(options.regex ? TRUE : FALSE);
  }

  if (!api.query(TRUE)) {
    const DWORD errCode = api.getLastError ? api.getLastError() : 0;
    ThrowJsError(
        env,
        "Everything query failed, error code: " + std::to_string(errCode),
        "ERR_EVERYTHING_QUERY_FAILED");
    return env.Null();
  }

  const DWORD total = api.getNumResults();
  auto resultArray = Napi::Array::New(env, total);

  uint32_t jsIndex = 0;
  for (DWORD i = 0; i < total; ++i) {
    std::wstring fullPathWide = GetResultFullPath(api, i);

    const wchar_t* rawName = api.getResultFileName(i);
    std::wstring nameWide = rawName != nullptr ? std::wstring(rawName) : std::wstring();

    if (fullPathWide.empty() && nameWide.empty()) {
      continue;
    }

    if (nameWide.empty()) {
      const auto sep = fullPathWide.find_last_of(L"\\/");
      if (sep != std::wstring::npos && sep + 1 < fullPathWide.size()) {
        nameWide = fullPathWide.substr(sep + 1);
      } else {
        nameWide = fullPathWide;
      }
    }

    std::wstring pathWide;
    if (!fullPathWide.empty()) {
      const auto sep = fullPathWide.find_last_of(L"\\/");
      if (sep != std::wstring::npos) {
        pathWide = fullPathWide.substr(0, sep);
      }
    }

    std::wstring extensionWide;
    const auto dotPos = nameWide.find_last_of(L'.');
    if (dotPos != std::wstring::npos && dotPos + 1 < nameWide.size()) {
      extensionWide = nameWide.substr(dotPos + 1);
    }

    auto result = Napi::Object::New(env);
    result.Set("fullPath", Napi::String::New(env, WideToUtf8(fullPathWide)));
    result.Set("path", Napi::String::New(env, WideToUtf8(pathWide)));

    const auto nameUtf8 = WideToUtf8(nameWide);
    result.Set("name", Napi::String::New(env, nameUtf8));
    result.Set("filename", Napi::String::New(env, nameUtf8));
    result.Set("extension", Napi::String::New(env, WideToUtf8(extensionWide)));

    if (api.getResultSize != nullptr) {
      LARGE_INTEGER fileSize{};
      if (api.getResultSize(i, &fileSize)) {
        result.Set("size", Napi::Number::New(env, static_cast<double>(fileSize.QuadPart)));
      }
    }

    if (api.getResultDateModified != nullptr) {
      FILETIME modified{};
      if (api.getResultDateModified(i, &modified)) {
        result.Set("dateModified", Napi::Number::New(env, FileTimeToUnixMillis(modified)));
      }
    }

    if (api.getResultDateCreated != nullptr) {
      FILETIME created{};
      if (api.getResultDateCreated(i, &created)) {
        result.Set("dateCreated", Napi::Number::New(env, FileTimeToUnixMillis(created)));
      }
    }

    if (api.isFolderResult != nullptr) {
      result.Set("isFolder", Napi::Boolean::New(env, api.isFolderResult(i) == TRUE));
    }

    resultArray.Set(jsIndex++, result);
  }

  return resultArray;
}

#endif

Napi::Value Search(const Napi::CallbackInfo& info) {
#if defined(_WIN32)
  return SearchWindows(info);
#else
  return Napi::Array::New(info.Env(), 0);
#endif
}

Napi::Value Query(const Napi::CallbackInfo& info) {
  return Search(info);
}

Napi::Value GetVersion(const Napi::CallbackInfo& info) {
  auto env = info.Env();

#if defined(_WIN32)
  std::string loadError;
  auto& api = EverythingApi::Instance();
  if (!api.EnsureLoaded(loadError)) {
    return env.Null();
  }

  const auto version = api.GetVersion();
  if (version.empty()) {
    return env.Null();
  }
  return Napi::String::New(env, version);
#else
  return env.Null();
#endif
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("search", Napi::Function::New(env, Search, "search"));
  exports.Set("query", Napi::Function::New(env, Query, "query"));
  exports.Set("getVersion", Napi::Function::New(env, GetVersion, "getVersion"));
  return exports;
}

}  // namespace tuff::native::everything

Napi::Object InitTuffNativeEverythingAddon(Napi::Env env, Napi::Object exports) {
  return tuff::native::everything::Init(env, exports);
}

NODE_API_MODULE(tuff_native_everything, InitTuffNativeEverythingAddon)
