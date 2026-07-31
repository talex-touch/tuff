use std::collections::HashSet;

use serde_json::Value;

use crate::geometry::DisplayGeometry;
use crate::model::{AxisScale, GlobalDipRect, PixelSize, Rotation};
use crate::test_fixtures::{TOPOLOGIES, fixture};

fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() <= 1e-9,
        "expected {expected}, got {actual}"
    );
}

fn assert_scale(actual: AxisScale, expected: AxisScale) {
    assert_close(actual.x(), expected.x());
    assert_close(actual.y(), expected.y());
}

#[test]
fn geometry_fixture_decodes_and_normalizes_display_modes() {
    let fixture = fixture();
    assert_eq!(fixture.version, 1);
    assert_eq!(fixture.topologies.len(), 3);

    let mut topology_names = HashSet::new();
    let mut saw_primary = false;
    let mut saw_rotation_90 = false;
    let mut saw_rotation_270 = false;
    let mut saw_cross_display_window = false;

    for topology in fixture.topologies {
        assert!(topology_names.insert(topology.name.clone()));
        assert!(!topology.displays.is_empty());

        for display in topology.displays {
            assert!(!display.id.is_empty());
            assert!(!display.native_id.is_empty());
            saw_primary |= display.is_primary;
            saw_rotation_90 |= display.rotation == Rotation::Degrees90;
            saw_rotation_270 |= display.rotation == Rotation::Degrees270;

            let geometry = DisplayGeometry::from_mode(
                display.global_frame,
                display.mode_pixel_size,
                display.rotation,
            )
            .expect("fixture display geometry must be valid");

            assert_eq!(
                geometry.oriented_pixel_size(),
                display.expected_oriented_pixel_size
            );
            assert_scale(geometry.scale(), display.expected_scale);

            let round_trip =
                serde_json::to_value(geometry.global_frame()).expect("global frame must serialize");
            let decoded: GlobalDipRect =
                serde_json::from_value(round_trip).expect("global frame must round-trip");
            assert_eq!(*geometry.global_frame(), decoded);
        }

        for region in topology.regions {
            assert!(!region.name.is_empty());
            assert!(!region.expected_display_ids.is_empty());
            assert!(region.global_rect.width() > 0.0);
            assert!(region.global_rect.height() > 0.0);
            assert!(region.expected_output_scale.x() > 0.0);
            assert!(region.expected_output_scale.y() > 0.0);
            let _ = region.expected_transparent_hole;
        }

        for window in topology.windows {
            assert!(!window.id.is_empty());
            assert!(!window.native_id.is_empty());
            assert!(window.global_frame.width() > 0.0);
            assert!(window.expected_covered_display_ids.len() > 1);
            assert!(window.expected_maximum_scale.x() >= 1.0);
            saw_cross_display_window = true;
        }
    }

    assert!(saw_primary);
    assert!(saw_rotation_90);
    assert!(saw_rotation_270);
    assert!(saw_cross_display_window);
}

#[test]
fn geometry_types_reject_invalid_numbers_dimensions_rotation_and_overflow() {
    assert!(GlobalDipRect::new(f64::NAN, 0.0, 10.0, 10.0).is_err());
    assert!(GlobalDipRect::new(0.0, 0.0, f64::INFINITY, 10.0).is_err());
    assert!(GlobalDipRect::new(0.0, 0.0, 0.0, 10.0).is_err());
    assert!(GlobalDipRect::new(f64::MAX, 0.0, f64::MAX, 10.0).is_err());
    assert!(AxisScale::new(0.0, 1.0).is_err());
    assert!(AxisScale::new(1.0, 4.01).is_err());
    assert!(PixelSize::new(0, 10).is_err());
    assert!(serde_json::from_value::<Rotation>(Value::from(45)).is_err());
}

#[test]
fn geometry_fixture_contains_no_sensitive_or_binary_fields() {
    fn walk(value: &Value) {
        match value {
            Value::Object(object) => {
                for (key, value) in object {
                    let normalized = key.to_ascii_lowercase();
                    assert!(
                        !matches!(
                            normalized.as_str(),
                            "image" | "imagebytes" | "bytes" | "title" | "path" | "secret"
                        ),
                        "forbidden fixture field: {key}"
                    );
                    walk(value);
                }
            }
            Value::Array(values) => values.iter().for_each(walk),
            _ => {}
        }
    }

    let value: Value = serde_json::from_str(TOPOLOGIES).expect("fixture must be JSON");
    walk(&value);
}
