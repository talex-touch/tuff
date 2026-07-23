#pragma once

#include <string>

namespace tuff::native {

// Notification authorization status, mirroring UNAuthorizationStatus plus two
// out-of-band values for platforms/contexts where it cannot be read.
enum class NotificationAuthStatus : int {
  Unsupported = -2,   // platform has no readable notification authorization API
  Unverifiable = -1,  // supported, but not readable here (no bundle / timeout / error)
  NotDetermined = 0,
  Denied = 1,
  Granted = 2
};

// Blocking read of the current process's notification authorization status.
// Safe to call from a worker thread (it may block briefly on the OS callback).
// Implemented per-platform; `errorOut` receives a short reason on failure.
NotificationAuthStatus GetNotificationAuthorizationStatusBlocking(std::string& errorOut);

}  // namespace tuff::native
