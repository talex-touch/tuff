use crate::geometry::DisplayGeometry;
use crate::model::{DescriptorId, GlobalDipRect, OutputPixelRect, PixelSize, Rotation};
use crate::region_plan::{
    AttachmentChunk, AttachmentChunkLimits, RegionDisplay, RegionOutputScale, RegionPlan,
    RegionPlanLimits, plan_attachment_chunks, validate_attachment_chunks,
};
use crate::test_fixtures::{TopologyFixture, fixture};

fn rect(x: f64, y: f64, width: f64, height: f64) -> GlobalDipRect {
    GlobalDipRect::new(x, y, width, height).expect("valid rectangle")
}

fn display(
    id: &str,
    frame: GlobalDipRect,
    mode_width: u32,
    mode_height: u32,
    rotation: Rotation,
) -> RegionDisplay {
    RegionDisplay::new(
        DescriptorId::new(id).expect("valid id"),
        DisplayGeometry::from_mode(
            frame,
            PixelSize::new(mode_width, mode_height).expect("valid pixel size"),
            rotation,
        )
        .expect("valid display geometry"),
    )
}

fn fixture_plan(topology: TopologyFixture) -> RegionPlan {
    let region = topology
        .regions
        .into_iter()
        .next()
        .expect("fixture topology has a region");
    let displays = topology
        .displays
        .into_iter()
        .map(|display| {
            RegionDisplay::new(
                DescriptorId::new(display.id).expect("valid fixture display id"),
                DisplayGeometry::from_mode(
                    display.global_frame,
                    display.mode_pixel_size,
                    display.rotation,
                )
                .expect("valid fixture display geometry"),
            )
        })
        .collect::<Vec<_>>();

    let plan = RegionPlan::build(
        region.global_rect,
        displays,
        RegionOutputScale::NativeMax,
        RegionPlanLimits::default(),
    )
    .expect("fixture region must plan");

    assert_eq!(
        plan.segments()
            .iter()
            .map(|segment| segment.display_id().as_str())
            .collect::<Vec<_>>(),
        region
            .expected_display_ids
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
    );
    assert_eq!(plan.output_scale(), region.expected_output_scale);
    assert_eq!(
        plan.has_transparent_holes(),
        region.expected_transparent_hole
    );
    plan
}

#[test]
fn region_plan_matches_shared_mixed_scale_rotation_and_hole_fixtures() {
    for topology in fixture().topologies {
        let plan = fixture_plan(topology);
        let output_bounds = OutputPixelRect::new(
            0,
            0,
            plan.output_size().width(),
            plan.output_size().height(),
        )
        .unwrap();

        for segment in plan.segments() {
            assert!(
                segment
                    .display_geometry()
                    .global_frame()
                    .contains_rect(segment.global_rect())
            );
            assert!(segment.destination().x() >= output_bounds.x());
            assert!(segment.destination().y() >= output_bounds.y());
            assert!(segment.destination().right() <= output_bounds.right());
            assert!(segment.destination().bottom() <= output_bounds.bottom());
            assert!(
                segment.source_pixels().right()
                    <= segment.display_geometry().oriented_pixel_size().width()
            );
            assert!(
                segment.source_pixels().bottom()
                    <= segment.display_geometry().oriented_pixel_size().height()
            );
        }
    }
}

#[test]
fn adjacent_segments_share_one_destination_edge_and_holes_stay_empty() {
    let mut topologies = fixture().topologies.into_iter();
    let mixed = fixture_plan(topologies.next().unwrap());
    assert_eq!(mixed.segments().len(), 2);
    assert_eq!(
        mixed.segments()[0].destination().right(),
        mixed.segments()[1].destination().x()
    );

    let _rotated = fixture_plan(topologies.next().unwrap());
    let hole = fixture_plan(topologies.next().unwrap());
    assert_eq!(hole.segments().len(), 2);
    assert!(
        hole.segments()[0].destination().right() < hole.segments()[1].destination().x(),
        "the topology gap must remain transparent"
    );
}

#[test]
fn region_plan_order_is_stable_and_empty_intersections_fail() {
    let left = display(
        "display:left",
        rect(-100.0, 0.0, 100.0, 100.0),
        100,
        100,
        Rotation::Degrees0,
    );
    let right = display(
        "display:right",
        rect(0.0, 0.0, 100.0, 100.0),
        200,
        200,
        Rotation::Degrees0,
    );
    let plan = RegionPlan::build(
        rect(-50.0, 0.0, 100.0, 100.0),
        vec![right, left],
        RegionOutputScale::NativeMax,
        RegionPlanLimits::default(),
    )
    .unwrap();

    assert_eq!(plan.segments()[0].display_id().as_str(), "display:left");
    assert_eq!(plan.segments()[1].display_id().as_str(), "display:right");
    assert_eq!(
        plan.segments()[0].destination().right(),
        plan.segments()[1].destination().x()
    );

    assert!(
        RegionPlan::build(
            rect(1000.0, 1000.0, 10.0, 10.0),
            vec![display(
                "display:only",
                rect(0.0, 0.0, 100.0, 100.0),
                100,
                100,
                Rotation::Degrees0,
            )],
            RegionOutputScale::NativeMax,
            RegionPlanLimits::default(),
        )
        .is_err()
    );
}

#[test]
fn generated_display_grids_keep_every_source_and_destination_bounded() {
    for columns in 1..=4_u32 {
        let displays = (0..columns)
            .map(|column| {
                let scale = if column % 2 == 0 { 1 } else { 2 };
                display(
                    &format!("display:grid-{column}"),
                    rect(f64::from(column) * 120.0 - 240.0, -80.0, 120.0, 90.0),
                    120 * scale,
                    90 * scale,
                    Rotation::Degrees0,
                )
            })
            .collect::<Vec<_>>();
        let request = rect(-239.75, -79.75, f64::from(columns) * 120.0 - 0.5, 89.5);
        let plan = RegionPlan::build(
            request,
            displays,
            RegionOutputScale::NativeMax,
            RegionPlanLimits::default(),
        )
        .expect("generated grid must plan");

        for segment in plan.segments() {
            assert!(
                segment
                    .display_geometry()
                    .global_frame()
                    .contains_rect(segment.global_rect())
            );
            assert!(segment.destination().right() <= plan.output_size().width());
            assert!(segment.destination().bottom() <= plan.output_size().height());
        }
    }
}

#[test]
fn region_plan_rejects_pixel_and_working_set_budget_overflow() {
    let request = rect(0.0, 0.0, 100.0, 100.0);
    let make_display = || display("display:budget", request, 100, 100, Rotation::Degrees0);

    assert!(
        RegionPlan::build(
            request,
            vec![make_display()],
            RegionOutputScale::NativeMax,
            RegionPlanLimits::new(9_999, u64::MAX).unwrap(),
        )
        .is_err()
    );
    assert!(
        RegionPlan::build(
            request,
            vec![make_display()],
            RegionOutputScale::NativeMax,
            RegionPlanLimits::new(u64::MAX, 1).unwrap(),
        )
        .is_err()
    );
    assert!(
        RegionPlan::build(
            request,
            vec![make_display()],
            RegionOutputScale::Explicit(4.01),
            RegionPlanLimits::default(),
        )
        .is_err()
    );
}

#[test]
fn attachment_chunks_are_bounded_contiguous_and_packet_limited() {
    let protocol_limits = AttachmentChunkLimits::protocol_defaults();
    let protocol_chunks = plan_attachment_chunks(128 * 1024 * 1024, protocol_limits).unwrap();
    assert_eq!(protocol_chunks.len(), 4);
    assert!(
        protocol_chunks
            .iter()
            .all(|chunk| chunk.byte_length() <= 32 * 1024 * 1024)
    );
    assert!(plan_attachment_chunks(128 * 1024 * 1024 + 1, protocol_limits).is_err());

    let limits = AttachmentChunkLimits::new(32, 8, 128).unwrap();
    let chunks = plan_attachment_chunks(70, limits).unwrap();
    assert_eq!(
        chunks,
        vec![
            AttachmentChunk::new(0, 32).unwrap(),
            AttachmentChunk::new(32, 32).unwrap(),
            AttachmentChunk::new(64, 6).unwrap(),
        ]
    );
    validate_attachment_chunks(70, &chunks, limits).unwrap();

    assert!(plan_attachment_chunks(70, AttachmentChunkLimits::new(32, 2, 128).unwrap()).is_err());
    assert!(plan_attachment_chunks(65, AttachmentChunkLimits::new(32, 8, 64).unwrap()).is_err());
    assert!(
        validate_attachment_chunks(
            70,
            &[
                AttachmentChunk::new(0, 33).unwrap(),
                AttachmentChunk::new(33, 37).unwrap(),
            ],
            limits,
        )
        .is_err()
    );
    assert!(
        validate_attachment_chunks(
            70,
            &[
                AttachmentChunk::new(0, 32).unwrap(),
                AttachmentChunk::new(33, 37).unwrap(),
            ],
            limits,
        )
        .is_err()
    );
}
