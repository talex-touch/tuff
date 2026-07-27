#pragma once

#include <string>

namespace tuff::native {

struct DarwinAppIconWriteOptions {
  std::string sourcePath;
  std::string outputPath;
  int size = 0;
};

struct DarwinAppIconWriteResult {
  std::string path;
  int width = 0;
  int height = 0;
};

struct DarwinAppIconWriteError {
  std::string code;
  std::string message;
};

// Performs the platform icon lookup and atomically writes a PNG to outputPath.
// The macOS implementation requires the AppKit main thread; the public JS
// wrapper yields one event-loop turn before calling it. Other platforms return
// ERR_DARWIN_APP_ICON_UNSUPPORTED.
bool WriteDarwinAppIconBlocking(const DarwinAppIconWriteOptions &options,
                                DarwinAppIconWriteResult &result,
                                DarwinAppIconWriteError &error);

} // namespace tuff::native
