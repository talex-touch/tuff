#![allow(non_snake_case)]

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use block2::RcBlock;
use dispatch2::{DispatchQueue, DispatchRetained};
use objc2::rc::{Retained, autoreleasepool};
use objc2::runtime::ProtocolObject;
use objc2::{AnyThread, DefinedClass, define_class, msg_send};
use objc2_core_foundation::{CFDictionary, CFNumber, CFNumberType, CFString, CFType};
use objc2_core_media::{CMSampleBuffer, CMTime};
use objc2_core_video::{
    CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow, CVPixelBufferGetHeight,
    CVPixelBufferGetPixelFormatType, CVPixelBufferGetWidth, CVPixelBufferLockBaseAddress,
    CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress, kCVPixelFormatType_32BGRA,
    kCVReturnSuccess,
};
use objc2_foundation::{NSError, NSObject, NSObjectProtocol};
use objc2_screen_capture_kit::{
    SCFrameStatus, SCStream, SCStreamDelegate, SCStreamFrameInfoStatus, SCStreamOutput,
    SCStreamOutputType,
};

use super::{MacCaptureConfiguration, MacContentFilter, MacSystemError};

pub struct MacStreamFrame {
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    pub bgra_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy)]
pub struct MacStreamOptions {
    pub frames_per_second: u32,
    pub queue_depth: u32,
    pub max_frame_bytes: usize,
}

struct CallbackState {
    closed: AtomicBool,
    max_frame_bytes: usize,
    on_frame: Box<dyn Fn(MacStreamFrame) + Send + Sync>,
    on_error: Box<dyn Fn(MacSystemError) + Send + Sync>,
}

struct StreamOutputIvars {
    callbacks: Arc<CallbackState>,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements and ivars contain only Rust-owned state.
    #[unsafe(super = NSObject)]
    #[thread_kind = AnyThread]
    #[ivars = StreamOutputIvars]
    struct StreamOutput;

    // SAFETY: NSObjectProtocol has no additional implementation requirements.
    unsafe impl NSObjectProtocol for StreamOutput {}

    // SAFETY: The selector and argument types exactly match the generated SCStreamOutput protocol.
    unsafe impl SCStreamOutput for StreamOutput {
        #[unsafe(method(stream:didOutputSampleBuffer:ofType:))]
        unsafe fn stream_didOutputSampleBuffer_ofType(
            &self,
            _stream: &SCStream,
            sample_buffer: &CMSampleBuffer,
            output_type: SCStreamOutputType,
        ) {
            if output_type != SCStreamOutputType::Screen
                || self.ivars().callbacks.closed.load(Ordering::Acquire)
            {
                return;
            }
            // SAFETY: ScreenCaptureKit keeps the sample valid for this callback. Extraction copies
            // bytes while the CVPixelBuffer is locked and releases the lock before returning.
            match unsafe {
                copy_complete_sample(sample_buffer, self.ivars().callbacks.max_frame_bytes)
            } {
                Ok(Some(frame)) => (self.ivars().callbacks.on_frame)(frame),
                Ok(None) => {}
                Err(error) => {
                    if !self.ivars().callbacks.closed.swap(true, Ordering::AcqRel) {
                        (self.ivars().callbacks.on_error)(error);
                    }
                }
            }
        }
    }

    // SAFETY: The selector and argument types exactly match the generated SCStreamDelegate protocol.
    unsafe impl SCStreamDelegate for StreamOutput {
        #[unsafe(method(stream:didStopWithError:))]
        unsafe fn stream_didStopWithError(&self, _stream: &SCStream, error: &NSError) {
            if !self.ivars().callbacks.closed.swap(true, Ordering::AcqRel) {
                (self.ivars().callbacks.on_error)(MacSystemError::from_nserror(
                    error as *const NSError as *mut NSError,
                ));
            }
        }
    }
);

impl StreamOutput {
    fn new(callbacks: Arc<CallbackState>) -> Retained<Self> {
        let this = Self::alloc().set_ivars(StreamOutputIvars { callbacks });
        // SAFETY: NSObject's init contract is valid for this direct subclass.
        unsafe { msg_send![super(this), init] }
    }
}

pub struct MacStreamSession {
    stream: Retained<SCStream>,
    output: Retained<StreamOutput>,
    _queue: DispatchRetained<DispatchQueue>,
    callbacks: Arc<CallbackState>,
}

pub fn start_stream<Started, Frame, Failed>(
    filter: &MacContentFilter,
    configuration: &MacCaptureConfiguration,
    options: MacStreamOptions,
    started: Started,
    on_frame: Frame,
    on_error: Failed,
) -> Result<MacStreamSession, MacSystemError>
where
    Started: FnOnce(Result<(), MacSystemError>) + Send + 'static,
    Frame: Fn(MacStreamFrame) + Send + Sync + 'static,
    Failed: Fn(MacSystemError) + Send + Sync + 'static,
{
    if options.frames_per_second == 0 || options.queue_depth == 0 || options.max_frame_bytes == 0 {
        return Err(MacSystemError::invalid_data());
    }
    autoreleasepool(|_| {
        // SAFETY: Values are validated above and BGRA is the protocol's declared frame format.
        unsafe {
            configuration
                .inner
                .setMinimumFrameInterval(CMTime::new(1, options.frames_per_second as i32));
            configuration
                .inner
                .setQueueDepth(options.queue_depth as isize);
            configuration
                .inner
                .setPixelFormat(kCVPixelFormatType_32BGRA);
        }
        let callbacks = Arc::new(CallbackState {
            closed: AtomicBool::new(false),
            max_frame_bytes: options.max_frame_bytes,
            on_frame: Box::new(on_frame),
            on_error: Box::new(on_error),
        });
        let output = StreamOutput::new(Arc::clone(&callbacks));
        let protocol_delegate: &ProtocolObject<dyn SCStreamDelegate> =
            ProtocolObject::from_ref(&*output);
        // SAFETY: Filter/configuration are retained SCK objects and StreamOutput implements both
        // generated protocols with exact selectors.
        let stream = unsafe {
            SCStream::initWithFilter_configuration_delegate(
                SCStream::alloc(),
                &filter.inner,
                &configuration.inner,
                Some(protocol_delegate),
            )
        };
        let protocol_output: &ProtocolObject<dyn SCStreamOutput> =
            ProtocolObject::from_ref(&*output);
        let queue = DispatchQueue::new("com.talex-touch.screenshot.frames", None);
        // SAFETY: The queue is a retained serial dispatch queue and protocol_output remains retained
        // by both `output` and the returned session.
        unsafe {
            stream.addStreamOutput_type_sampleHandlerQueue_error(
                protocol_output,
                SCStreamOutputType::Screen,
                Some(&queue),
            )
        }
        .map_err(|error| MacSystemError::from_nserror(Retained::as_ptr(&error).cast_mut()))?;

        let started = Arc::new(Mutex::new(Some(started)));
        let callback_started = Arc::clone(&started);
        let block = RcBlock::new(move |error: *mut NSError| {
            let callback = callback_started
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .take();
            if let Some(callback) = callback {
                if error.is_null() {
                    callback(Ok(()));
                } else {
                    callback(Err(MacSystemError::from_nserror(error)));
                }
            }
        });
        // SAFETY: The heap block has the generated NSError callback signature and is copied by SCK.
        unsafe { stream.startCaptureWithCompletionHandler(Some(&block)) };
        Ok(MacStreamSession {
            stream,
            output,
            _queue: queue,
            callbacks,
        })
    })
}

impl MacStreamSession {
    pub fn stop<F>(&self, completion: F)
    where
        F: FnOnce(Result<(), MacSystemError>) + Send + 'static,
    {
        if self.callbacks.closed.swap(true, Ordering::AcqRel) {
            completion(Ok(()));
            return;
        }
        let output = ProtocolObject::from_ref(&*self.output);
        // SAFETY: The output was added to this exact stream and remains retained by the session.
        let remove_result = unsafe {
            self.stream
                .removeStreamOutput_type_error(output, SCStreamOutputType::Screen)
        }
        .map_err(|error| MacSystemError::from_nserror(Retained::as_ptr(&error).cast_mut()));
        let completion = Arc::new(Mutex::new(Some(completion)));
        let callback_completion = Arc::clone(&completion);
        let block = RcBlock::new(move |error: *mut NSError| {
            let callback = callback_completion
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .take();
            if let Some(callback) = callback {
                if error.is_null() {
                    callback(remove_result);
                } else {
                    callback(Err(MacSystemError::from_nserror(error)));
                }
            }
        });
        // SAFETY: The heap block has the generated NSError callback signature and is copied by SCK.
        unsafe { self.stream.stopCaptureWithCompletionHandler(Some(&block)) };
    }
}

impl Drop for MacStreamSession {
    fn drop(&mut self) {
        if !self.callbacks.closed.swap(true, Ordering::AcqRel) {
            // SAFETY: Best-effort asynchronous stop; the stream retains internal state until stop.
            unsafe { self.stream.stopCaptureWithCompletionHandler(None) };
        }
    }
}

unsafe fn copy_complete_sample(
    sample: &CMSampleBuffer,
    max_frame_bytes: usize,
) -> Result<Option<MacStreamFrame>, MacSystemError> {
    // SAFETY: Generated scalar methods accept a valid callback-borrowed CMSampleBuffer.
    if !unsafe { sample.is_valid() } || !unsafe { sample.data_is_ready() } {
        return Ok(None);
    }
    // SAFETY: Attachment objects are borrowed from the valid sample and runtime-checked below.
    if !unsafe { sample_is_complete(sample) }? {
        return Ok(None);
    }
    // SAFETY: The sample remains valid for the callback; the returned image buffer is retained.
    let pixel_buffer = unsafe { sample.image_buffer() }.ok_or_else(MacSystemError::invalid_data)?;
    if CVPixelBufferGetPixelFormatType(&pixel_buffer) != kCVPixelFormatType_32BGRA {
        return Err(MacSystemError::invalid_data());
    }
    let flags = CVPixelBufferLockFlags::ReadOnly;
    // SAFETY: Lock/unlock are paired below with identical flags.
    if unsafe { CVPixelBufferLockBaseAddress(&pixel_buffer, flags) } != kCVReturnSuccess {
        return Err(MacSystemError::invalid_data());
    }
    let result = (|| {
        let width = CVPixelBufferGetWidth(&pixel_buffer);
        let height = CVPixelBufferGetHeight(&pixel_buffer);
        let bytes_per_row = CVPixelBufferGetBytesPerRow(&pixel_buffer);
        let packed_stride = width
            .checked_mul(4)
            .ok_or_else(MacSystemError::invalid_data)?;
        let source_bytes = bytes_per_row
            .checked_mul(height)
            .ok_or_else(MacSystemError::invalid_data)?;
        let output_bytes = packed_stride
            .checked_mul(height)
            .ok_or_else(MacSystemError::invalid_data)?;
        let base = CVPixelBufferGetBaseAddress(&pixel_buffer);
        if width == 0
            || height == 0
            || bytes_per_row < packed_stride
            || output_bytes > max_frame_bytes
            || base.is_null()
        {
            return Err(MacSystemError::invalid_data());
        }
        // SAFETY: A successful lock guarantees the base address covers all rows until unlock.
        let source = unsafe { std::slice::from_raw_parts(base.cast::<u8>(), source_bytes) };
        let mut bgra = vec![0_u8; output_bytes];
        for row in 0..height {
            let source_start = row * bytes_per_row;
            let output_start = row * packed_stride;
            bgra[output_start..output_start + packed_stride]
                .copy_from_slice(&source[source_start..source_start + packed_stride]);
        }
        Ok(MacStreamFrame {
            width: u32::try_from(width).map_err(|_| MacSystemError::invalid_data())?,
            height: u32::try_from(height).map_err(|_| MacSystemError::invalid_data())?,
            stride: u32::try_from(packed_stride).map_err(|_| MacSystemError::invalid_data())?,
            bgra_bytes: bgra,
        })
    })();
    // SAFETY: This exactly balances the successful lock above with the same flags.
    let unlock = unsafe { CVPixelBufferUnlockBaseAddress(&pixel_buffer, flags) };
    if unlock != kCVReturnSuccess {
        return Err(MacSystemError::invalid_data());
    }
    result.map(Some)
}

unsafe fn sample_is_complete(sample: &CMSampleBuffer) -> Result<bool, MacSystemError> {
    // SAFETY: The sample is valid and the returned attachment array is retained for this scope.
    let Some(attachments) = (unsafe { sample.sample_attachments_array(false) }) else {
        return Ok(false);
    };
    if attachments.count() <= 0 {
        return Ok(false);
    }
    // SAFETY: Count proves index zero exists; runtime type checking verifies dictionary/number.
    let value = unsafe { attachments.value_at_index(0) };
    let dictionary =
        unsafe { cf_ref::<CFDictionary>(value) }.ok_or_else(MacSystemError::invalid_data)?;
    // SAFETY: Framework static is a permanently valid NSString toll-free bridged to CFString.
    let key: &CFString = unsafe { SCStreamFrameInfoStatus }.as_ref();
    let status =
        dictionary_value::<CFNumber>(dictionary, key).ok_or_else(MacSystemError::invalid_data)?;
    let mut value = 0_i64;
    // SAFETY: Writable i64 storage matches SInt64Type.
    if !unsafe {
        status.value(
            CFNumberType::SInt64Type,
            (&mut value as *mut i64).cast::<c_void>(),
        )
    } {
        return Err(MacSystemError::invalid_data());
    }
    Ok(value == SCFrameStatus::Complete.0 as i64)
}

unsafe fn cf_ref<'a, T>(value: *const c_void) -> Option<&'a T>
where
    T: objc2_core_foundation::ConcreteType,
{
    if value.is_null() {
        return None;
    }
    // SAFETY: Caller obtained the value from a retained CF container; downcast checks its type.
    let value = unsafe { &*value.cast::<CFType>() };
    value.downcast_ref::<T>()
}

fn dictionary_value<'a, T>(dictionary: &'a CFDictionary, key: &CFString) -> Option<&'a T>
where
    T: objc2_core_foundation::ConcreteType,
{
    // SAFETY: Key and dictionary are valid retained CF objects for this borrow.
    let value = unsafe { dictionary.value((key as *const CFString).cast::<c_void>()) };
    if value.is_null() {
        return None;
    }
    // SAFETY: Value is borrowed from dictionary; downcast verifies concrete type.
    let value = unsafe { &*value.cast::<CFType>() };
    value.downcast_ref::<T>()
}
