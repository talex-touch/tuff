#pragma once

#include <cstdint>
#include <string>

namespace tuff::native {

struct DarwinFrontmostAppSnapshot {
  bool captured = false;
  bool available = false;
  std::string appName;
  std::string bundleId;
  int32_t processId = 0;
  std::string bundlePath;
  std::string executablePath;
  std::string reason;
};

struct DarwinFrontmostAppResult {
  bool supported = false;
  bool available = false;
  std::string appName;
  std::string bundleId;
  int32_t processId = 0;
  std::string bundlePath;
  std::string executablePath;
  std::string windowTitle;
  std::string reason;
};

// Fast in-memory snapshot of NSWorkspace.sharedWorkspace.frontmostApplication.
// Runs only when invoked on the macOS main thread (~20us); no-op elsewhere.
void CaptureDarwinFrontmostApplicationMainThreadSnapshot(
    DarwinFrontmostAppSnapshot &snapshot);

// Off-main-thread window list and bounded Accessibility title lookup, plus
// fallback process resolution when the main-thread snapshot did not run.
DarwinFrontmostAppResult ResolveDarwinFrontmostWindowAndFallbackBlocking(
    const DarwinFrontmostAppSnapshot &snapshot);

} // namespace tuff::native
