#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

#include "common/notification_types.h"

namespace tuff::native {

NotificationAuthStatus GetNotificationAuthorizationStatusBlocking(std::string& errorOut) {
  @autoreleasepool {
    // UNUserNotificationCenter requires a valid, registered application bundle.
    // Calling it from a bare/invalid bundle raises a hard assertion that aborts the
    // process (not a catchable NSException), so bail out early when there is no
    // bundle identity. Callers additionally gate this to packaged builds.
    NSBundle* mainBundle = [NSBundle mainBundle];
    if (mainBundle == nil || [mainBundle bundleIdentifier] == nil) {
      errorOut = "no-bundle-identifier";
      return NotificationAuthStatus::Unverifiable;
    }

    @try {
      __block UNAuthorizationStatus status = UNAuthorizationStatusNotDetermined;
      __block bool received = false;
      dispatch_semaphore_t sem = dispatch_semaphore_create(0);

      UNUserNotificationCenter* center = [UNUserNotificationCenter currentNotificationCenter];
      [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings* settings) {
        status = settings.authorizationStatus;
        received = true;
        dispatch_semaphore_signal(sem);
      }];

      // Never hang: give up after a short timeout and report unverifiable. The
      // completion handler runs on an internal UN queue, so waiting on a worker
      // thread here cannot deadlock the main thread.
      dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3 * NSEC_PER_SEC));
      if (dispatch_semaphore_wait(sem, timeout) != 0 || !received) {
        errorOut = "timeout";
        return NotificationAuthStatus::Unverifiable;
      }

      switch (status) {
        case UNAuthorizationStatusNotDetermined:
          return NotificationAuthStatus::NotDetermined;
        case UNAuthorizationStatusDenied:
          return NotificationAuthStatus::Denied;
        case UNAuthorizationStatusAuthorized:
        case UNAuthorizationStatusProvisional:
          // Note: UNAuthorizationStatusEphemeral is iOS-only and unavailable on macOS.
          return NotificationAuthStatus::Granted;
        default:
          return NotificationAuthStatus::NotDetermined;
      }
    } @catch (NSException* exception) {
      errorOut = exception.reason ? std::string([exception.reason UTF8String]) : "objc-exception";
      return NotificationAuthStatus::Unverifiable;
    }
  }
}

}  // namespace tuff::native
