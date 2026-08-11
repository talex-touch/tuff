use crate::geometry::DisplayGeometry;
use crate::limits::ScreenshotLimits;
use crate::model::{DescriptorId, GlobalDipPoint, GlobalDipRect, PixelSize, Rotation};
use crate::region_plan::RegionDisplay;
use crate::test_fixtures::fixture;
use crate::window_candidates::{
    CgWindowMetadata, SelfWindowPolicy, ShareableWindow, WindowHitTestOptions, WindowKind,
    WindowOwner, WindowSelectionPolicy, WindowSharing, build_window_descriptors, hit_test_windows,
};

fn rect(x: f64, y: f64, width: f64, height: f64) -> GlobalDipRect {
    GlobalDipRect::new(x, y, width, height).expect("valid rectangle")
}

fn owner(process_id: u32, bundle_id: &str) -> WindowOwner {
    WindowOwner::new(
        process_id,
        Some(bundle_id.to_string()),
        Some("Shared Owner Name".to_string()),
        ScreenshotLimits::default(),
    )
    .expect("valid owner")
}

fn shareable(
    opaque_id: &str,
    native_id: u32,
    process_id: u32,
    bundle_id: &str,
    frame: GlobalDipRect,
    layer: i32,
) -> ShareableWindow {
    ShareableWindow::new(
        DescriptorId::new(opaque_id).unwrap(),
        native_id,
        owner(process_id, bundle_id),
        Some("Shared Window Title".to_string()),
        frame,
        layer,
        true,
        None,
        true,
        ScreenshotLimits::default(),
    )
    .expect("valid shareable window")
}

fn cg(native_id: u32, process_id: u32, frame: GlobalDipRect, layer: i32) -> CgWindowMetadata {
    CgWindowMetadata::new(
        native_id,
        process_id,
        frame,
        layer,
        1.0,
        WindowSharing::ReadWrite,
        Some(true),
    )
    .expect("valid Core Graphics metadata")
}

fn selection_policy() -> WindowSelectionPolicy {
    WindowSelectionPolicy::new(
        8.0,
        SelfWindowPolicy::new(
            vec![700],
            vec!["com.talex.touch".to_string()],
            vec![7000],
            ScreenshotLimits::default(),
        )
        .expect("valid self policy"),
        vec![
            "com.apple.dock".to_string(),
            "com.apple.systemuiserver".to_string(),
        ],
        ScreenshotLimits::default(),
    )
    .expect("valid selection policy")
}

fn display(id: &str, frame: GlobalDipRect, scale: u32) -> RegionDisplay {
    RegionDisplay::new(
        DescriptorId::new(id).unwrap(),
        DisplayGeometry::from_mode(
            frame,
            PixelSize::new(
                (frame.width() as u32) * scale,
                (frame.height() as u32) * scale,
            )
            .unwrap(),
            Rotation::Degrees0,
        )
        .unwrap(),
    )
}

#[test]
fn exact_native_id_is_the_only_join_key() {
    let frame = rect(10.0, 20.0, 500.0, 400.0);
    let descriptors = build_window_descriptors(
        vec![shareable(
            "window:sck-1",
            1,
            100,
            "com.example.same",
            frame,
            0,
        )],
        vec![cg(2, 100, frame, 0)],
        &[],
        &selection_policy(),
    );

    assert!(descriptors.is_empty());
}

#[test]
fn cg_front_to_back_order_wins_over_shareable_content_order() {
    let frame = rect(0.0, 0.0, 400.0, 300.0);
    let descriptors = build_window_descriptors(
        vec![
            shareable("window:back", 2, 102, "com.example.back", frame, 0),
            shareable("window:front", 1, 101, "com.example.front", frame, 0),
        ],
        vec![cg(1, 101, frame, 0), cg(2, 102, frame, 0)],
        &[],
        &selection_policy(),
    );

    assert_eq!(descriptors.len(), 2);
    assert_eq!(descriptors[0].native_id(), 1);
    assert_eq!(descriptors[0].z_index(), 0);
    assert_eq!(descriptors[1].native_id(), 2);
    assert_eq!(descriptors[1].z_index(), 1);
}

#[test]
fn duplicate_ids_fail_closed_and_metadata_disagreement_is_not_capturable() {
    let frame = rect(0.0, 0.0, 400.0, 300.0);
    let duplicate_shareable = shareable("window:duplicate-a", 1, 101, "com.example", frame, 0);
    let duplicate_shareable_again =
        shareable("window:duplicate-b", 1, 101, "com.example", frame, 0);
    assert!(
        build_window_descriptors(
            vec![duplicate_shareable, duplicate_shareable_again],
            vec![cg(1, 101, frame, 0)],
            &[],
            &selection_policy(),
        )
        .is_empty()
    );

    assert!(
        build_window_descriptors(
            vec![shareable(
                "window:duplicate-cg",
                2,
                102,
                "com.example",
                frame,
                0
            )],
            vec![cg(2, 102, frame, 0), cg(2, 102, frame, 0)],
            &[],
            &selection_policy(),
        )
        .is_empty()
    );

    let descriptors = build_window_descriptors(
        vec![shareable(
            "window:mismatch",
            3,
            103,
            "com.example",
            frame,
            0,
        )],
        vec![cg(3, 999, rect(1.0, 0.0, 400.0, 300.0), 1)],
        &[],
        &selection_policy(),
    );
    assert_eq!(descriptors.len(), 1);
    assert!(!descriptors[0].capturable());
}

#[test]
fn off_screen_and_protected_windows_do_not_become_default_candidates() {
    let frame = rect(0.0, 0.0, 400.0, 300.0);
    let off_screen = ShareableWindow::new(
        DescriptorId::new("window:off-screen").unwrap(),
        1,
        owner(101, "com.example.off-screen"),
        None,
        frame,
        0,
        false,
        None,
        true,
        ScreenshotLimits::default(),
    )
    .unwrap();
    let protected = ShareableWindow::new(
        DescriptorId::new("window:protected").unwrap(),
        2,
        owner(102, "com.example.protected"),
        None,
        frame,
        0,
        true,
        None,
        false,
        ScreenshotLimits::default(),
    )
    .unwrap();
    let descriptors = build_window_descriptors(
        vec![off_screen, protected],
        vec![cg(1, 101, frame, 0), cg(2, 102, frame, 0)],
        &[display("display:main", frame, 1)],
        &selection_policy(),
    );

    assert_eq!(descriptors.len(), 1);
    assert_eq!(descriptors[0].native_id(), 2);
    assert!(!descriptors[0].capturable());
    assert!(
        hit_test_windows(
            &descriptors,
            GlobalDipPoint::new(10.0, 10.0).unwrap(),
            WindowHitTestOptions::new(false, 16, ScreenshotLimits::default()),
        )
        .is_empty()
    );
}

#[test]
fn sharing_alpha_size_system_and_self_rules_fail_closed() {
    let normal_frame = rect(0.0, 0.0, 400.0, 300.0);
    let small_frame = rect(0.0, 0.0, 7.99, 8.0);
    let windows = vec![
        shareable(
            "window:sharing-none",
            1,
            101,
            "com.example",
            normal_frame,
            0,
        ),
        shareable("window:transparent", 2, 102, "com.example", normal_frame, 0),
        shareable("window:small", 3, 103, "com.example", small_frame, 0),
        shareable("window:system", 4, 104, "com.apple.dock", normal_frame, 0),
        shareable("window:self-pid", 5, 700, "com.example", normal_frame, 0),
        shareable(
            "window:self-bundle",
            6,
            106,
            "com.talex.touch",
            normal_frame,
            0,
        ),
        shareable("window:self-id", 7000, 107, "com.example", normal_frame, 0),
    ];
    let mut cg_windows = vec![
        CgWindowMetadata::new(
            1,
            101,
            normal_frame,
            0,
            1.0,
            WindowSharing::None,
            Some(true),
        )
        .unwrap(),
        CgWindowMetadata::new(
            2,
            102,
            normal_frame,
            0,
            0.01,
            WindowSharing::ReadOnly,
            Some(true),
        )
        .unwrap(),
        cg(3, 103, small_frame, 0),
    ];
    cg_windows.extend([
        cg(4, 104, normal_frame, 0),
        cg(5, 700, normal_frame, 0),
        cg(6, 106, normal_frame, 0),
        cg(7000, 107, normal_frame, 0),
    ]);

    let descriptors = build_window_descriptors(
        windows,
        cg_windows,
        &[display("display:main", normal_frame, 2)],
        &selection_policy(),
    );
    assert_eq!(descriptors.len(), 7);
    assert!(!descriptors[0].capturable());
    assert!(!descriptors[1].capturable());
    assert!(!descriptors[2].capturable());
    assert_eq!(descriptors[3].kind(), WindowKind::System);
    assert!(descriptors[4].is_self());
    assert!(descriptors[5].is_self());
    assert!(descriptors[6].is_self());

    let hits = hit_test_windows(
        &descriptors,
        GlobalDipPoint::new(10.0, 10.0).unwrap(),
        WindowHitTestOptions::new(false, 16, ScreenshotLimits::default()),
    );
    assert!(hits.is_empty());
    assert!(GlobalDipRect::new(0.0, 0.0, 0.0, 10.0).is_err());
}

#[test]
fn panels_are_opt_in_transients_are_excluded_and_candidates_are_truncated() {
    let frame = rect(0.0, 0.0, 400.0, 300.0);
    let windows = vec![
        shareable("window:normal-front", 1, 101, "com.example", frame, 0),
        shareable("window:panel", 2, 102, "com.example", frame, 3),
        shareable("window:transient", 3, 103, "com.example", frame, 101),
        shareable("window:normal-back", 4, 104, "com.example", frame, 0),
    ];
    let metadata = vec![
        cg(1, 101, frame, 0),
        cg(2, 102, frame, 3),
        cg(3, 103, frame, 101),
        cg(4, 104, frame, 0),
    ];
    let descriptors = build_window_descriptors(
        windows,
        metadata,
        &[display("display:main", frame, 1)],
        &selection_policy(),
    );
    assert_eq!(descriptors[0].kind(), WindowKind::Normal);
    assert_eq!(descriptors[1].kind(), WindowKind::Panel);
    assert_eq!(descriptors[2].kind(), WindowKind::Transient);

    let point = GlobalDipPoint::new(10.0, 10.0).unwrap();
    let default_hits = hit_test_windows(
        &descriptors,
        point,
        WindowHitTestOptions::new(false, 16, ScreenshotLimits::default()),
    );
    assert_eq!(
        default_hits
            .iter()
            .map(|window| window.native_id())
            .collect::<Vec<_>>(),
        vec![1, 4]
    );
    let panel_hits = hit_test_windows(
        &descriptors,
        point,
        WindowHitTestOptions::new(true, 2, ScreenshotLimits::default()),
    );
    assert_eq!(
        panel_hits
            .iter()
            .map(|window| window.native_id())
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
}

#[test]
fn cross_display_windows_report_all_coverage_and_maximum_scale() {
    let topology = fixture()
        .topologies
        .into_iter()
        .find(|topology| topology.name == "negative-left-mixed-scale")
        .unwrap();
    let window = topology.windows.into_iter().next().unwrap();
    let displays = topology
        .displays
        .into_iter()
        .map(|display| {
            RegionDisplay::new(
                DescriptorId::new(display.id).unwrap(),
                DisplayGeometry::from_mode(
                    display.global_frame,
                    display.mode_pixel_size,
                    display.rotation,
                )
                .unwrap(),
            )
        })
        .collect::<Vec<_>>();
    let descriptor = build_window_descriptors(
        vec![shareable(
            &window.id,
            window.native_id.parse().unwrap(),
            101,
            "com.example.cross-display",
            window.global_frame,
            0,
        )],
        vec![cg(
            window.native_id.parse().unwrap(),
            101,
            window.global_frame,
            0,
        )],
        &displays,
        &selection_policy(),
    )
    .into_iter()
    .next()
    .unwrap();

    assert_eq!(
        descriptor
            .covered_display_ids()
            .iter()
            .map(DescriptorId::as_str)
            .collect::<Vec<_>>(),
        window
            .expected_covered_display_ids
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
    );
    assert_eq!(
        descriptor.maximum_scale(),
        Some(window.expected_maximum_scale)
    );
}

/// #854: every constructor in window_candidates.rs used to build its own
/// `ScreenshotLimits::default()`, so a capability configured with anything else had
/// its window-selection limits silently replaced by the hardcoded ones. Both tests
/// below pick a limit that *differs* from the default in the direction that matters
/// -- with the default value they would pass against the old code too.
#[test]
fn hit_test_honours_a_candidate_ceiling_above_the_default() {
    let frame = rect(0.0, 0.0, 400.0, 300.0);
    let default_ceiling = ScreenshotLimits::default().max_window_candidates();
    let wanted = default_ceiling + 4;

    let windows = (0..wanted)
        .map(|index| {
            shareable(
                &format!("window:stack-{index}"),
                index as u32 + 1,
                101,
                "com.example",
                frame,
                0,
            )
        })
        .collect::<Vec<_>>();
    let metadata = (0..wanted)
        .map(|index| cg(index as u32 + 1, 101, frame, 0))
        .collect::<Vec<_>>();
    let descriptors = build_window_descriptors(
        windows,
        metadata,
        &[display("display:main", frame, 1)],
        &selection_policy(),
    );
    let point = GlobalDipPoint::new(10.0, 10.0).unwrap();

    let configured = ScreenshotLimits::default().with_window_candidates_for_test(wanted);
    let hits = hit_test_windows(
        &descriptors,
        point,
        WindowHitTestOptions::new(false, wanted, configured),
    );
    assert_eq!(hits.len(), wanted);

    // The default still clamps, so this is a ceiling being honoured rather than removed.
    let clamped = hit_test_windows(
        &descriptors,
        point,
        WindowHitTestOptions::new(false, wanted, ScreenshotLimits::default()),
    );
    assert_eq!(clamped.len(), default_ceiling);
}

#[test]
fn window_owner_honours_a_bundle_id_ceiling_below_the_default() {
    let bundle_id = "c".repeat(64);
    let configured = ScreenshotLimits::default().with_bundle_id_bytes_for_test(32);

    assert!(
        bundle_id.len() < ScreenshotLimits::default().max_bundle_id_bytes(),
        "the default must accept this id, or the test proves nothing"
    );
    assert!(
        WindowOwner::new(
            101,
            Some(bundle_id.clone()),
            Some("Shared Owner Name".to_string()),
            ScreenshotLimits::default(),
        )
        .is_ok()
    );
    assert!(
        WindowOwner::new(
            101,
            Some(bundle_id),
            Some("Shared Owner Name".to_string()),
            configured,
        )
        .is_err()
    );
}
