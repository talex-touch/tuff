#include "common/notification_types.h"

namespace tuff::native {

// Non-macOS platforms have no readable notification authorization API here.
NotificationAuthStatus GetNotificationAuthorizationStatusBlocking(std::string& errorOut) {
  errorOut = "platform-not-supported";
  return NotificationAuthStatus::Unsupported;
}

}  // namespace tuff::native
