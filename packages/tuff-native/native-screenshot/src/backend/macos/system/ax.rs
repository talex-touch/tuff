use std::ffi::c_void;
use std::ptr::NonNull;

use objc2_application_services::{AXError, AXIsProcessTrusted, AXUIElement, AXValue, AXValueType};
use objc2_core_foundation::{CFBoolean, CFRetained, CFString, CFType, CGPoint, CGRect, CGSize};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacAxFailure {
    PermissionDenied,
    Timeout,
    Unsupported,
    UnverifiedWindow,
}

pub struct MacAxElementData {
    handle: CFRetained<AXUIElement>,
    pub role: String,
    pub subrole: Option<String>,
    pub frame: CGRect,
    pub enabled: Option<bool>,
    pub focused: Option<bool>,
}

impl MacAxElementData {
    pub fn retained_handle(&self) -> MacAxElementHandle {
        MacAxElementHandle {
            _handle: self.handle.clone(),
            frame: self.frame,
        }
    }
}

pub struct MacAxElementHandle {
    _handle: CFRetained<AXUIElement>,
    pub frame: CGRect,
}

pub fn hit_test_element(
    point: CGPoint,
    expected_process_id: u32,
    expected_window_frame: CGRect,
    timeout_seconds: f32,
) -> Result<MacAxElementData, MacAxFailure> {
    // SAFETY: Non-prompting process trust query accepts no pointers.
    if !unsafe { AXIsProcessTrusted() } {
        return Err(MacAxFailure::PermissionDenied);
    }
    // SAFETY: Constructor returns a retained system-wide AX object.
    let system = unsafe { AXUIElement::new_system_wide() };
    // SAFETY: Positive finite timeout and retained AXUIElement.
    let timeout = unsafe { system.set_messaging_timeout(timeout_seconds) };
    ensure_ax_success(timeout)?;

    let mut raw_element: *const AXUIElement = std::ptr::null();
    // SAFETY: Output pointer is valid writable storage and the system element is retained.
    let result = unsafe {
        system.copy_element_at_position(
            point.x as f32,
            point.y as f32,
            NonNull::from(&mut raw_element),
        )
    };
    ensure_ax_success(result)?;
    let raw_element = NonNull::new(raw_element.cast_mut()).ok_or(MacAxFailure::Unsupported)?;
    // SAFETY: CopyElementAtPosition follows the Copy rule and returned a non-null AXUIElement.
    let element = unsafe { CFRetained::from_raw(raw_element) };

    let mut process_id = 0_i32;
    // SAFETY: Output PID storage is valid and element is retained.
    ensure_ax_success(unsafe { element.pid(NonNull::from(&mut process_id)) })?;
    if u32::try_from(process_id).ok() != Some(expected_process_id) {
        return Err(MacAxFailure::UnverifiedWindow);
    }

    let window = required_attribute::<AXUIElement>(&element, "AXWindow")?;
    let window_frame = required_frame(&window)?;
    if !rects_are_coherent(window_frame, expected_window_frame) {
        return Err(MacAxFailure::UnverifiedWindow);
    }

    let role = required_string(&element, "AXRole")?;
    let subrole = optional_string(&element, "AXSubrole")?;
    let position = required_point(&element, "AXPosition")?;
    let size = required_size(&element, "AXSize")?;
    if !position.x.is_finite()
        || !position.y.is_finite()
        || !size.width.is_finite()
        || !size.height.is_finite()
        || size.width <= 0.0
        || size.height <= 0.0
    {
        return Err(MacAxFailure::Unsupported);
    }
    let element_frame = CGRect::new(position, size);
    if !rect_contains_with_tolerance(expected_window_frame, element_frame)
        || !rect_contains_point_with_tolerance(element_frame, point)
    {
        return Err(MacAxFailure::UnverifiedWindow);
    }
    let enabled = optional_boolean(&element, "AXEnabled")?;
    let focused = optional_boolean(&element, "AXFocused")?;
    Ok(MacAxElementData {
        handle: element,
        role,
        subrole,
        frame: element_frame,
        enabled,
        focused,
    })
}

fn required_attribute<T>(
    element: &AXUIElement,
    name: &'static str,
) -> Result<CFRetained<T>, MacAxFailure>
where
    T: objc2_core_foundation::ConcreteType,
{
    copy_attribute(element, name)?
        .ok_or(MacAxFailure::Unsupported)?
        .downcast::<T>()
        .map_err(|_| MacAxFailure::Unsupported)
}

fn required_string(element: &AXUIElement, name: &'static str) -> Result<String, MacAxFailure> {
    let value = required_attribute::<CFString>(element, name)?.to_string();
    if value.is_empty() || value.len() > 256 {
        Err(MacAxFailure::Unsupported)
    } else {
        Ok(value)
    }
}

fn optional_string(
    element: &AXUIElement,
    name: &'static str,
) -> Result<Option<String>, MacAxFailure> {
    let Some(value) = copy_attribute(element, name)? else {
        return Ok(None);
    };
    let value = value
        .downcast::<CFString>()
        .map_err(|_| MacAxFailure::Unsupported)?
        .to_string();
    if value.is_empty() || value.len() > 256 {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

fn required_frame(element: &AXUIElement) -> Result<CGRect, MacAxFailure> {
    Ok(CGRect::new(
        required_point(element, "AXPosition")?,
        required_size(element, "AXSize")?,
    ))
}

fn rects_are_coherent(actual: CGRect, expected: CGRect) -> bool {
    const TOLERANCE_DIP: f64 = 2.0;
    (actual.origin.x - expected.origin.x).abs() <= TOLERANCE_DIP
        && (actual.origin.y - expected.origin.y).abs() <= TOLERANCE_DIP
        && (actual.size.width - expected.size.width).abs() <= TOLERANCE_DIP
        && (actual.size.height - expected.size.height).abs() <= TOLERANCE_DIP
}

fn rect_contains_with_tolerance(container: CGRect, content: CGRect) -> bool {
    const TOLERANCE_DIP: f64 = 2.0;
    content.origin.x >= container.origin.x - TOLERANCE_DIP
        && content.origin.y >= container.origin.y - TOLERANCE_DIP
        && content.origin.x + content.size.width
            <= container.origin.x + container.size.width + TOLERANCE_DIP
        && content.origin.y + content.size.height
            <= container.origin.y + container.size.height + TOLERANCE_DIP
}

fn rect_contains_point_with_tolerance(rect: CGRect, point: CGPoint) -> bool {
    const TOLERANCE_DIP: f64 = 2.0;
    point.x >= rect.origin.x - TOLERANCE_DIP
        && point.y >= rect.origin.y - TOLERANCE_DIP
        && point.x <= rect.origin.x + rect.size.width + TOLERANCE_DIP
        && point.y <= rect.origin.y + rect.size.height + TOLERANCE_DIP
}

fn optional_boolean(
    element: &AXUIElement,
    name: &'static str,
) -> Result<Option<bool>, MacAxFailure> {
    let Some(value) = copy_attribute(element, name)? else {
        return Ok(None);
    };
    let value = value
        .downcast::<CFBoolean>()
        .map_err(|_| MacAxFailure::Unsupported)?;
    Ok(Some(value.value()))
}

fn required_point(element: &AXUIElement, name: &'static str) -> Result<CGPoint, MacAxFailure> {
    let value = required_attribute::<AXValue>(element, name)?;
    let mut point = CGPoint::ZERO;
    // SAFETY: Writable CGPoint storage matches AXValueType::CGPoint.
    if !unsafe {
        value.value(
            AXValueType::CGPoint,
            NonNull::from(&mut point).cast::<c_void>(),
        )
    } {
        return Err(MacAxFailure::Unsupported);
    }
    Ok(point)
}

fn required_size(element: &AXUIElement, name: &'static str) -> Result<CGSize, MacAxFailure> {
    let value = required_attribute::<AXValue>(element, name)?;
    let mut size = CGSize::ZERO;
    // SAFETY: Writable CGSize storage matches AXValueType::CGSize.
    if !unsafe {
        value.value(
            AXValueType::CGSize,
            NonNull::from(&mut size).cast::<c_void>(),
        )
    } {
        return Err(MacAxFailure::Unsupported);
    }
    Ok(size)
}

fn copy_attribute(
    element: &AXUIElement,
    name: &'static str,
) -> Result<Option<CFRetained<CFType>>, MacAxFailure> {
    let attribute = CFString::from_static_str(name);
    let mut raw: *const CFType = std::ptr::null();
    // SAFETY: Output pointer is valid writable storage; AX follows Copy ownership for success.
    let result = unsafe { element.copy_attribute_value(&attribute, NonNull::from(&mut raw)) };
    if result == AXError::NoValue || result == AXError::AttributeUnsupported {
        return Ok(None);
    }
    ensure_ax_success(result)?;
    let raw = NonNull::new(raw.cast_mut()).ok_or(MacAxFailure::Unsupported)?;
    // SAFETY: AXUIElementCopyAttributeValue follows the Copy rule on success.
    Ok(Some(unsafe { CFRetained::from_raw(raw) }))
}

fn ensure_ax_success(error: AXError) -> Result<(), MacAxFailure> {
    match error {
        AXError::Success => Ok(()),
        AXError::APIDisabled => Err(MacAxFailure::PermissionDenied),
        AXError::CannotComplete => Err(MacAxFailure::Timeout),
        AXError::AttributeUnsupported | AXError::NoValue | AXError::NotImplemented => {
            Err(MacAxFailure::Unsupported)
        }
        _ => Err(MacAxFailure::Unsupported),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> CGRect {
        CGRect::new(CGPoint::new(x, y), CGSize::new(width, height))
    }

    #[test]
    fn ax_failures_collapse_to_sanitized_categories() {
        assert_eq!(ensure_ax_success(AXError::Success), Ok(()));
        assert_eq!(
            ensure_ax_success(AXError::APIDisabled),
            Err(MacAxFailure::PermissionDenied)
        );
        assert_eq!(
            ensure_ax_success(AXError::CannotComplete),
            Err(MacAxFailure::Timeout)
        );
        assert_eq!(
            ensure_ax_success(AXError::AttributeUnsupported),
            Err(MacAxFailure::Unsupported)
        );
        assert_eq!(
            ensure_ax_success(AXError::Failure),
            Err(MacAxFailure::Unsupported)
        );
    }

    #[test]
    fn ax_window_coherence_is_bounded_and_tolerant() {
        let window = rect(-100.0, 50.0, 800.0, 600.0);
        assert!(rects_are_coherent(rect(-99.0, 49.0, 799.0, 601.0), window));
        assert!(!rects_are_coherent(rect(-90.0, 50.0, 800.0, 600.0), window));
        assert!(rect_contains_with_tolerance(
            window,
            rect(-101.0, 51.0, 400.0, 300.0)
        ));
        assert!(!rect_contains_with_tolerance(
            window,
            rect(-110.0, 51.0, 400.0, 300.0)
        ));
        assert!(rect_contains_point_with_tolerance(
            rect(10.0, 20.0, 30.0, 40.0),
            CGPoint::new(40.0, 60.0)
        ));
        assert!(!rect_contains_point_with_tolerance(
            rect(10.0, 20.0, 30.0, 40.0),
            CGPoint::new(50.0, 60.0)
        ));
    }
}
