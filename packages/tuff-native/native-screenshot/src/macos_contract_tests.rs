use crate::backend::ScreenshotBackend;
use crate::backend::macos::system::{MacOsVersion, StaticCaptureApi, availability_for};
use crate::model::{
    CaptureFormat, CaptureInput, CaptureOutputOptions, CaptureOutputScale, CaptureTarget,
    CursorPolicy, FramePixelFormat, FramesInput, HitTestGranularity, HitTestInput, RefreshInput,
    SelfCaptureContext,
};
use tuff_native_core::CancellationToken;

#[test]
fn macos_availability_selects_only_supported_capture_paths() {
    let before_sck = availability_for(MacOsVersion::new(12, 2, 0));
    assert!(!before_sck.shareable_content);
    assert_eq!(before_sck.static_capture, StaticCaptureApi::Unsupported);
    assert!(!before_sck.direct_multi_display_region);

    for version in [MacOsVersion::new(12, 3, 0), MacOsVersion::new(13, 6, 0)] {
        let availability = availability_for(version);
        assert!(availability.shareable_content);
        assert_eq!(
            availability.static_capture,
            StaticCaptureApi::ShortLivedStream
        );
        assert!(!availability.direct_multi_display_region);
    }

    for version in [MacOsVersion::new(14, 0, 0), MacOsVersion::new(15, 1, 0)] {
        let availability = availability_for(version);
        assert!(availability.shareable_content);
        assert_eq!(
            availability.static_capture,
            StaticCaptureApi::ScreenshotManager
        );
        assert!(!availability.direct_multi_display_region);
    }

    let current_optimization = availability_for(MacOsVersion::new(15, 2, 0));
    assert_eq!(
        current_optimization.static_capture,
        StaticCaptureApi::ScreenshotManager
    );
    assert!(current_optimization.direct_multi_display_region);
}

#[test]
fn macos_version_ordering_includes_patch_component() {
    assert!(MacOsVersion::new(12, 3, 1) > MacOsVersion::new(12, 3, 0));
    assert!(MacOsVersion::new(13, 0, 0) > MacOsVersion::new(12, 99, 99));
}

#[test]
fn current_macos_version_and_non_prompting_probes_link() {
    let current = MacOsVersion::current().expect("current macOS version");
    assert!(current >= MacOsVersion::new(12, 0, 0));
    assert!(availability_for(current).shareable_content);
    let _permission = crate::backend::macos::system::permission_probe();
}

#[test]
fn macos_filter_wrappers_are_linked_without_starting_capture() {
    let _window = crate::backend::macos::system::desktop_independent_window_filter;
    let _display = crate::backend::macos::system::display_filter_excluding_windows;
    let _self_exclusion = crate::backend::macos::system::display_filter_excluding_applications;
}

#[test]
fn bgra_copy_removes_stride_padding_and_unpremultiplies() {
    let source = [
        10, 20, 30, 255, 0xaa, 0xbb, 0xcc, 0xdd, 25, 50, 100, 128, 0x11, 0x22, 0x33, 0x44,
    ];
    let rgba = crate::backend::macos::system::bgra_rows_to_rgba(&source, 1, 2, 8, 8)
        .expect("valid BGRA rows");
    assert_eq!(rgba, [30, 20, 10, 255, 199, 100, 50, 128]);
}

#[test]
fn bgra_copy_rejects_short_rows_and_output_budget() {
    let source = [0_u8; 8];
    assert!(crate::backend::macos::system::bgra_rows_to_rgba(&source, 2, 1, 7, 8).is_err());
    assert!(crate::backend::macos::system::bgra_rows_to_rgba(&source, 2, 1, 8, 7).is_err());
}

#[test]
fn real_macos_refresh_and_hit_test_smoke_when_enabled() {
    if std::env::var_os("TUFF_SCREENSHOT_MACOS_SMOKE").as_deref() != Some(std::ffi::OsStr::new("1"))
    {
        return;
    }
    let (content_sender, content_receiver) = std::sync::mpsc::sync_channel(1);
    crate::backend::macos::system::request_shareable_content(move |result| {
        let _ = content_sender.send(result);
    });
    let content = content_receiver
        .recv_timeout(std::time::Duration::from_secs(5))
        .expect("shareable content callback")
        .expect("shareable content result");
    let display_count = content.displays().expect("system displays").len();
    let _window_count = content.windows(false).expect("system windows").len();
    let _cg_window_count = content
        .cg_window_metadata()
        .expect("CG window metadata")
        .len();
    assert!(display_count > 0);

    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
    runtime.block_on(async {
        let backend = crate::backend::macos::implementation::MacBackend::new(
            crate::limits::ScreenshotLimits::default(),
        )
        .expect("mac backend");
        let snapshot = backend
            .refresh(
                RefreshInput {
                    include_window_titles: false,
                    self_context: SelfCaptureContext {
                        process_ids: vec![std::process::id()],
                        bundle_ids: Vec::new(),
                        native_window_ids: Vec::new(),
                    },
                },
                CancellationToken::new(),
            )
            .await
            .expect("shareable content refresh");
        assert!(!snapshot.displays.is_empty());
        let display = &snapshot.displays[0];
        let point = crate::model::GlobalDipPoint::new(
            display.global_frame.x() + 1.0,
            display.global_frame.y() + 1.0,
        )
        .expect("display point");
        let hit = backend
            .hit_test(
                HitTestInput {
                    generation: snapshot.generation.clone(),
                    point,
                    granularity: HitTestGranularity::Window,
                    include_panels: false,
                    max_candidates: 1,
                },
                CancellationToken::new(),
            )
            .await
            .expect("window hit test");
        assert_eq!(hit.generation, snapshot.generation);
        assert_eq!(hit.point, point);

        let display_capture = backend
            .capture(
                CaptureInput {
                    target: CaptureTarget::Display {
                        generation: snapshot.generation.clone(),
                        display_id: display.id.clone(),
                    },
                    cursor: CursorPolicy::Hidden,
                    include_self_window_id: None,
                    output: CaptureOutputOptions {
                        format: CaptureFormat::Png,
                        scale: CaptureOutputScale::NativeMax,
                    },
                },
                CancellationToken::new(),
            )
            .await
            .expect("display capture");
        assert!(display_capture.width > 0 && display_capture.height > 0);
        assert!(
            display_capture
                .png_bytes
                .starts_with(&[0x89, b'P', b'N', b'G'])
        );

        let region = crate::model::GlobalDipRect::new(
            display.global_frame.x() + 10.0,
            display.global_frame.y() + 10.0,
            display.global_frame.width().min(80.0),
            display.global_frame.height().min(60.0),
        )
        .expect("smoke region");
        let region_capture = backend
            .capture(
                CaptureInput {
                    target: CaptureTarget::Region {
                        generation: snapshot.generation.clone(),
                        rect: region,
                    },
                    cursor: CursorPolicy::Hidden,
                    include_self_window_id: None,
                    output: CaptureOutputOptions {
                        format: CaptureFormat::Png,
                        scale: CaptureOutputScale::NativeMax,
                    },
                },
                CancellationToken::new(),
            )
            .await
            .expect("region capture");
        assert!(region_capture.width > 0 && region_capture.height > 0);
        assert!(
            region_capture
                .png_bytes
                .starts_with(&[0x89, b'P', b'N', b'G'])
        );

        let frame_source = backend
            .frames(
                FramesInput {
                    target: CaptureTarget::Display {
                        generation: snapshot.generation.clone(),
                        display_id: display.id.clone(),
                    },
                    cursor: CursorPolicy::Hidden,
                    include_self_window_id: None,
                    frames_per_second: 5,
                    pixel_format: FramePixelFormat::Bgra8Premultiplied,
                    max_frame_bytes: 64 * 1024 * 1024,
                },
                CancellationToken::new(),
            )
            .await
            .expect("display frame source");
        let frame = frame_source
            .next_frame(CancellationToken::new())
            .await
            .expect("frame result")
            .expect("first complete frame");
        assert_eq!(frame.stride, frame.width * 4);
        assert_eq!(
            frame.bgra_bytes.len(),
            usize::try_from(frame.stride).expect("stride")
                * usize::try_from(frame.height).expect("height")
        );
        frame_source.request_stop();
        frame_source.stop().await.expect("frame source stop");
    });
}
