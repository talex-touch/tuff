use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScreenshotLimits {
    max_displays: usize,
    max_shareable_windows: usize,
    max_window_candidates: usize,
    max_ax_elements: usize,
    ax_call_timeout_ms: u64,
    max_static_output_pixels: u64,
    max_static_working_set_bytes: u64,
    max_attachment_part_bytes: u64,
    max_packet_attachment_bytes: u64,
    default_stream_frame_bytes: u64,
    max_stream_frame_bytes: u64,
    min_frame_rate: u32,
    max_frame_rate: u32,
    min_native_queue_depth: u32,
    max_native_queue_depth: u32,
    max_title_scalars: usize,
    max_application_name_bytes: usize,
    max_bundle_id_bytes: usize,
    max_self_process_ids: u32,
    max_self_bundle_ids: usize,
    max_self_window_ids: usize,
    min_output_scale: f64,
    max_output_scale: f64,
}

impl ScreenshotLimits {
    pub const fn max_displays(self) -> usize {
        self.max_displays
    }

    pub const fn max_shareable_windows(self) -> usize {
        self.max_shareable_windows
    }

    pub const fn max_window_candidates(self) -> usize {
        self.max_window_candidates
    }

    pub const fn max_ax_elements(self) -> usize {
        self.max_ax_elements
    }

    pub const fn ax_call_timeout_ms(self) -> u64 {
        self.ax_call_timeout_ms
    }

    pub const fn max_static_output_pixels(self) -> u64 {
        self.max_static_output_pixels
    }

    pub const fn max_static_working_set_bytes(self) -> u64 {
        self.max_static_working_set_bytes
    }

    pub const fn max_attachment_part_bytes(self) -> u64 {
        self.max_attachment_part_bytes
    }

    pub const fn max_packet_attachment_bytes(self) -> u64 {
        self.max_packet_attachment_bytes
    }

    pub const fn default_stream_frame_bytes(self) -> u64 {
        self.default_stream_frame_bytes
    }

    pub const fn max_stream_frame_bytes(self) -> u64 {
        self.max_stream_frame_bytes
    }

    pub const fn min_frame_rate(self) -> u32 {
        self.min_frame_rate
    }

    pub const fn max_frame_rate(self) -> u32 {
        self.max_frame_rate
    }

    pub const fn min_native_queue_depth(self) -> u32 {
        self.min_native_queue_depth
    }

    pub const fn max_native_queue_depth(self) -> u32 {
        self.max_native_queue_depth
    }

    pub const fn max_title_scalars(self) -> usize {
        self.max_title_scalars
    }

    pub const fn max_application_name_bytes(self) -> usize {
        self.max_application_name_bytes
    }

    pub const fn max_bundle_id_bytes(self) -> usize {
        self.max_bundle_id_bytes
    }

    pub const fn max_self_process_ids(self) -> u32 {
        self.max_self_process_ids
    }

    pub const fn max_self_bundle_ids(self) -> usize {
        self.max_self_bundle_ids
    }

    pub const fn max_self_window_ids(self) -> usize {
        self.max_self_window_ids
    }

    pub const fn min_output_scale(self) -> f64 {
        self.min_output_scale
    }

    pub const fn max_output_scale(self) -> f64 {
        self.max_output_scale
    }
    #[cfg(test)]
    pub(crate) fn with_attachment_part_bytes_for_test(mut self, max_bytes: u64) -> Self {
        assert!(max_bytes > 0 && max_bytes <= self.max_packet_attachment_bytes);
        self.max_attachment_part_bytes = max_bytes;
        self
    }

    pub fn public(self) -> ScreenshotLimitsPublic {
        ScreenshotLimitsPublic {
            max_displays: self.max_displays,
            max_shareable_windows: self.max_shareable_windows,
            max_window_candidates: self.max_window_candidates,
            max_ax_elements: self.max_ax_elements,
            ax_call_timeout_ms: self.ax_call_timeout_ms,
            max_static_output_pixels: self.max_static_output_pixels,
            max_static_working_set_bytes: self.max_static_working_set_bytes,
            max_attachment_part_bytes: self.max_attachment_part_bytes,
            max_packet_attachment_bytes: self.max_packet_attachment_bytes,
            default_stream_frame_bytes: self.default_stream_frame_bytes,
            max_stream_frame_bytes: self.max_stream_frame_bytes,
            min_frame_rate: self.min_frame_rate,
            max_frame_rate: self.max_frame_rate,
            min_native_queue_depth: self.min_native_queue_depth,
            max_native_queue_depth: self.max_native_queue_depth,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotLimitsPublic {
    pub max_displays: usize,
    pub max_shareable_windows: usize,
    pub max_window_candidates: usize,
    pub max_ax_elements: usize,
    pub ax_call_timeout_ms: u64,
    pub max_static_output_pixels: u64,
    pub max_static_working_set_bytes: u64,
    pub max_attachment_part_bytes: u64,
    pub max_packet_attachment_bytes: u64,
    pub default_stream_frame_bytes: u64,
    pub max_stream_frame_bytes: u64,
    pub min_frame_rate: u32,
    pub max_frame_rate: u32,
    pub min_native_queue_depth: u32,
    pub max_native_queue_depth: u32,
}

impl Default for ScreenshotLimits {
    fn default() -> Self {
        Self {
            max_displays: 32,
            max_shareable_windows: 2_048,
            max_window_candidates: 16,
            max_ax_elements: 512,
            ax_call_timeout_ms: 200,
            max_static_output_pixels: 64_000_000,
            max_static_working_set_bytes: 512 * 1024 * 1024,
            max_attachment_part_bytes: 32 * 1024 * 1024,
            max_packet_attachment_bytes: tuff_native_core::MAX_PACKET_ATTACHMENT_BYTES,
            default_stream_frame_bytes: 32 * 1024 * 1024,
            max_stream_frame_bytes: 64 * 1024 * 1024,
            min_frame_rate: 1,
            max_frame_rate: 30,
            min_native_queue_depth: 3,
            max_native_queue_depth: 8,
            max_title_scalars: 512,
            max_application_name_bytes: 256,
            max_bundle_id_bytes: 512,
            max_self_process_ids: 32,
            max_self_bundle_ids: 32,
            max_self_window_ids: 128,
            min_output_scale: 0.25,
            max_output_scale: 4.0,
        }
    }
}
