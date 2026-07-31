use std::collections::{HashMap, HashSet};
use std::io::Cursor;

use image::{DynamicImage, ImageFormat, Rgba, RgbaImage, imageops};
use serde::Deserialize;
use serde_json::Value;
use tuff_native_core::{InputAttachment, ProtocolError};

use crate::error::ScreenshotError;
use crate::limits::ScreenshotLimits;
use crate::model::{AxisScale, GlobalDipRect, PixelSize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComposeInput {
    generation: String,
    rect: GlobalDipRect,
    sources: Vec<ComposeSource>,
    #[serde(default)]
    effects: ComposeEffects,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComposeSource {
    global_rect: GlobalDipRect,
    image_parts: Vec<ComposePart>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComposePart {
    attachment_id: String,
    offset: u64,
    byte_length: u64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComposeEffects {
    #[serde(default)]
    border: bool,
    #[serde(default)]
    shadow: bool,
    #[serde(default)]
    corner_radius: f64,
}

#[derive(Debug)]
pub struct ComposedCapture {
    pub generation: String,
    pub global_rect: GlobalDipRect,
    pub output_scale: AxisScale,
    pub width: u32,
    pub height: u32,
    pub png_bytes: Vec<u8>,
}

pub fn compose_region(
    payload: Value,
    attachments: Vec<InputAttachment>,
    limits: ScreenshotLimits,
) -> Result<ComposedCapture, ProtocolError> {
    let input: ComposeInput = serde_json::from_value(payload)
        .map_err(|_| ScreenshotError::InvalidRegion.to_protocol_error())?;
    if !input.effects.corner_radius.is_finite()
        || input.effects.corner_radius < 0.0
        || input.effects.corner_radius > 128.0
    {
        return Err(ScreenshotError::InvalidRegion.to_protocol_error());
    }
    if input.generation.is_empty()
        || input.generation.len() > 128
        || input.sources.is_empty()
        || input.sources.len() > limits.max_displays()
        || attachments.is_empty()
    {
        return Err(ScreenshotError::InvalidRegion.to_protocol_error());
    }

    let attachment_map: HashMap<&str, &InputAttachment> = attachments
        .iter()
        .map(|attachment| (attachment.descriptor.id.as_str(), attachment))
        .collect();
    let mut used_attachments = HashSet::new();
    let mut decoded_sources = Vec::with_capacity(input.sources.len());
    let mut output_scale = AxisScale::new(limits.min_output_scale(), limits.min_output_scale())
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;

    for source in input.sources {
        let Some(intersection) = source.global_rect.intersection(input.rect) else {
            continue;
        };
        let png_bytes = assemble_source(
            &source.image_parts,
            &attachment_map,
            &mut used_attachments,
            limits,
        )?;
        let image = image::load_from_memory_with_format(&png_bytes, ImageFormat::Png)
            .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?
            .into_rgba8();
        let source_scale = AxisScale::new(
            f64::from(image.width()) / source.global_rect.width(),
            f64::from(image.height()) / source.global_rect.height(),
        )
        .map_err(|_| ScreenshotError::InvalidRegion.to_protocol_error())?;
        output_scale = output_scale.maximum(source_scale);
        decoded_sources.push((source.global_rect, intersection, source_scale, image));
    }

    if decoded_sources.is_empty() || used_attachments.len() != attachments.len() {
        return Err(ScreenshotError::InvalidRegion.to_protocol_error());
    }
    let output_size = PixelSize::new(
        scaled_edge(input.rect.width(), output_scale.x())?,
        scaled_edge(input.rect.height(), output_scale.y())?,
    )
    .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?;
    if output_size
        .pixel_count()
        .map_err(|_| ScreenshotError::OutputTooLarge.to_protocol_error())?
        > limits.max_static_output_pixels()
    {
        return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
    }

    let mut canvas = RgbaImage::new(output_size.width(), output_size.height());
    for (source_rect, intersection, source_scale, source_image) in decoded_sources {
        let source_left = scaled_offset(intersection.x() - source_rect.x(), source_scale.x())?;
        let source_top = scaled_offset(intersection.y() - source_rect.y(), source_scale.y())?;
        let source_right = scaled_offset(intersection.right() - source_rect.x(), source_scale.x())?;
        let source_bottom =
            scaled_offset(intersection.bottom() - source_rect.y(), source_scale.y())?;
        let source_width = source_right.saturating_sub(source_left);
        let source_height = source_bottom.saturating_sub(source_top);
        if source_width == 0 || source_height == 0 {
            continue;
        }
        let cropped = imageops::crop_imm(
            &source_image,
            source_left,
            source_top,
            source_width,
            source_height,
        )
        .to_image();

        let destination_left = scaled_offset(intersection.x() - input.rect.x(), output_scale.x())?;
        let destination_top = scaled_offset(intersection.y() - input.rect.y(), output_scale.y())?;
        let destination_right =
            scaled_offset(intersection.right() - input.rect.x(), output_scale.x())?;
        let destination_bottom =
            scaled_offset(intersection.bottom() - input.rect.y(), output_scale.y())?;
        let destination_width = destination_right.saturating_sub(destination_left);
        let destination_height = destination_bottom.saturating_sub(destination_top);
        if destination_width == 0 || destination_height == 0 {
            continue;
        }
        let rendered =
            if cropped.width() == destination_width && cropped.height() == destination_height {
                cropped
            } else {
                imageops::resize(
                    &cropped,
                    destination_width,
                    destination_height,
                    imageops::FilterType::Lanczos3,
                )
            };
        imageops::replace(
            &mut canvas,
            &rendered,
            i64::from(destination_left),
            i64::from(destination_top),
        );
    }

    apply_effects(&mut canvas, &input.effects, output_scale);
    let mut png_bytes = Vec::new();
    DynamicImage::ImageRgba8(canvas)
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|_| ScreenshotError::BackendFailed.to_protocol_error())?;
    Ok(ComposedCapture {
        generation: input.generation,
        global_rect: input.rect,
        output_scale,
        width: output_size.width(),
        height: output_size.height(),
        png_bytes,
    })
}

fn assemble_source(
    parts: &[ComposePart],
    attachment_map: &HashMap<&str, &InputAttachment>,
    used_attachments: &mut HashSet<String>,
    limits: ScreenshotLimits,
) -> Result<Vec<u8>, ProtocolError> {
    if parts.is_empty() || parts.len() > tuff_native_core::MAX_ATTACHMENT_COUNT {
        return Err(ScreenshotError::InvalidRegion.to_protocol_error());
    }
    let mut bytes = Vec::new();
    let mut expected_offset = 0_u64;
    for part in parts {
        if part.offset != expected_offset || part.byte_length == 0 {
            return Err(ScreenshotError::InvalidRegion.to_protocol_error());
        }
        let attachment = attachment_map
            .get(part.attachment_id.as_str())
            .ok_or_else(|| ScreenshotError::InvalidRegion.to_protocol_error())?;
        if !used_attachments.insert(part.attachment_id.clone())
            || attachment.descriptor.media_type.as_deref() != Some("image/png")
            || u64::try_from(attachment.data.len()).ok() != Some(part.byte_length)
        {
            return Err(ScreenshotError::InvalidRegion.to_protocol_error());
        }
        expected_offset = expected_offset
            .checked_add(part.byte_length)
            .ok_or_else(|| ScreenshotError::OutputTooLarge.to_protocol_error())?;
        if expected_offset > limits.max_packet_attachment_bytes() {
            return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
        }
        bytes.extend_from_slice(&attachment.data);
    }
    Ok(bytes)
}

fn scaled_edge(points: f64, scale: f64) -> Result<u32, ProtocolError> {
    checked_pixel((points * scale).ceil())
}

fn scaled_offset(points: f64, scale: f64) -> Result<u32, ProtocolError> {
    checked_pixel((points * scale).round())
}

fn checked_pixel(value: f64) -> Result<u32, ProtocolError> {
    if !value.is_finite() || value < 0.0 || value > f64::from(u32::MAX) {
        return Err(ScreenshotError::OutputTooLarge.to_protocol_error());
    }
    Ok(value as u32)
}

fn apply_effects(canvas: &mut RgbaImage, effects: &ComposeEffects, scale: AxisScale) {
    let thickness = scale.x().max(scale.y()).ceil().max(1.0) as u32;
    if effects.shadow {
        let depth = thickness
            .saturating_mul(3)
            .min(canvas.width().min(canvas.height()) / 3);
        for inset in 0..depth {
            let alpha = ((depth - inset) * 18 / depth.max(1)).min(18) as u8;
            draw_inset(canvas, inset, Rgba([0, 0, 0, alpha]));
        }
    }
    if effects.border {
        for inset in 0..thickness.min(canvas.width().min(canvas.height()) / 2 + 1) {
            draw_inset(canvas, inset, Rgba([45, 212, 191, 255]));
        }
    }
    if effects.corner_radius > 0.0 {
        apply_corner_radius(
            canvas,
            (effects.corner_radius * scale.x().max(scale.y())).round() as u32,
        );
    }
}

fn apply_corner_radius(canvas: &mut RgbaImage, radius: u32) {
    let radius = radius.min(canvas.width().min(canvas.height()) / 2);
    if radius == 0 {
        return;
    }
    let radius_f = f64::from(radius);
    for y in 0..radius {
        for x in 0..radius {
            let dx = radius_f - (f64::from(x) + 0.5);
            let dy = radius_f - (f64::from(y) + 0.5);
            if dx * dx + dy * dy <= radius_f * radius_f {
                continue;
            }
            let right = canvas.width() - x - 1;
            let bottom = canvas.height() - y - 1;
            canvas.get_pixel_mut(x, y)[3] = 0;
            canvas.get_pixel_mut(right, y)[3] = 0;
            canvas.get_pixel_mut(x, bottom)[3] = 0;
            canvas.get_pixel_mut(right, bottom)[3] = 0;
        }
    }
}

fn draw_inset(canvas: &mut RgbaImage, inset: u32, color: Rgba<u8>) {
    if canvas.width() <= inset.saturating_mul(2) || canvas.height() <= inset.saturating_mul(2) {
        return;
    }
    let right = canvas.width() - inset - 1;
    let bottom = canvas.height() - inset - 1;
    for x in inset..=right {
        blend_pixel(canvas.get_pixel_mut(x, inset), color);
        blend_pixel(canvas.get_pixel_mut(x, bottom), color);
    }
    for y in inset..=bottom {
        blend_pixel(canvas.get_pixel_mut(inset, y), color);
        blend_pixel(canvas.get_pixel_mut(right, y), color);
    }
}

fn blend_pixel(destination: &mut Rgba<u8>, source: Rgba<u8>) {
    let alpha = u16::from(source[3]);
    let inverse = 255_u16.saturating_sub(alpha);
    for channel in 0..3 {
        destination[channel] = ((u16::from(source[channel]) * alpha
            + u16::from(destination[channel]) * inverse)
            / 255) as u8;
    }
    destination[3] = destination[3].max(source[3]);
}

#[cfg(test)]
mod tests {
    use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
    use serde_json::json;
    use tuff_native_core::{AttachmentDescriptor, InputAttachment};

    use super::compose_region;
    use crate::limits::ScreenshotLimits;

    fn png(color: [u8; 4], width: u32, height: u32) -> Vec<u8> {
        let image = RgbaImage::from_pixel(width, height, Rgba(color));
        let mut bytes = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn attachment(id: &str, data: Vec<u8>) -> InputAttachment {
        InputAttachment {
            descriptor: AttachmentDescriptor {
                id: id.to_string(),
                index: 0,
                byte_length: data.len() as u64,
                media_type: Some("image/png".to_string()),
                purpose: Some("frozen-display".to_string()),
            },
            data,
        }
    }

    #[test]
    fn composes_negative_origin_displays_at_native_max_scale() {
        let left = attachment("source:0", png([255, 0, 0, 255], 2, 2));
        let right = attachment("source:1", png([0, 0, 255, 255], 2, 2));
        let result = compose_region(
            json!({
                "generation": "generation:test",
                "rect": { "x": -1.0, "y": 0.0, "width": 2.0, "height": 1.0 },
                "sources": [
                    {
                        "globalRect": { "x": -1.0, "y": 0.0, "width": 1.0, "height": 1.0 },
                        "imageParts": [{ "attachmentId": "source:0", "offset": 0, "byteLength": left.data.len() }]
                    },
                    {
                        "globalRect": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
                        "imageParts": [{ "attachmentId": "source:1", "offset": 0, "byteLength": right.data.len() }]
                    }
                ]
            }),
            vec![left, right],
            ScreenshotLimits::default(),
        )
        .unwrap();
        assert_eq!((result.width, result.height), (4, 2));
        let image = image::load_from_memory(&result.png_bytes)
            .unwrap()
            .into_rgba8();
        assert_eq!(image.get_pixel(0, 0).0, [255, 0, 0, 255]);
        assert_eq!(image.get_pixel(3, 0).0, [0, 0, 255, 255]);
    }

    #[test]
    fn keeps_uncovered_regions_transparent() {
        let source = attachment("source:0", png([10, 20, 30, 255], 1, 1));
        let result = compose_region(
            json!({
                "generation": "generation:test",
                "rect": { "x": 0.0, "y": 0.0, "width": 2.0, "height": 1.0 },
                "sources": [{
                    "globalRect": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
                    "imageParts": [{ "attachmentId": "source:0", "offset": 0, "byteLength": source.data.len() }]
                }]
            }),
            vec![source],
            ScreenshotLimits::default(),
        )
        .unwrap();
        let image = image::load_from_memory(&result.png_bytes)
            .unwrap()
            .into_rgba8();
        assert_eq!(image.get_pixel(1, 0).0, [0, 0, 0, 0]);
    }

    #[test]
    fn rejects_non_contiguous_or_reused_attachment_parts() {
        let source = attachment("source:0", png([10, 20, 30, 255], 1, 1));
        let error = compose_region(
            json!({
                "generation": "generation:test",
                "rect": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
                "sources": [{
                    "globalRect": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
                    "imageParts": [{ "attachmentId": "source:0", "offset": 1, "byteLength": source.data.len() }]
                }]
            }),
            vec![source],
            ScreenshotLimits::default(),
        )
        .unwrap_err();
        assert_eq!(error.code, "SCREENSHOT_INVALID_REGION");
    }
}
