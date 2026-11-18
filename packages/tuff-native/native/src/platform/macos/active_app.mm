#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

#include "common/active_app_types.h"

namespace tuff::native {

namespace {

constexpr float kAxMessagingTimeoutSeconds = 0.12f;

struct CfReleaser {
  CFTypeRef ref = nullptr;
  explicit CfReleaser(CFTypeRef value) : ref(value) {}
  CfReleaser(const CfReleaser &) = delete;
  CfReleaser &operator=(const CfReleaser &) = delete;
  ~CfReleaser() {
    if (ref != nullptr) {
      CFRelease(ref);
    }
  }
};

std::string NSStringToStdString(NSString *value) {
  if (value == nil) {
    return {};
  }
  const char *utf8 = [value UTF8String];
  return utf8 != nullptr ? std::string(utf8) : std::string();
}

std::string CFStringToStdString(CFStringRef value) {
  if (value == nullptr) {
    return {};
  }
  return NSStringToStdString((__bridge NSString *)value);
}

bool ReadCfInt32(CFDictionaryRef dict, CFStringRef key, int32_t &outValue) {
  if (dict == nullptr || key == nullptr) {
    return false;
  }
  CFTypeRef raw = CFDictionaryGetValue(dict, key);
  if (raw == nullptr || CFGetTypeID(raw) != CFNumberGetTypeID()) {
    return false;
  }
  int32_t value = 0;
  if (!CFNumberGetValue(static_cast<CFNumberRef>(raw), kCFNumberSInt32Type,
                        &value)) {
    return false;
  }
  outValue = value;
  return true;
}

std::string ReadCfString(CFDictionaryRef dict, CFStringRef key) {
  if (dict == nullptr || key == nullptr) {
    return {};
  }
  CFTypeRef raw = CFDictionaryGetValue(dict, key);
  if (raw == nullptr || CFGetTypeID(raw) != CFStringGetTypeID()) {
    return {};
  }
  return CFStringToStdString(static_cast<CFStringRef>(raw));
}

std::string ReadAxWindowTitleForAttribute(AXUIElementRef appElement,
                                          CFStringRef windowAttribute) {
  CFTypeRef windowValue = nullptr;
  const AXError windowErr =
      AXUIElementCopyAttributeValue(appElement, windowAttribute, &windowValue);
  CfReleaser windowGuard(windowValue);
  if (windowErr != kAXErrorSuccess || windowValue == nullptr ||
      CFGetTypeID(windowValue) != AXUIElementGetTypeID()) {
    return {};
  }

  AXUIElementRef windowElement =
      reinterpret_cast<AXUIElementRef>(const_cast<void *>(windowValue));
  AXUIElementSetMessagingTimeout(windowElement, kAxMessagingTimeoutSeconds);

  CFTypeRef titleValue = nullptr;
  const AXError titleErr =
      AXUIElementCopyAttributeValue(windowElement, kAXTitleAttribute,
                                    &titleValue);
  CfReleaser titleGuard(titleValue);
  if (titleErr != kAXErrorSuccess || titleValue == nullptr ||
      CFGetTypeID(titleValue) != CFStringGetTypeID()) {
    return {};
  }

  return CFStringToStdString(static_cast<CFStringRef>(titleValue));
}

std::string QueryAxFrontmostWindowTitle(int32_t processId) {
  if (processId <= 0 || !AXIsProcessTrusted()) {
    return {};
  }

  AXUIElementRef appElement =
      AXUIElementCreateApplication(static_cast<pid_t>(processId));
  CfReleaser appGuard(appElement);
  if (appElement == nullptr) {
    return {};
  }

  AXUIElementSetMessagingTimeout(appElement, kAxMessagingTimeoutSeconds);

  std::string title =
      ReadAxWindowTitleForAttribute(appElement, kAXFocusedWindowAttribute);
  if (!title.empty()) {
    return title;
  }
  return ReadAxWindowTitleForAttribute(appElement, kAXMainWindowAttribute);
}

} // namespace

void CaptureDarwinFrontmostApplicationMainThreadSnapshot(
    DarwinFrontmostAppSnapshot &snapshot) {
  snapshot = DarwinFrontmostAppSnapshot{};
  if (![NSThread isMainThread]) {
    return;
  }

  @autoreleasepool {
    @try {
      snapshot.captured = true;
      NSRunningApplication *app =
          [[NSWorkspace sharedWorkspace] frontmostApplication];
      if (app == nil) {
        snapshot.available = false;
        snapshot.reason = "no-frontmost-application";
        return;
      }

      const pid_t pid = [app processIdentifier];
      if (pid <= 0) {
        snapshot.available = false;
        snapshot.reason = "no-frontmost-application";
        return;
      }

      snapshot.available = true;
      snapshot.processId = static_cast<int32_t>(pid);
      snapshot.appName = NSStringToStdString([app localizedName]);
      snapshot.bundleId = NSStringToStdString([app bundleIdentifier]);
      snapshot.bundlePath = NSStringToStdString([[app bundleURL] path]);
      snapshot.executablePath = NSStringToStdString([[app executableURL] path]);
    } @catch (NSException *exception) {
      snapshot.captured = false;
      snapshot.available = false;
      snapshot.reason = exception.reason != nil
                            ? NSStringToStdString(exception.reason)
                            : "nsworkspace-exception";
    }
  }
}

DarwinFrontmostAppResult ResolveDarwinFrontmostWindowAndFallbackBlocking(
    const DarwinFrontmostAppSnapshot &snapshot) {
  DarwinFrontmostAppResult result;
  result.supported = true;

  @autoreleasepool {
    @try {
      if (snapshot.captured && snapshot.available && snapshot.processId > 0) {
        result.available = true;
        result.processId = snapshot.processId;
        result.appName = snapshot.appName;
        result.bundleId = snapshot.bundleId;
        result.bundlePath = snapshot.bundlePath;
        result.executablePath = snapshot.executablePath;
      }

      const CGWindowListOption options =
          kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
      CFArrayRef windowList =
          CGWindowListCopyWindowInfo(options, kCGNullWindowID);
      CfReleaser windowListGuard(windowList);

      const CFIndex count =
          windowList != nullptr ? CFArrayGetCount(windowList) : 0;

      // Fallback when CaptureDarwinFrontmostApplicationMainThreadSnapshot did
      // not run (e.g. called from a worker thread) or returned no processId.
      if (!snapshot.captured || result.processId <= 0) {
        for (CFIndex i = 0; i < count; ++i) {
          CFTypeRef entry = CFArrayGetValueAtIndex(windowList, i);
          if (entry == nullptr ||
              CFGetTypeID(entry) != CFDictionaryGetTypeID()) {
            continue;
          }
          auto dict = static_cast<CFDictionaryRef>(entry);
          int32_t layer = -1;
          int32_t ownerPid = 0;
          if (!ReadCfInt32(dict, kCGWindowLayer, layer) || layer != 0) {
            continue;
          }
          if (!ReadCfInt32(dict, kCGWindowOwnerPID, ownerPid) ||
              ownerPid <= 0) {
            continue;
          }

          result.available = true;
          result.processId = ownerPid;
          const std::string ownerName = ReadCfString(dict, kCGWindowOwnerName);

          NSRunningApplication *runningApp = [NSRunningApplication
              runningApplicationWithProcessIdentifier:static_cast<pid_t>(
                                                          ownerPid)];
          if (runningApp != nil) {
            result.appName = NSStringToStdString([runningApp localizedName]);
            result.bundleId =
                NSStringToStdString([runningApp bundleIdentifier]);
            result.bundlePath =
                NSStringToStdString([[runningApp bundleURL] path]);
            result.executablePath =
                NSStringToStdString([[runningApp executableURL] path]);
          }
          if (result.appName.empty()) {
            result.appName = ownerName;
          }
          break;
        }
      }

      if (!result.available || result.processId <= 0) {
        result.available = false;
        result.reason = !snapshot.reason.empty() ? snapshot.reason
                                                 : "no-frontmost-application";
        return result;
      }

      // Scan layer-0 windows for the resolved frontmost PID to read kCGWindowName.
      for (CFIndex i = 0; i < count; ++i) {
        CFTypeRef entry = CFArrayGetValueAtIndex(windowList, i);
        if (entry == nullptr || CFGetTypeID(entry) != CFDictionaryGetTypeID()) {
          continue;
        }
        auto dict = static_cast<CFDictionaryRef>(entry);
        int32_t layer = -1;
        int32_t ownerPid = 0;
        if (!ReadCfInt32(dict, kCGWindowLayer, layer) || layer != 0) {
          continue;
        }
        if (!ReadCfInt32(dict, kCGWindowOwnerPID, ownerPid) ||
            ownerPid != result.processId) {
          continue;
        }

        const std::string title = ReadCfString(dict, kCGWindowName);
        if (!title.empty()) {
          result.windowTitle = title;
        }
        if (result.appName.empty()) {
          result.appName = ReadCfString(dict, kCGWindowOwnerName);
        }
        break;
      }

      // When Screen Recording permission is not granted, kCGWindowName is
      // omitted by WindowServer; fall back to bounded Accessibility lookup.
      if (result.windowTitle.empty()) {
        result.windowTitle = QueryAxFrontmostWindowTitle(result.processId);
      }
    } @catch (NSException *exception) {
      if (!result.available) {
        result.reason = exception.reason != nil
                            ? NSStringToStdString(exception.reason)
                            : "darwin-active-app-exception";
      }
    }
  }

  return result;
}

} // namespace tuff::native
