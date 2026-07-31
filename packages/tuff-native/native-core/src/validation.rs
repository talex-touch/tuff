use std::collections::HashSet;

use serde_json::Value;

use crate::error::ProtocolError;
use crate::model::{
    AttachmentDescriptor, CapabilityDescriptor, CapabilityState, Control, OperationMode,
    ProtocolLimits, ProtocolRange, ProtocolVersion,
};
use crate::{
    HARD_MAX_STREAM_WINDOW, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_COUNT, MAX_CONTROL_BYTES,
    MAX_JSON_DEPTH, MAX_PACKET_ATTACHMENT_BYTES, MAX_SAFE_SEQUENCE, PROTOCOL_MAJOR, PROTOCOL_MINOR,
};

pub fn decode_control(encoded: &str) -> Result<Control, ProtocolError> {
    if encoded.len() > MAX_CONTROL_BYTES {
        return Err(ProtocolError::malformed_control());
    }
    let control: Control =
        serde_json::from_str(encoded).map_err(|_| ProtocolError::malformed_control())?;
    validate_control(&control)?;
    Ok(control)
}

pub fn encode_control(control: &Control) -> Result<String, ProtocolError> {
    validate_control(control)?;
    let encoded = serde_json::to_string(control).map_err(|_| ProtocolError::malformed_control())?;
    if encoded.len() > MAX_CONTROL_BYTES {
        return Err(ProtocolError::malformed_control());
    }
    Ok(encoded)
}

pub fn validate_packet(control: &Control, attachments: &[Vec<u8>]) -> Result<(), ProtocolError> {
    let descriptors = control.attachments();
    if descriptors.len() != attachments.len() {
        return Err(ProtocolError::attachment_mismatch());
    }
    for (descriptor, attachment) in descriptors.iter().zip(attachments) {
        if descriptor.byte_length != attachment.len() as u64 {
            return Err(ProtocolError::attachment_mismatch());
        }
    }
    Ok(())
}

pub fn negotiate_version(
    range: ProtocolRange,
    requested_features: &[String],
    supported_features: &[String],
) -> Result<ProtocolVersion, ProtocolError> {
    if range.major != PROTOCOL_MAJOR
        || range.min_minor > range.max_minor
        || !range_contains_minor(range, PROTOCOL_MINOR)
    {
        return Err(ProtocolError::protocol_version_unsupported());
    }
    for required in ["attachments", "stream-credit-v1"] {
        if requested_features.iter().any(|feature| feature == required)
            && !supported_features.iter().any(|feature| feature == required)
        {
            return Err(ProtocolError::protocol_feature_unsupported());
        }
    }
    Ok(ProtocolVersion {
        major: PROTOCOL_MAJOR,
        minor: PROTOCOL_MINOR,
    })
}

pub fn validate_control(control: &Control) -> Result<(), ProtocolError> {
    match control {
        Control::ClientHello {
            protocol,
            client,
            requested_features,
        } => {
            validate_range(*protocol)?;
            validate_identifier(&client.name)?;
            validate_text(&client.version, 64)?;
            validate_identifiers(requested_features)?;
        }
        Control::ServerHello {
            protocol,
            runtime,
            carrier_features,
            limits,
            capabilities,
        } => {
            validate_version(*protocol)?;
            for value in [
                &runtime.addon_id,
                &runtime.addon_version,
                &runtime.target,
                &runtime.platform,
                &runtime.arch,
                &runtime.build_profile,
            ] {
                validate_text(value, 128)?;
            }
            validate_identifiers(carrier_features)?;
            validate_limits(limits)?;
            for capability in capabilities {
                validate_capability(capability)?;
            }
        }
        Control::Request {
            protocol,
            request_id,
            capability,
            operation,
            deadline_unix_ms,
            payload,
            attachments,
        } => {
            validate_version(*protocol)?;
            validate_identifier(request_id)?;
            validate_identifier(capability)?;
            validate_identifier(operation)?;
            if deadline_unix_ms
                .is_some_and(|deadline| deadline == 0 || deadline > MAX_SAFE_SEQUENCE)
            {
                return Err(ProtocolError::invalid_envelope());
            }
            validate_json(payload, 0)?;
            validate_attachments(attachments)?;
            validate_stream_open_payload(payload)?;
        }
        Control::Response {
            protocol,
            request_id,
            ok,
            payload,
            error,
            attachments,
            meta,
        } => {
            validate_version(*protocol)?;
            validate_identifier(request_id)?;
            validate_attachments(attachments)?;
            validate_safe_integer(meta.duration_ms)?;
            if let Some(engine) = &meta.engine {
                validate_identifier(engine)?;
            }
            for (key, count) in &meta.counters {
                validate_identifier(key)?;
                validate_safe_integer(*count)?;
            }
            match (*ok, payload, error) {
                (true, Some(payload), None) => validate_json(payload, 0)?,
                (false, None, Some(error)) if attachments.is_empty() => validate_error(error)?,
                _ => return Err(ProtocolError::invalid_envelope()),
            }
        }
        Control::StreamData {
            protocol,
            stream_id,
            sequence,
            payload,
            attachments,
            meta,
        } => {
            validate_version(*protocol)?;
            validate_identifier(stream_id)?;
            validate_sequence(*sequence)?;
            validate_json(payload, 0)?;
            validate_attachments(attachments)?;
            if let Some(meta) = meta {
                validate_json(meta, 0)?;
            }
        }
        Control::StreamEnd {
            protocol,
            stream_id,
            sequence,
            payload,
            attachments,
        } => {
            validate_version(*protocol)?;
            validate_identifier(stream_id)?;
            validate_sequence(*sequence)?;
            validate_attachments(attachments)?;
            if let Some(payload) = payload {
                validate_json(payload, 0)?;
            }
        }
        Control::StreamError {
            protocol,
            stream_id,
            sequence,
            error,
            attachments,
        } => {
            validate_version(*protocol)?;
            validate_identifier(stream_id)?;
            validate_sequence(*sequence)?;
            if !attachments.is_empty() {
                return Err(ProtocolError::attachment_mismatch());
            }
            validate_error(error)?;
        }
        Control::StreamAck {
            protocol,
            stream_id,
            ack_sequence,
        } => {
            validate_version(*protocol)?;
            validate_identifier(stream_id)?;
            validate_safe_integer(*ack_sequence)?;
        }
        Control::Cancel {
            protocol, target, ..
        } => {
            validate_version(*protocol)?;
            validate_identifier(&target.id)?;
        }
    }
    Ok(())
}

fn validate_version(version: ProtocolVersion) -> Result<(), ProtocolError> {
    if version.major != PROTOCOL_MAJOR || version.minor != PROTOCOL_MINOR {
        return Err(ProtocolError::protocol_version_unsupported());
    }
    Ok(())
}

fn validate_range(range: ProtocolRange) -> Result<(), ProtocolError> {
    if range.major != PROTOCOL_MAJOR
        || range.min_minor > range.max_minor
        || !range_contains_minor(range, PROTOCOL_MINOR)
    {
        return Err(ProtocolError::protocol_version_unsupported());
    }
    Ok(())
}

fn range_contains_minor(range: ProtocolRange, minor: u16) -> bool {
    range.min_minor <= minor && minor <= range.max_minor
}

fn validate_identifier(value: &str) -> Result<(), ProtocolError> {
    if value.is_empty() || value.len() > 128 {
        return Err(ProtocolError::invalid_envelope());
    }
    let mut chars = value.bytes();
    let Some(first) = chars.next() else {
        return Err(ProtocolError::invalid_envelope());
    };
    if !first.is_ascii_alphanumeric()
        || chars.any(|byte| {
            !(byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
        })
    {
        return Err(ProtocolError::invalid_envelope());
    }
    Ok(())
}

fn validate_text(value: &str, max: usize) -> Result<(), ProtocolError> {
    if value.is_empty() || value.len() > max {
        return Err(ProtocolError::invalid_envelope());
    }
    Ok(())
}

fn validate_identifiers(values: &[String]) -> Result<(), ProtocolError> {
    for value in values {
        validate_identifier(value)?;
    }
    Ok(())
}

fn validate_limits(limits: &ProtocolLimits) -> Result<(), ProtocolError> {
    if limits.max_control_bytes == 0
        || limits.max_attachment_count == 0
        || limits.max_attachment_bytes == 0
        || limits.max_packet_attachment_bytes == 0
        || limits.max_in_flight_unary == 0
        || limits.max_open_streams == 0
        || limits.max_stream_window == 0
        || limits.max_stream_window > HARD_MAX_STREAM_WINDOW
        || limits.cancel_grace_ms == 0
        || limits.dispose_grace_ms == 0
    {
        return Err(ProtocolError::invalid_envelope());
    }
    Ok(())
}

fn validate_capability(capability: &CapabilityDescriptor) -> Result<(), ProtocolError> {
    validate_identifier(&capability.id)?;
    validate_text(&capability.version, 64)?;
    if let Some(engine) = &capability.engine {
        validate_identifier(engine)?;
    }
    if let Some(reason) = &capability.reason {
        validate_identifier(reason)?;
    }
    validate_identifiers(&capability.features)?;
    let mut operations = HashSet::new();
    for operation in &capability.operations {
        validate_identifier(&operation.name)?;
        if !operations.insert(operation.name.as_str()) {
            return Err(ProtocolError::invalid_envelope());
        }
        match operation.mode {
            OperationMode::Unary | OperationMode::Stream => {}
        }
    }
    match capability.state {
        CapabilityState::Available | CapabilityState::Degraded | CapabilityState::Unavailable => {}
    }
    Ok(())
}

fn validate_attachments(attachments: &[AttachmentDescriptor]) -> Result<(), ProtocolError> {
    if attachments.len() > MAX_ATTACHMENT_COUNT {
        return Err(ProtocolError::attachment_limit_exceeded());
    }
    let mut ids = HashSet::new();
    let mut total = 0_u64;
    for (index, attachment) in attachments.iter().enumerate() {
        validate_identifier(&attachment.id)?;
        if !ids.insert(attachment.id.as_str()) || attachment.index as usize != index {
            return Err(ProtocolError::attachment_mismatch());
        }
        if attachment.byte_length > MAX_ATTACHMENT_BYTES {
            return Err(ProtocolError::attachment_limit_exceeded());
        }
        total = total
            .checked_add(attachment.byte_length)
            .ok_or_else(ProtocolError::attachment_limit_exceeded)?;
        if total > MAX_PACKET_ATTACHMENT_BYTES {
            return Err(ProtocolError::attachment_limit_exceeded());
        }
        if let Some(media_type) = &attachment.media_type {
            validate_text(media_type, 128)?;
        }
        if let Some(purpose) = &attachment.purpose {
            validate_identifier(purpose)?;
        }
    }
    Ok(())
}

fn validate_error(error: &ProtocolError) -> Result<(), ProtocolError> {
    validate_identifier(&error.code)?;
    validate_text(&error.message, 256)?;
    for key in error.details.keys() {
        validate_identifier(key)?;
    }
    Ok(())
}

fn validate_sequence(sequence: u64) -> Result<(), ProtocolError> {
    if sequence == 0 || sequence > MAX_SAFE_SEQUENCE {
        return Err(ProtocolError::invalid_envelope());
    }
    Ok(())
}

fn validate_safe_integer(value: u64) -> Result<(), ProtocolError> {
    if value > MAX_SAFE_SEQUENCE {
        return Err(ProtocolError::invalid_envelope());
    }
    Ok(())
}

fn validate_json(value: &Value, depth: usize) -> Result<(), ProtocolError> {
    if depth > MAX_JSON_DEPTH {
        return Err(ProtocolError::invalid_envelope());
    }
    match value {
        Value::Null | Value::Bool(_) | Value::String(_) => {}
        Value::Number(number) => {
            if number.as_f64().is_none_or(|value| !value.is_finite()) {
                return Err(ProtocolError::invalid_envelope());
            }
        }
        Value::Array(values) => {
            for value in values {
                validate_json(value, depth + 1)?;
            }
        }
        Value::Object(values) => {
            for (key, value) in values {
                if key.len() > 256 {
                    return Err(ProtocolError::invalid_envelope());
                }
                validate_json(value, depth + 1)?;
            }
        }
    }
    Ok(())
}

fn validate_stream_open_payload(payload: &Value) -> Result<(), ProtocolError> {
    let Value::Object(payload) = payload else {
        return Ok(());
    };
    let Some(window) = payload.get("initialWindow") else {
        return Ok(());
    };
    let Some(window) = window.as_u64() else {
        return Err(ProtocolError::invalid_envelope());
    };
    if window == 0 || window > HARD_MAX_STREAM_WINDOW as u64 {
        return Err(ProtocolError::invalid_envelope());
    }
    let Some(stream_id) = payload.get("streamId").and_then(Value::as_str) else {
        return Err(ProtocolError::invalid_envelope());
    };
    validate_identifier(stream_id)
}
