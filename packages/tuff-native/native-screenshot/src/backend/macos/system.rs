mod ax;
mod stream;

pub use ax::{MacAxElementData, MacAxElementHandle, MacAxFailure, hit_test_element};

pub use stream::{MacStreamFrame, MacStreamOptions, MacStreamSession, start_stream};

use std::ffi::c_void;
use std::fmt;
use std::ptr::NonNull;
use std::sync::{Arc, Mutex};

use block2::RcBlock;
use objc2::rc::{Retained, autoreleasepool};
use objc2::{AnyThread, Message};
use objc2_application_services::AXIsProcessTrusted;
use objc2_core_foundation::{
    CFBoolean, CFDictionary, CFNumber, CFNumberType, CFString, CFType, CGRect,
    kCFCoreFoundationVersionNumber,
};
use objc2_core_graphics::{
    CGDataProvider, CGDisplayBounds, CGDisplayCopyDisplayMode, CGDisplayIsMain, CGDisplayMode,
    CGDisplayRotation, CGImage, CGPreflightScreenCaptureAccess,
    CGRectMakeWithDictionaryRepresentation, CGWindowListCopyWindowInfo, CGWindowListOption,
    kCGNullWindowID, kCGWindowAlpha, kCGWindowBounds, kCGWindowIsOnscreen, kCGWindowLayer,
    kCGWindowNumber, kCGWindowOwnerPID, kCGWindowSharingState,
};
use objc2_foundation::{NSArray, NSError, NSProcessInfo};
use objc2_screen_capture_kit::{
    SCCaptureDynamicRange, SCContentFilter, SCRunningApplication, SCScreenshotManager,
    SCShareableContent, SCStreamConfiguration, SCStreamErrorCode, SCWindow,
};

#[cfg(feature = "linkedit-align-pad")]
unsafe extern "C" {
    static kCFCoreFoundationVersionString: [u8; 1];
}

const MAX_TITLE_SCALARS: usize = 512;
const MAX_BUNDLE_BYTES: usize = 512;
const MAX_APPLICATION_NAME_BYTES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct MacOsVersion {
    major: u16,
    minor: u16,
    patch: u16,
}

impl MacOsVersion {
    pub const fn new(major: u16, minor: u16, patch: u16) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }

    pub const fn components(self) -> (u16, u16, u16) {
        (self.major, self.minor, self.patch)
    }

    pub fn current() -> Result<Self, MacSystemError> {
        autoreleasepool(|_| {
            // SAFETY: This is a process-lifetime CoreFoundation numeric constant.
            let foundation_version = unsafe { kCFCoreFoundationVersionNumber };
            if !foundation_version.is_finite() || foundation_version <= 0.0 {
                return Err(MacSystemError::invalid_data());
            }
            #[cfg(feature = "linkedit-align-pad")]
            {
                // SAFETY: Process-lifetime ApplicationServices constant; volatile read preserves
                // the external data relocation used to work around Apple ld-27034 alignment.
                let version_prefix: u8 = unsafe {
                    std::ptr::read_volatile(
                        std::ptr::addr_of!(kCFCoreFoundationVersionString).cast(),
                    )
                };
                if version_prefix == 0 {
                    return Err(MacSystemError::invalid_data());
                }
            }
            let version = NSProcessInfo::processInfo().operatingSystemVersion();
            Ok(Self::new(
                non_negative_u16(version.majorVersion)?,
                non_negative_u16(version.minorVersion)?,
                non_negative_u16(version.patchVersion)?,
            ))
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StaticCaptureApi {
    Unsupported,
    ShortLivedStream,
    ScreenshotManager,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MacAvailability {
    pub shareable_content: bool,
    pub static_capture: StaticCaptureApi,
    pub direct_multi_display_region: bool,
}

pub const fn availability_for(version: MacOsVersion) -> MacAvailability {
    let shareable_content = version.major > 12 || (version.major == 12 && version.minor >= 3);
    let static_capture = if version.major >= 14 {
        StaticCaptureApi::ScreenshotManager
    } else if shareable_content {
        StaticCaptureApi::ShortLivedStream
    } else {
        StaticCaptureApi::Unsupported
    };
    let direct_multi_display_region =
        version.major > 15 || (version.major == 15 && version.minor >= 2);
    MacAvailability {
        shareable_content,
        static_capture,
        direct_multi_display_region,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MacPermissionProbe {
    pub screen_recording: bool,
    pub accessibility: bool,
}

pub fn permission_probe() -> MacPermissionProbe {
    autoreleasepool(|_| MacPermissionProbe {
        screen_recording: CGPreflightScreenCaptureAccess(),
        // SAFETY: This is the non-prompting trust query and accepts no pointers.
        accessibility: unsafe { AXIsProcessTrusted() },
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacSystemErrorKind {
    PermissionDenied,
    NoCaptureSource,
    InvalidSystemData,
    SystemFailure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MacSystemError {
    pub kind: MacSystemErrorKind,
    pub native_code: Option<i64>,
}

impl MacSystemError {
    const fn invalid_data() -> Self {
        Self {
            kind: MacSystemErrorKind::InvalidSystemData,
            native_code: None,
        }
    }

    fn from_nserror(error: *mut NSError) -> Self {
        if error.is_null() {
            return Self {
                kind: MacSystemErrorKind::SystemFailure,
                native_code: None,
            };
        }
        // SAFETY: NSError callback arguments are valid for the duration of the block invocation.
        let code = unsafe { (&*error).code() as i64 };
        let kind = if code == SCStreamErrorCode::UserDeclined.0 as i64 {
            MacSystemErrorKind::PermissionDenied
        } else if matches!(
            code,
            value if value == SCStreamErrorCode::NoWindowList.0 as i64
                || value == SCStreamErrorCode::NoDisplayList.0 as i64
                || value == SCStreamErrorCode::NoCaptureSource.0 as i64
        ) {
            MacSystemErrorKind::NoCaptureSource
        } else {
            MacSystemErrorKind::SystemFailure
        };
        Self {
            kind,
            native_code: Some(code),
        }
    }
}

impl fmt::Display for MacSystemError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("macOS screenshot system operation failed")
    }
}

impl std::error::Error for MacSystemError {}

pub struct MacShareableContent {
    inner: Retained<SCShareableContent>,
}

// SAFETY: SCShareableContent and the immutable SCDisplay/SCWindow objects it owns are documented
// for asynchronous ScreenCaptureKit use. This wrapper is transferred once into the single screen
// actor and is never accessed concurrently or outside that actor after transfer.
unsafe impl Send for MacShareableContent {}

impl MacShareableContent {
    pub fn displays(&self) -> Result<Vec<MacSystemDisplay>, MacSystemError> {
        autoreleasepool(|_| {
            // SAFETY: `inner` is a retained SCShareableContent returned by ScreenCaptureKit.
            let displays = unsafe { self.inner.displays() };
            let mut result = Vec::with_capacity(displays.count());
            for index in 0..displays.count() {
                let display = displays.objectAtIndex(index);
                // SAFETY: Objects come from SCShareableContent.displays and have the generated type.
                let native_id = unsafe { display.displayID() };
                // SAFETY: Same retained SCDisplay invariant as above.
                let sck_frame = unsafe { display.frame() };
                let mode =
                    CGDisplayCopyDisplayMode(native_id).ok_or_else(MacSystemError::invalid_data)?;
                let pixel_width = u32::try_from(CGDisplayMode::pixel_width(Some(&mode)))
                    .map_err(|_| MacSystemError::invalid_data())?;
                let pixel_height = u32::try_from(CGDisplayMode::pixel_height(Some(&mode)))
                    .map_err(|_| MacSystemError::invalid_data())?;
                if pixel_width == 0 || pixel_height == 0 {
                    return Err(MacSystemError::invalid_data());
                }
                result.push(MacSystemDisplay {
                    handle: display,
                    native_id,
                    sck_frame,
                    cg_frame: CGDisplayBounds(native_id),
                    pixel_width,
                    pixel_height,
                    rotation_degrees: CGDisplayRotation(native_id),
                    is_primary: CGDisplayIsMain(native_id),
                });
            }
            Ok(result)
        })
    }

    pub fn windows(&self, include_titles: bool) -> Result<Vec<MacSystemWindow>, MacSystemError> {
        autoreleasepool(|_| {
            // SAFETY: `inner` is a retained SCShareableContent returned by ScreenCaptureKit.
            let windows = unsafe { self.inner.windows() };
            let mut result = Vec::with_capacity(windows.count());
            for index in 0..windows.count() {
                let window = windows.objectAtIndex(index);
                // SAFETY: Objects come from SCShareableContent.windows and have the generated type.
                let native_id = unsafe { window.windowID() };
                let owner = unsafe { window.owningApplication() }
                    .ok_or_else(MacSystemError::invalid_data)?;
                let process_id = owner_process_id(&owner)?;
                let bundle_id = optional_bounded_string(
                    Some(unsafe { owner.bundleIdentifier() }),
                    MAX_BUNDLE_BYTES,
                );
                let application_name = optional_bounded_string(
                    Some(unsafe { owner.applicationName() }),
                    MAX_APPLICATION_NAME_BYTES,
                );
                let title = if include_titles {
                    optional_bounded_title(unsafe { window.title() })
                } else {
                    None
                };
                result.push(MacSystemWindow {
                    handle: window.clone(),
                    owner_handle: owner,
                    native_id,
                    process_id,
                    bundle_id,
                    application_name,
                    title,
                    // SAFETY: Generated scalar accessors on a retained SCWindow.
                    frame: unsafe { window.frame() },
                    layer: i32::try_from(unsafe { window.windowLayer() })
                        .map_err(|_| MacSystemError::invalid_data())?,
                    on_screen: unsafe { window.isOnScreen() },
                    active: unsafe { window.isActive() },
                });
            }
            Ok(result)
        })
    }

    pub fn cg_window_metadata(&self) -> Result<Vec<MacCgWindowMetadata>, MacSystemError> {
        copy_cg_window_metadata()
    }
}

pub struct MacSystemDisplay {
    handle: Retained<objc2_screen_capture_kit::SCDisplay>,
    pub native_id: u32,
    pub sck_frame: CGRect,
    pub cg_frame: CGRect,
    pub pixel_width: u32,
    pub pixel_height: u32,
    pub rotation_degrees: f64,
    pub is_primary: bool,
}

impl MacSystemDisplay {
    pub fn retained_handle(&self) -> Retained<objc2_screen_capture_kit::SCDisplay> {
        self.handle.clone()
    }
}

pub struct MacSystemWindow {
    handle: Retained<SCWindow>,
    owner_handle: Retained<SCRunningApplication>,
    pub native_id: u32,
    pub process_id: u32,
    pub bundle_id: Option<String>,
    pub application_name: Option<String>,
    pub title: Option<String>,
    pub frame: CGRect,
    pub layer: i32,
    pub on_screen: bool,
    pub active: bool,
}

impl MacSystemWindow {
    pub fn retained_handle(&self) -> Retained<SCWindow> {
        self.handle.clone()
    }
}

pub struct MacContentFilter {
    inner: Retained<SCContentFilter>,
}

impl MacContentFilter {
    pub fn retained_handle(&self) -> Retained<SCContentFilter> {
        self.inner.clone()
    }
}

pub struct MacCaptureConfiguration {
    inner: Retained<SCStreamConfiguration>,
}

impl MacCaptureConfiguration {
    pub fn new(
        width: u32,
        height: u32,
        source_rect: Option<CGRect>,
        shows_cursor: bool,
    ) -> Result<Self, MacSystemError> {
        if width == 0 || height == 0 {
            return Err(MacSystemError::invalid_data());
        }
        autoreleasepool(|_| {
            // SAFETY: SCStreamConfiguration is available on every supported SCK version.
            let inner = unsafe { SCStreamConfiguration::new() };
            // SAFETY: Values were range-checked above and CGRect is passed by value.
            unsafe {
                inner.setWidth(width as usize);
                inner.setHeight(height as usize);
                inner.setShowsCursor(shows_cursor);
                inner.setCaptureDynamicRange(SCCaptureDynamicRange::SDR);
                if let Some(rect) = source_rect {
                    inner.setSourceRect(rect);
                }
            }
            Ok(Self { inner })
        })
    }
}

pub struct MacCapturedImage {
    pub width: u32,
    pub height: u32,
    pub rgba_bytes: Vec<u8>,
}

pub fn request_capture_image<F>(
    filter: &MacContentFilter,
    configuration: &MacCaptureConfiguration,
    max_bytes: usize,
    completion: F,
) where
    F: FnOnce(Result<MacCapturedImage, MacSystemError>) + Send + 'static,
{
    let completion = Arc::new(Mutex::new(Some(completion)));
    let callback_completion = Arc::clone(&completion);
    let block = RcBlock::new(move |image: *mut CGImage, error: *mut NSError| {
        autoreleasepool(|_| {
            let result = if image.is_null() {
                Err(MacSystemError::from_nserror(error))
            } else {
                // SAFETY: The callback provides a valid CGImage for the duration of invocation;
                // extraction copies all bytes before the autorelease pool drains.
                unsafe { copy_bgra_image(&*image, max_bytes) }
            };
            let callback = callback_completion
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .take();
            if let Some(callback) = callback {
                callback(result);
            }
        });
    });
    // SAFETY: Caller checks macOS 14 availability before this wrapper. Filter/configuration are
    // retained for this call and SCScreenshotManager copies the heap completion block.
    unsafe {
        SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(
            &filter.inner,
            &configuration.inner,
            Some(&block),
        );
    }
}

pub fn desktop_independent_window_filter(window: &MacSystemWindow) -> MacContentFilter {
    autoreleasepool(|_| {
        // SAFETY: The window handle is retained and originates from SCShareableContent.
        let inner = unsafe {
            SCContentFilter::initWithDesktopIndependentWindow(
                SCContentFilter::alloc(),
                &window.handle,
            )
        };
        MacContentFilter { inner }
    })
}

pub fn display_filter_excluding_windows(
    display: &MacSystemDisplay,
    excluded_windows: &[&MacSystemWindow],
) -> MacContentFilter {
    autoreleasepool(|_| {
        let excluded = retained_array(excluded_windows.iter().map(|window| &window.handle));
        // SAFETY: Display/window handles originate from one retained SCK content generation and
        // NSArray copied the pointer list before its temporary backing storage was released.
        let inner = unsafe {
            SCContentFilter::initWithDisplay_excludingWindows(
                SCContentFilter::alloc(),
                &display.handle,
                &excluded,
            )
        };
        MacContentFilter { inner }
    })
}

pub fn display_filter_excluding_applications(
    display: &MacSystemDisplay,
    excluded_windows: &[&MacSystemWindow],
    excepted_windows: &[&MacSystemWindow],
) -> MacContentFilter {
    autoreleasepool(|_| {
        let applications =
            retained_array(excluded_windows.iter().map(|window| &window.owner_handle));
        let exceptions = retained_array(excepted_windows.iter().map(|window| &window.handle));
        // SAFETY: All handles are retained SCK objects from one generation; both NSArrays own
        // their entries for the duration of filter initialization.
        let inner = unsafe {
            SCContentFilter::initWithDisplay_excludingApplications_exceptingWindows(
                SCContentFilter::alloc(),
                &display.handle,
                &applications,
                &exceptions,
            )
        };
        MacContentFilter { inner }
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MacCgWindowMetadata {
    pub native_id: u32,
    pub process_id: u32,
    pub frame: CGRect,
    pub layer: i32,
    pub alpha: f64,
    pub sharing_state: i32,
    pub on_screen: Option<bool>,
    pub z_index: usize,
}

pub fn request_shareable_content<F>(completion: F)
where
    F: FnOnce(Result<MacShareableContent, MacSystemError>) + Send + 'static,
{
    let completion = Arc::new(Mutex::new(Some(completion)));
    let callback_completion = Arc::clone(&completion);
    let block = RcBlock::new(
        move |content: *mut SCShareableContent, error: *mut NSError| {
            autoreleasepool(|_| {
                // SAFETY: ScreenCaptureKit supplies a valid nullable callback object. Retaining it
                // before leaving the callback makes ownership independent of the autorelease pool.
                let result = unsafe { Retained::retain(content) }
                    .map(|inner| MacShareableContent { inner })
                    .ok_or_else(|| MacSystemError::from_nserror(error));
                let callback = callback_completion
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .take();
                if let Some(callback) = callback {
                    callback(result);
                }
            });
        },
    );
    // SAFETY: The heap block has the exact generated callback signature. ScreenCaptureKit copies
    // completion blocks for asynchronous invocation; captured state is owned and callback-once.
    unsafe {
        SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(
            true,
            true,
            &block,
        );
    }
}

unsafe fn copy_bgra_image(
    image: &CGImage,
    max_bytes: usize,
) -> Result<MacCapturedImage, MacSystemError> {
    let width = CGImage::width(Some(image));
    let height = CGImage::height(Some(image));
    let bytes_per_row = CGImage::bytes_per_row(Some(image));
    let packed_row_bytes = width
        .checked_mul(4)
        .ok_or_else(MacSystemError::invalid_data)?;
    let output_bytes = packed_row_bytes
        .checked_mul(height)
        .ok_or_else(MacSystemError::invalid_data)?;
    if width == 0
        || height == 0
        || CGImage::bits_per_component(Some(image)) != 8
        || CGImage::bits_per_pixel(Some(image)) != 32
        || bytes_per_row < packed_row_bytes
        || output_bytes > max_bytes
    {
        return Err(MacSystemError::invalid_data());
    }
    let bitmap_info = CGImage::bitmap_info(Some(image)).0;
    let alpha_info = CGImage::alpha_info(Some(image));
    if bitmap_info & 0x7000 != 0x2000
        || !matches!(
            alpha_info,
            objc2_core_graphics::CGImageAlphaInfo::PremultipliedFirst
                | objc2_core_graphics::CGImageAlphaInfo::First
                | objc2_core_graphics::CGImageAlphaInfo::NoneSkipFirst
        )
    {
        return Err(MacSystemError::invalid_data());
    }
    let provider = CGImage::data_provider(Some(image)).ok_or_else(MacSystemError::invalid_data)?;
    let data = CGDataProvider::data(Some(&provider)).ok_or_else(MacSystemError::invalid_data)?;
    let data_length = usize::try_from(data.length()).map_err(|_| MacSystemError::invalid_data())?;
    let required_source_bytes = bytes_per_row
        .checked_mul(height)
        .ok_or_else(MacSystemError::invalid_data)?;
    if data_length < required_source_bytes {
        return Err(MacSystemError::invalid_data());
    }
    // SAFETY: CFData guarantees `byte_ptr` covers `length` immutable bytes while `data` is retained.
    let source = unsafe { std::slice::from_raw_parts(data.byte_ptr(), data_length) };
    let rgba = bgra_rows_to_rgba(source, width, height, bytes_per_row, max_bytes)?;
    Ok(MacCapturedImage {
        width: u32::try_from(width).map_err(|_| MacSystemError::invalid_data())?,
        height: u32::try_from(height).map_err(|_| MacSystemError::invalid_data())?,
        rgba_bytes: rgba,
    })
}

pub(crate) fn bgra_rows_to_rgba(
    source: &[u8],
    width: usize,
    height: usize,
    bytes_per_row: usize,
    max_bytes: usize,
) -> Result<Vec<u8>, MacSystemError> {
    let packed_row_bytes = width
        .checked_mul(4)
        .ok_or_else(MacSystemError::invalid_data)?;
    let output_bytes = packed_row_bytes
        .checked_mul(height)
        .ok_or_else(MacSystemError::invalid_data)?;
    let source_bytes = bytes_per_row
        .checked_mul(height)
        .ok_or_else(MacSystemError::invalid_data)?;
    if width == 0
        || height == 0
        || bytes_per_row < packed_row_bytes
        || source.len() < source_bytes
        || output_bytes > max_bytes
    {
        return Err(MacSystemError::invalid_data());
    }
    let mut rgba = vec![0_u8; output_bytes];
    for row in 0..height {
        let source_row = &source[row * bytes_per_row..row * bytes_per_row + packed_row_bytes];
        let destination_row = &mut rgba[row * packed_row_bytes..(row + 1) * packed_row_bytes];
        for (bgra, output) in source_row
            .chunks_exact(4)
            .zip(destination_row.chunks_exact_mut(4))
        {
            let alpha = bgra[3];
            output[0] = unpremultiply(bgra[2], alpha);
            output[1] = unpremultiply(bgra[1], alpha);
            output[2] = unpremultiply(bgra[0], alpha);
            output[3] = alpha;
        }
    }
    Ok(rgba)
}

fn unpremultiply(channel: u8, alpha: u8) -> u8 {
    if alpha == 0 || alpha == u8::MAX {
        channel
    } else {
        ((u32::from(channel) * 255 + u32::from(alpha) / 2) / u32::from(alpha)).min(255) as u8
    }
}

fn retained_array<'a, T, I>(items: I) -> Retained<NSArray<T>>
where
    T: Message,
    I: IntoIterator<Item = &'a Retained<T>>,
    T: 'a,
{
    let mut pointers = items
        .into_iter()
        .map(|item| {
            NonNull::new(Retained::as_ptr(item).cast_mut())
                .expect("retained Objective-C object pointer must be non-null")
        })
        .collect::<Vec<_>>();
    let objects = if pointers.is_empty() {
        std::ptr::null_mut()
    } else {
        pointers.as_mut_ptr()
    };
    // SAFETY: Every non-null pointer comes from a live Retained<T>; NSArray copies and retains all
    // entries synchronously. A null pointer is supplied only for a zero-length array.
    unsafe { NSArray::initWithObjects_count(NSArray::alloc(), objects, pointers.len()) }
}

fn copy_cg_window_metadata() -> Result<Vec<MacCgWindowMetadata>, MacSystemError> {
    autoreleasepool(|_| {
        let options =
            CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements;
        let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID)
            .ok_or_else(MacSystemError::invalid_data)?;
        let count = usize::try_from(windows.count()).map_err(|_| MacSystemError::invalid_data())?;
        let mut result = Vec::with_capacity(count);
        for index in 0..count {
            let cf_index = isize::try_from(index).map_err(|_| MacSystemError::invalid_data())?;
            // SAFETY: The index is bounded by CFArrayGetCount; CGWindowList guarantees dictionary
            // entries, verified again by a runtime CoreFoundation type check before use.
            let value = unsafe { windows.value_at_index(cf_index) };
            let dictionary = unsafe { cf_ref::<CFDictionary>(value) }
                .ok_or_else(MacSystemError::invalid_data)?;
            let native_id = required_u32(dictionary, unsafe { kCGWindowNumber })?;
            let process_id = required_u32(dictionary, unsafe { kCGWindowOwnerPID })?;
            let layer = required_i32(dictionary, unsafe { kCGWindowLayer })?;
            let alpha = required_f64(dictionary, unsafe { kCGWindowAlpha })?;
            let sharing_state = required_i32(dictionary, unsafe { kCGWindowSharingState })?;
            let bounds_dictionary =
                dictionary_value::<CFDictionary>(dictionary, unsafe { kCGWindowBounds })
                    .ok_or_else(MacSystemError::invalid_data)?;
            let mut frame = CGRect::ZERO;
            // SAFETY: Runtime type checking above proves the bounds value is a CFDictionary and
            // `frame` is a valid writable CGRect for the duration of the call.
            if !unsafe {
                CGRectMakeWithDictionaryRepresentation(Some(bounds_dictionary), &mut frame)
            } {
                return Err(MacSystemError::invalid_data());
            }
            let on_screen =
                dictionary_value::<CFBoolean>(dictionary, unsafe { kCGWindowIsOnscreen })
                    .map(CFBoolean::value);
            result.push(MacCgWindowMetadata {
                native_id,
                process_id,
                frame,
                layer,
                alpha,
                sharing_state,
                on_screen,
                z_index: index,
            });
        }
        Ok(result)
    })
}

fn owner_process_id(owner: &SCRunningApplication) -> Result<u32, MacSystemError> {
    // SAFETY: Generated scalar accessor on a retained SCRunningApplication.
    u32::try_from(unsafe { owner.processID() }).map_err(|_| MacSystemError::invalid_data())
}

fn optional_bounded_string(
    value: Option<Retained<objc2_foundation::NSString>>,
    max_bytes: usize,
) -> Option<String> {
    let value = value?.to_string();
    if !value.is_empty() && value.len() <= max_bytes {
        Some(value)
    } else {
        None
    }
}

fn optional_bounded_title(value: Option<Retained<objc2_foundation::NSString>>) -> Option<String> {
    let value = value?.to_string();
    if !value.is_empty() && value.chars().count() <= MAX_TITLE_SCALARS {
        Some(value)
    } else {
        None
    }
}

fn non_negative_u16(value: isize) -> Result<u16, MacSystemError> {
    u16::try_from(value).map_err(|_| MacSystemError::invalid_data())
}

unsafe fn cf_ref<'a, T>(value: *const c_void) -> Option<&'a T>
where
    T: objc2_core_foundation::ConcreteType,
{
    if value.is_null() {
        return None;
    }
    // SAFETY: Callers obtain values from retained CoreFoundation containers. CFType is the common
    // root representation and downcast_ref verifies the concrete runtime type before reborrowing.
    let value = unsafe { &*value.cast::<CFType>() };
    value.downcast_ref::<T>()
}

fn dictionary_value<'a, T>(dictionary: &'a CFDictionary, key: &CFString) -> Option<&'a T>
where
    T: objc2_core_foundation::ConcreteType,
{
    // SAFETY: The key is a framework-owned CFString and the dictionary remains retained for 'a.
    let value = unsafe { dictionary.value((key as *const CFString).cast::<c_void>()) };
    if value.is_null() {
        return None;
    }
    // SAFETY: The returned pointer is borrowed from `dictionary`; runtime downcast checks `T`.
    let value = unsafe { &*value.cast::<CFType>() };
    value.downcast_ref::<T>()
}

fn required_u32(dictionary: &CFDictionary, key: &CFString) -> Result<u32, MacSystemError> {
    let value = required_i64(dictionary, key)?;
    u32::try_from(value).map_err(|_| MacSystemError::invalid_data())
}

fn required_i32(dictionary: &CFDictionary, key: &CFString) -> Result<i32, MacSystemError> {
    let value = required_i64(dictionary, key)?;
    i32::try_from(value).map_err(|_| MacSystemError::invalid_data())
}

fn required_i64(dictionary: &CFDictionary, key: &CFString) -> Result<i64, MacSystemError> {
    let number =
        dictionary_value::<CFNumber>(dictionary, key).ok_or_else(MacSystemError::invalid_data)?;
    let mut value = 0_i64;
    // SAFETY: `value` points to writable i64 storage matching SInt64Type.
    if !unsafe {
        number.value(
            CFNumberType::SInt64Type,
            (&mut value as *mut i64).cast::<c_void>(),
        )
    } {
        return Err(MacSystemError::invalid_data());
    }
    Ok(value)
}

fn required_f64(dictionary: &CFDictionary, key: &CFString) -> Result<f64, MacSystemError> {
    let number =
        dictionary_value::<CFNumber>(dictionary, key).ok_or_else(MacSystemError::invalid_data)?;
    let mut value = 0_f64;
    // SAFETY: `value` points to writable f64 storage matching Float64Type.
    if !unsafe {
        number.value(
            CFNumberType::Float64Type,
            (&mut value as *mut f64).cast::<c_void>(),
        )
    } || !value.is_finite()
    {
        return Err(MacSystemError::invalid_data());
    }
    Ok(value)
}
