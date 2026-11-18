#include "common/active_app_types.h"

namespace tuff::native {

void CaptureDarwinFrontmostApplicationMainThreadSnapshot(
    DarwinFrontmostAppSnapshot &snapshot) {
  snapshot = DarwinFrontmostAppSnapshot{};
}

DarwinFrontmostAppResult ResolveDarwinFrontmostWindowAndFallbackBlocking(
    const DarwinFrontmostAppSnapshot &) {
  DarwinFrontmostAppResult result;
  result.supported = false;
  result.available = false;
  result.reason = "platform-not-supported";
  return result;
}

} // namespace tuff::native
