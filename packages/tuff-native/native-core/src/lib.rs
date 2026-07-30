pub mod cancellation;
pub mod error;
pub mod model;
pub mod runtime;
pub mod stream;
pub mod validation;

pub use cancellation::CancellationToken;
pub use error::{ErrorCategory, ErrorDetailValue, ProtocolError};
pub use model::*;
pub use runtime::{
    BinaryPacket, CapabilityRegistry, InputAttachment, NativeRuntime, OpenedStream,
    OperationContext, OperationOutput, OutputAttachment, StreamContext, StreamMessage,
    operation_descriptor,
};
pub use stream::{StreamCreditSnapshot, StreamCreditState};
pub use validation::{
    decode_control, encode_control, negotiate_version, validate_control, validate_packet,
};

pub const PROTOCOL_MAJOR: u16 = 1;
pub const PROTOCOL_MINOR: u16 = 0;
pub const HARD_MAX_STREAM_WINDOW: u32 = 8;
pub const MAX_SAFE_SEQUENCE: u64 = 9_007_199_254_740_991;
pub const MAX_CONTROL_BYTES: usize = 1024 * 1024;
pub const MAX_ATTACHMENT_COUNT: usize = 8;
pub const MAX_ATTACHMENT_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_PACKET_ATTACHMENT_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_JSON_DEPTH: usize = 64;

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;

    const GOLDEN: &str = include_str!("../../fixtures/protocol-v1/golden.json");

    fn golden() -> serde_json::Map<String, Value> {
        serde_json::from_str::<Value>(GOLDEN)
            .expect("golden fixture must be valid JSON")
            .as_object()
            .expect("golden fixture must be an object")
            .clone()
    }

    #[test]
    fn rust_decodes_and_round_trips_every_shared_golden_control() {
        for (name, value) in golden() {
            let encoded = serde_json::to_string(&value).expect("fixture encodes");
            let control = decode_control(&encoded).unwrap_or_else(|error| {
                panic!("{name} did not decode: {error}");
            });
            let round_trip = encode_control(&control).expect("control re-encodes");
            let round_trip_value: Value =
                serde_json::from_str(&round_trip).expect("round trip JSON");
            assert_eq!(round_trip_value, value, "{name}");
        }
    }

    #[test]
    fn version_negotiation_requires_a_shared_minor_and_features() {
        let requested = vec!["attachments".to_string(), "stream-credit-v1".to_string()];
        let supported = requested.clone();
        assert_eq!(
            negotiate_version(
                ProtocolRange {
                    major: 1,
                    min_minor: 0,
                    max_minor: 0,
                },
                &requested,
                &supported,
            )
            .expect("version negotiates"),
            ProtocolVersion { major: 1, minor: 0 },
        );

        let error = negotiate_version(
            ProtocolRange {
                major: 2,
                min_minor: 0,
                max_minor: 0,
            },
            &requested,
            &supported,
        )
        .expect_err("major mismatch must fail");
        assert_eq!(error.code, "PROTOCOL_VERSION_UNSUPPORTED");

        let error = negotiate_version(
            ProtocolRange {
                major: 1,
                min_minor: 0,
                max_minor: 0,
            },
            &requested,
            &["attachments".to_string()],
        )
        .expect_err("missing stream credits must fail");
        assert_eq!(error.code, "PROTOCOL_FEATURE_UNSUPPORTED");
    }

    #[test]
    fn packet_validation_matches_descriptors_without_exposing_bytes() {
        let value = golden().remove("unaryRequest").expect("request fixture");
        let control = decode_control(&serde_json::to_string(&value).expect("fixture encodes"))
            .expect("request decodes");
        validate_packet(&control, &[b"test".to_vec()]).expect("matching attachment");

        let error = validate_packet(&control, &[b"secret payload".to_vec()])
            .expect_err("length mismatch must fail");
        assert_eq!(error.code, "ATTACHMENT_MISMATCH");
        assert!(!error.message.contains("secret"));
    }

    #[test]
    fn unsafe_sequence_and_duplicate_attachment_ids_fail_closed() {
        let mut frame = golden().remove("streamData").expect("stream fixture");
        frame["sequence"] = Value::from(MAX_SAFE_SEQUENCE + 1);
        let error = decode_control(&serde_json::to_string(&frame).expect("fixture encodes"))
            .expect_err("unsafe sequence must fail");
        assert_eq!(error.code, "INVALID_ENVELOPE");

        let mut request = golden().remove("unaryRequest").expect("request fixture");
        let duplicate = request["attachments"][0].clone();
        request["attachments"]
            .as_array_mut()
            .expect("attachments array")
            .push(duplicate);
        let error = decode_control(&serde_json::to_string(&request).expect("fixture encodes"))
            .expect_err("duplicate attachment must fail");
        assert_eq!(error.code, "ATTACHMENT_MISMATCH");
    }
}
