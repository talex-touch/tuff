#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

#include <string>

#include "common/app_icon_types.h"

namespace tuff::native {

namespace {

std::string ToStdString(NSString *text) {
  if (text == nil)
    return std::string();
  const char *value = [text UTF8String];
  return value ? std::string(value) : std::string();
}

void SetError(DarwinAppIconWriteError *error, const char *code,
              const std::string &message) {
  error->code = code;
  error->message = message;
}

bool WriteIconOnMainQueue(const DarwinAppIconWriteOptions *options,
                          DarwinAppIconWriteResult *result,
                          DarwinAppIconWriteError *error) {
  @autoreleasepool {
    NSString *sourcePath =
        [NSString stringWithUTF8String:options->sourcePath.c_str()];
    NSString *outputPath =
        [NSString stringWithUTF8String:options->outputPath.c_str()];
    if (sourcePath == nil || outputPath == nil) {
      SetError(error, "ERR_DARWIN_APP_ICON_INVALID_ARGUMENT",
               "Icon paths must be valid UTF-8");
      return false;
    }

    @try {
      NSImage *sourceImage =
          [[NSWorkspace sharedWorkspace] iconForFile:sourcePath];
      if (sourceImage == nil || ![sourceImage isValid]) {
        SetError(error, "ERR_DARWIN_APP_ICON_UNAVAILABLE",
                 "NSWorkspace did not return a valid application icon");
        return false;
      }

      const NSInteger targetSize = static_cast<NSInteger>(options->size);
      NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
          initWithBitmapDataPlanes:nullptr
                        pixelsWide:targetSize
                        pixelsHigh:targetSize
                     bitsPerSample:8
                   samplesPerPixel:4
                          hasAlpha:YES
                          isPlanar:NO
                    colorSpaceName:NSDeviceRGBColorSpace
                       bytesPerRow:0
                      bitsPerPixel:0];
      if (bitmap == nil) {
        SetError(error, "ERR_DARWIN_APP_ICON_RASTERIZE_FAILED",
                 "Failed to allocate the application icon bitmap");
        return false;
      }

      bitmap.size = NSMakeSize(targetSize, targetSize);
      NSGraphicsContext *graphicsContext =
          [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
      if (graphicsContext == nil) {
        SetError(error, "ERR_DARWIN_APP_ICON_RASTERIZE_FAILED",
                 "Failed to create the application icon graphics context");
        return false;
      }

      [NSGraphicsContext saveGraphicsState];
      [NSGraphicsContext setCurrentContext:graphicsContext];
      graphicsContext.imageInterpolation = NSImageInterpolationHigh;
      const NSRect targetRect = NSMakeRect(0, 0, targetSize, targetSize);
      [[NSColor clearColor] setFill];
      NSRectFillUsingOperation(targetRect, NSCompositingOperationCopy);
      [sourceImage drawInRect:targetRect
                     fromRect:NSZeroRect
                    operation:NSCompositingOperationSourceOver
                     fraction:1.0
               respectFlipped:YES
                        hints:@{
                          NSImageHintInterpolation : @(NSImageInterpolationHigh)
                        }];
      [graphicsContext flushGraphics];
      [NSGraphicsContext restoreGraphicsState];

      NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG
                                         properties:@{}];
      if (png == nil || png.length == 0) {
        SetError(error, "ERR_DARWIN_APP_ICON_RASTERIZE_FAILED",
                 "Failed to encode the application icon as PNG");
        return false;
      }

      NSString *parentPath = [outputPath stringByDeletingLastPathComponent];
      NSError *directoryError = nil;
      if (![[NSFileManager defaultManager]
                    createDirectoryAtPath:parentPath
              withIntermediateDirectories:YES
                               attributes:nil
                                    error:&directoryError]) {
        SetError(error, "ERR_DARWIN_APP_ICON_WRITE_FAILED",
                 ToStdString(directoryError.localizedDescription));
        return false;
      }

      NSError *writeError = nil;
      if (![png writeToFile:outputPath
                    options:NSDataWritingAtomic
                      error:&writeError]) {
        SetError(error, "ERR_DARWIN_APP_ICON_WRITE_FAILED",
                 ToStdString(writeError.localizedDescription));
        return false;
      }

      result->path = options->outputPath;
      result->width = options->size;
      result->height = options->size;
      return true;
    } @catch (NSException *exception) {
      std::string message = ToStdString(exception.reason);
      if (message.empty())
        message = "AppKit application icon extraction failed";
      SetError(error, "ERR_DARWIN_APP_ICON_RASTERIZE_FAILED", message);
      return false;
    }
  }
}

} // namespace

bool WriteDarwinAppIconBlocking(const DarwinAppIconWriteOptions &options,
                                DarwinAppIconWriteResult &result,
                                DarwinAppIconWriteError &error) {
  if (![NSThread isMainThread]) {
    error.code = "ERR_DARWIN_APP_ICON_WRONG_THREAD";
    error.message =
        "Darwin application icon extraction must run on the AppKit main thread";
    return false;
  }

  return WriteIconOnMainQueue(&options, &result, &error);
}

} // namespace tuff::native
