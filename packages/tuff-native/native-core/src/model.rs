use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::ProtocolError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolVersion {
    pub major: u16,
    pub minor: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolRange {
    pub major: u16,
    pub min_minor: u16,
    pub max_minor: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientIdentity {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDescriptor {
    pub addon_id: String,
    pub addon_version: String,
    pub target: String,
    pub platform: String,
    pub arch: String,
    pub build_profile: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolLimits {
    pub max_control_bytes: u64,
    pub max_attachment_count: u32,
    pub max_attachment_bytes: u64,
    pub max_packet_attachment_bytes: u64,
    pub max_in_flight_unary: u32,
    pub max_open_streams: u32,
    pub max_stream_window: u32,
    pub cancel_grace_ms: u32,
    pub dispose_grace_ms: u32,
}

impl Default for ProtocolLimits {
    fn default() -> Self {
        Self {
            max_control_bytes: 1024 * 1024,
            max_attachment_count: 8,
            max_attachment_bytes: 64 * 1024 * 1024,
            max_packet_attachment_bytes: 128 * 1024 * 1024,
            max_in_flight_unary: 64,
            max_open_streams: 16,
            max_stream_window: crate::HARD_MAX_STREAM_WINDOW,
            cancel_grace_ms: 1_000,
            dispose_grace_ms: 3_000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityState {
    Available,
    Degraded,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationMode {
    Unary,
    Stream,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CancellationMode {
    Cooperative,
    BestEffort,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationDescriptor {
    pub name: String,
    pub mode: OperationMode,
    pub cancellation: CancellationMode,
    pub accepts_attachments: bool,
    pub emits_attachments: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDescriptor {
    pub id: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    pub state: CapabilityState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub operations: Vec<OperationDescriptor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDescriptor {
    pub id: String,
    pub index: u32,
    pub byte_length: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub purpose: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunMeta {
    pub duration_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub degraded: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancellation: Option<CancellationMode>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub counters: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Control {
    #[serde(rename_all = "camelCase")]
    ClientHello {
        protocol: ProtocolRange,
        client: ClientIdentity,
        requested_features: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    ServerHello {
        protocol: ProtocolVersion,
        runtime: RuntimeDescriptor,
        carrier_features: Vec<String>,
        limits: ProtocolLimits,
        capabilities: Vec<CapabilityDescriptor>,
    },
    #[serde(rename_all = "camelCase")]
    Request {
        protocol: ProtocolVersion,
        request_id: String,
        capability: String,
        operation: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        deadline_unix_ms: Option<u64>,
        payload: Value,
        attachments: Vec<AttachmentDescriptor>,
    },
    #[serde(rename_all = "camelCase")]
    Response {
        protocol: ProtocolVersion,
        request_id: String,
        ok: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        payload: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<ProtocolError>,
        attachments: Vec<AttachmentDescriptor>,
        meta: RunMeta,
    },
    #[serde(rename_all = "camelCase")]
    StreamData {
        protocol: ProtocolVersion,
        stream_id: String,
        sequence: u64,
        payload: Value,
        attachments: Vec<AttachmentDescriptor>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        meta: Option<Value>,
    },
    #[serde(rename_all = "camelCase")]
    StreamEnd {
        protocol: ProtocolVersion,
        stream_id: String,
        sequence: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        payload: Option<Value>,
        attachments: Vec<AttachmentDescriptor>,
    },
    #[serde(rename_all = "camelCase")]
    StreamError {
        protocol: ProtocolVersion,
        stream_id: String,
        sequence: u64,
        error: ProtocolError,
        attachments: Vec<AttachmentDescriptor>,
    },
    #[serde(rename_all = "camelCase")]
    StreamAck {
        protocol: ProtocolVersion,
        stream_id: String,
        ack_sequence: u64,
    },
    #[serde(rename_all = "camelCase")]
    Cancel {
        protocol: ProtocolVersion,
        target: CancelTarget,
        reason: CancelReason,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelTarget {
    #[serde(rename = "type")]
    pub target_type: CancelTargetType,
    pub id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CancelTargetType {
    Request,
    Stream,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CancelReason {
    Caller,
    ConsumerClosed,
    Deadline,
    Dispose,
}

impl Control {
    pub fn attachments(&self) -> &[AttachmentDescriptor] {
        match self {
            Self::Request { attachments, .. }
            | Self::Response { attachments, .. }
            | Self::StreamData { attachments, .. }
            | Self::StreamEnd { attachments, .. }
            | Self::StreamError { attachments, .. } => attachments,
            Self::ClientHello { .. }
            | Self::ServerHello { .. }
            | Self::StreamAck { .. }
            | Self::Cancel { .. } => &[],
        }
    }

    pub fn request_id(&self) -> Option<&str> {
        match self {
            Self::Request { request_id, .. } | Self::Response { request_id, .. } => {
                Some(request_id)
            }
            _ => None,
        }
    }
}
