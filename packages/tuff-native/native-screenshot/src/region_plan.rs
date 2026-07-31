use crate::geometry::{DisplayGeometry, nearest_to_u32};
use crate::limits::ScreenshotLimits;
use crate::model::{
    AxisScale, DescriptorId, DisplayLocalPixelRect, DisplayLocalPointRect, GeometryError,
    GlobalDipRect, OutputPixelRect, PixelSize,
};

const BYTES_PER_PIXEL: u64 = 4;

#[derive(Debug, Clone, PartialEq)]
pub struct RegionDisplay {
    id: DescriptorId,
    geometry: DisplayGeometry,
}

impl RegionDisplay {
    pub const fn new(id: DescriptorId, geometry: DisplayGeometry) -> Self {
        Self { id, geometry }
    }

    pub const fn id(&self) -> &DescriptorId {
        &self.id
    }

    pub const fn geometry(&self) -> &DisplayGeometry {
        &self.geometry
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RegionOutputScale {
    NativeMax,
    Explicit(f64),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RegionPlanLimits {
    max_output_pixels: u64,
    max_working_set_bytes: u64,
}

impl RegionPlanLimits {
    pub fn new(max_output_pixels: u64, max_working_set_bytes: u64) -> Result<Self, GeometryError> {
        if max_output_pixels == 0 || max_working_set_bytes == 0 {
            return Err(GeometryError::new("region plan limits must be positive"));
        }
        Ok(Self {
            max_output_pixels,
            max_working_set_bytes,
        })
    }
}

impl Default for RegionPlanLimits {
    fn default() -> Self {
        let limits = ScreenshotLimits::default();
        Self {
            max_output_pixels: limits.max_static_output_pixels(),
            max_working_set_bytes: limits.max_static_working_set_bytes(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RegionPlanSegment {
    display: RegionDisplay,
    global_rect: GlobalDipRect,
    source_points: DisplayLocalPointRect,
    source_pixels: DisplayLocalPixelRect,
    destination: OutputPixelRect,
}

impl RegionPlanSegment {
    pub const fn display_id(&self) -> &DescriptorId {
        self.display.id()
    }

    pub const fn display_geometry(&self) -> &DisplayGeometry {
        self.display.geometry()
    }

    pub const fn global_rect(&self) -> GlobalDipRect {
        self.global_rect
    }

    pub const fn source_points(&self) -> DisplayLocalPointRect {
        self.source_points
    }

    pub const fn source_pixels(&self) -> DisplayLocalPixelRect {
        self.source_pixels
    }

    pub const fn destination(&self) -> OutputPixelRect {
        self.destination
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RegionPlan {
    global_rect: GlobalDipRect,
    output_scale: AxisScale,
    output_size: PixelSize,
    segments: Vec<RegionPlanSegment>,
    estimated_working_set_bytes: u64,
    has_transparent_holes: bool,
}

impl RegionPlan {
    pub fn build(
        global_rect: GlobalDipRect,
        mut displays: Vec<RegionDisplay>,
        requested_scale: RegionOutputScale,
        limits: RegionPlanLimits,
    ) -> Result<Self, GeometryError> {
        displays.sort_by(|left, right| left.id().as_str().cmp(right.id().as_str()));
        let intersections = displays
            .into_iter()
            .filter_map(|display| {
                display
                    .geometry()
                    .global_frame()
                    .intersection(global_rect)
                    .map(|intersection| (display, intersection))
            })
            .collect::<Vec<_>>();
        if intersections.is_empty() {
            return Err(GeometryError::new("region does not intersect a display"));
        }

        let output_scale = resolve_output_scale(&intersections, requested_scale)?;
        let output_size = PixelSize::new(
            nearest_to_u32(global_rect.width() * output_scale.x())?,
            nearest_to_u32(global_rect.height() * output_scale.y())?,
        )?;
        let output_pixels = output_size.pixel_count()?;
        if output_pixels > limits.max_output_pixels {
            return Err(GeometryError::new("region output exceeds pixel budget"));
        }

        let mut segments = Vec::with_capacity(intersections.len());
        for (display, intersection) in intersections {
            let source_points = display.geometry().global_to_local_points(intersection)?;
            let source_pixels = display.geometry().local_points_to_pixels(source_points)?;
            let destination = output_destination(global_rect, intersection, output_scale)?;
            if destination.right() > output_size.width()
                || destination.bottom() > output_size.height()
            {
                return Err(GeometryError::new(
                    "region destination is outside output bounds",
                ));
            }
            segments.push(RegionPlanSegment {
                display,
                global_rect: intersection,
                source_points,
                source_pixels,
                destination,
            });
        }

        let estimated_working_set_bytes = estimate_working_set(output_size, &segments)?;
        if estimated_working_set_bytes > limits.max_working_set_bytes {
            return Err(GeometryError::new(
                "region output exceeds working-set budget",
            ));
        }
        let covered_pixels = union_area(
            &segments
                .iter()
                .map(RegionPlanSegment::destination)
                .collect::<Vec<_>>(),
        )?;

        Ok(Self {
            global_rect,
            output_scale,
            output_size,
            segments,
            estimated_working_set_bytes,
            has_transparent_holes: covered_pixels < output_pixels,
        })
    }

    pub const fn global_rect(&self) -> GlobalDipRect {
        self.global_rect
    }

    pub const fn output_scale(&self) -> AxisScale {
        self.output_scale
    }

    pub const fn output_size(&self) -> PixelSize {
        self.output_size
    }

    pub fn segments(&self) -> &[RegionPlanSegment] {
        &self.segments
    }

    pub const fn estimated_working_set_bytes(&self) -> u64 {
        self.estimated_working_set_bytes
    }

    pub const fn has_transparent_holes(&self) -> bool {
        self.has_transparent_holes
    }
}

fn resolve_output_scale(
    intersections: &[(RegionDisplay, GlobalDipRect)],
    requested_scale: RegionOutputScale,
) -> Result<AxisScale, GeometryError> {
    match requested_scale {
        RegionOutputScale::NativeMax => {
            let mut scale = intersections[0].0.geometry().scale();
            for (display, _) in &intersections[1..] {
                scale = scale.maximum(display.geometry().scale());
            }
            Ok(scale)
        }
        RegionOutputScale::Explicit(scale) => {
            let limits = ScreenshotLimits::default();
            if scale < limits.min_output_scale() {
                return Err(GeometryError::new(
                    "explicit output scale must be in [0.25, 4]",
                ));
            }
            AxisScale::new(scale, scale)
                .map_err(|_| GeometryError::new("explicit output scale must be in [0.25, 4]"))
        }
    }
}

fn output_destination(
    request: GlobalDipRect,
    intersection: GlobalDipRect,
    scale: AxisScale,
) -> Result<OutputPixelRect, GeometryError> {
    let left = nearest_to_u32((intersection.x() - request.x()) * scale.x())?;
    let top = nearest_to_u32((intersection.y() - request.y()) * scale.y())?;
    let right = nearest_to_u32((intersection.right() - request.x()) * scale.x())?;
    let bottom = nearest_to_u32((intersection.bottom() - request.y()) * scale.y())?;
    OutputPixelRect::new(
        left,
        top,
        right
            .checked_sub(left)
            .ok_or_else(|| GeometryError::new("output horizontal bounds overflow"))?,
        bottom
            .checked_sub(top)
            .ok_or_else(|| GeometryError::new("output vertical bounds overflow"))?,
    )
}

fn estimate_working_set(
    output_size: PixelSize,
    segments: &[RegionPlanSegment],
) -> Result<u64, GeometryError> {
    let output_bytes = checked_pixel_bytes(output_size.pixel_count()?)?;
    let mut total = output_bytes
        .checked_mul(2)
        .ok_or_else(|| GeometryError::new("working-set estimate overflow"))?;
    for segment in segments {
        let source_pixels = u64::from(segment.source_pixels().width())
            .checked_mul(u64::from(segment.source_pixels().height()))
            .ok_or_else(|| GeometryError::new("source pixel count overflow"))?;
        let destination_pixels = u64::from(segment.destination().width())
            .checked_mul(u64::from(segment.destination().height()))
            .ok_or_else(|| GeometryError::new("destination pixel count overflow"))?;
        let source_bytes = checked_pixel_bytes(source_pixels)?;
        let destination_bytes = checked_pixel_bytes(destination_pixels)?;
        total = total
            .checked_add(source_bytes)
            .and_then(|value| value.checked_add(destination_bytes))
            .ok_or_else(|| GeometryError::new("working-set estimate overflow"))?;
    }
    Ok(total)
}

fn checked_pixel_bytes(pixel_count: u64) -> Result<u64, GeometryError> {
    pixel_count
        .checked_mul(BYTES_PER_PIXEL)
        .ok_or_else(|| GeometryError::new("pixel byte count overflow"))
}

fn union_area(rectangles: &[OutputPixelRect]) -> Result<u64, GeometryError> {
    let mut x_edges = rectangles
        .iter()
        .flat_map(|rect| [rect.x(), rect.right()])
        .collect::<Vec<_>>();
    x_edges.sort_unstable();
    x_edges.dedup();

    let mut area = 0_u64;
    for x_pair in x_edges.windows(2) {
        let left = x_pair[0];
        let right = x_pair[1];
        if left == right {
            continue;
        }
        let mut intervals = rectangles
            .iter()
            .filter(|rect| rect.x() < right && rect.right() > left)
            .map(|rect| (rect.y(), rect.bottom()))
            .collect::<Vec<_>>();
        intervals.sort_unstable();

        let mut covered_height = 0_u64;
        let mut current: Option<(u32, u32)> = None;
        for (top, bottom) in intervals {
            current = match current {
                None => Some((top, bottom)),
                Some((current_top, current_bottom)) if top <= current_bottom => {
                    Some((current_top, current_bottom.max(bottom)))
                }
                Some((current_top, current_bottom)) => {
                    covered_height = covered_height
                        .checked_add(u64::from(current_bottom - current_top))
                        .ok_or_else(|| GeometryError::new("covered area overflow"))?;
                    Some((top, bottom))
                }
            };
        }
        if let Some((top, bottom)) = current {
            covered_height = covered_height
                .checked_add(u64::from(bottom - top))
                .ok_or_else(|| GeometryError::new("covered area overflow"))?;
        }
        area = area
            .checked_add(
                u64::from(right - left)
                    .checked_mul(covered_height)
                    .ok_or_else(|| GeometryError::new("covered area overflow"))?,
            )
            .ok_or_else(|| GeometryError::new("covered area overflow"))?;
    }
    Ok(area)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AttachmentChunkLimits {
    max_part_bytes: u64,
    max_parts: usize,
    max_packet_bytes: u64,
}

impl AttachmentChunkLimits {
    pub fn new(
        max_part_bytes: u64,
        max_parts: usize,
        max_packet_bytes: u64,
    ) -> Result<Self, GeometryError> {
        if max_part_bytes == 0
            || max_parts == 0
            || max_packet_bytes == 0
            || max_part_bytes > max_packet_bytes
        {
            return Err(GeometryError::new("attachment chunk limits are invalid"));
        }
        Ok(Self {
            max_part_bytes,
            max_parts,
            max_packet_bytes,
        })
    }

    pub fn protocol_defaults() -> Self {
        let limits = ScreenshotLimits::default();
        Self {
            max_part_bytes: limits.max_attachment_part_bytes(),
            max_parts: tuff_native_core::MAX_ATTACHMENT_COUNT,
            max_packet_bytes: limits.max_packet_attachment_bytes(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AttachmentChunk {
    offset: u64,
    byte_length: u64,
}

impl AttachmentChunk {
    pub fn new(offset: u64, byte_length: u64) -> Result<Self, GeometryError> {
        if byte_length == 0 || offset.checked_add(byte_length).is_none() {
            return Err(GeometryError::new("attachment chunk bounds are invalid"));
        }
        Ok(Self {
            offset,
            byte_length,
        })
    }

    pub const fn offset(self) -> u64 {
        self.offset
    }

    pub const fn byte_length(self) -> u64 {
        self.byte_length
    }
}

pub fn plan_attachment_chunks(
    total_bytes: u64,
    limits: AttachmentChunkLimits,
) -> Result<Vec<AttachmentChunk>, GeometryError> {
    if total_bytes == 0 || total_bytes > limits.max_packet_bytes {
        return Err(GeometryError::new(
            "attachment output exceeds packet budget",
        ));
    }
    let part_count = total_bytes
        .checked_add(limits.max_part_bytes - 1)
        .ok_or_else(|| GeometryError::new("attachment part count overflow"))?
        / limits.max_part_bytes;
    let part_count = usize::try_from(part_count)
        .map_err(|_| GeometryError::new("attachment part count overflow"))?;
    if part_count > limits.max_parts {
        return Err(GeometryError::new(
            "attachment output exceeds part count budget",
        ));
    }

    let mut chunks = Vec::with_capacity(part_count);
    let mut offset = 0_u64;
    while offset < total_bytes {
        let byte_length = limits.max_part_bytes.min(total_bytes - offset);
        chunks.push(AttachmentChunk::new(offset, byte_length)?);
        offset = offset
            .checked_add(byte_length)
            .ok_or_else(|| GeometryError::new("attachment chunk bounds overflow"))?;
    }
    Ok(chunks)
}

pub fn validate_attachment_chunks(
    total_bytes: u64,
    chunks: &[AttachmentChunk],
    limits: AttachmentChunkLimits,
) -> Result<(), GeometryError> {
    if total_bytes == 0
        || total_bytes > limits.max_packet_bytes
        || chunks.is_empty()
        || chunks.len() > limits.max_parts
    {
        return Err(GeometryError::new("attachment chunk set is invalid"));
    }
    let mut expected_offset = 0_u64;
    for chunk in chunks {
        if chunk.offset != expected_offset || chunk.byte_length > limits.max_part_bytes {
            return Err(GeometryError::new("attachment chunks are not contiguous"));
        }
        expected_offset = expected_offset
            .checked_add(chunk.byte_length)
            .ok_or_else(|| GeometryError::new("attachment chunk bounds overflow"))?;
    }
    if expected_offset != total_bytes {
        return Err(GeometryError::new("attachment chunks do not match output"));
    }
    Ok(())
}
