use crate::model::{
    AxisScale, DisplayLocalPixelRect, DisplayLocalPointRect, GeometryError, GlobalDipPoint,
    GlobalDipRect, PixelSize, Rotation,
};

#[derive(Debug, Clone, PartialEq)]
pub struct DisplayGeometry {
    global_frame: GlobalDipRect,
    oriented_pixel_size: PixelSize,
    scale: AxisScale,
    rotation: Rotation,
}

impl DisplayGeometry {
    pub fn from_mode(
        global_frame: GlobalDipRect,
        mode_pixel_size: PixelSize,
        rotation: Rotation,
    ) -> Result<Self, GeometryError> {
        let oriented_pixel_size = if rotation.swaps_axes() {
            PixelSize::new(mode_pixel_size.height(), mode_pixel_size.width())?
        } else {
            mode_pixel_size
        };
        let scale = AxisScale::new(
            f64::from(oriented_pixel_size.width()) / global_frame.width(),
            f64::from(oriented_pixel_size.height()) / global_frame.height(),
        )?;

        Ok(Self {
            global_frame,
            oriented_pixel_size,
            scale,
            rotation,
        })
    }

    pub const fn global_frame(&self) -> &GlobalDipRect {
        &self.global_frame
    }

    pub const fn oriented_pixel_size(&self) -> PixelSize {
        self.oriented_pixel_size
    }

    pub const fn scale(&self) -> AxisScale {
        self.scale
    }

    pub const fn rotation(&self) -> Rotation {
        self.rotation
    }

    pub fn global_to_local_point(
        &self,
        point: GlobalDipPoint,
    ) -> Result<GlobalDipPoint, GeometryError> {
        if !self.global_frame.contains_point(point) {
            return Err(GeometryError::new("point is outside display bounds"));
        }
        GlobalDipPoint::new(
            point.x() - self.global_frame.x(),
            point.y() - self.global_frame.y(),
        )
    }

    pub fn global_to_local_points(
        &self,
        rect: GlobalDipRect,
    ) -> Result<DisplayLocalPointRect, GeometryError> {
        if !self.global_frame.contains_rect(rect) {
            return Err(GeometryError::new("rectangle is outside display bounds"));
        }
        DisplayLocalPointRect::new(
            rect.x() - self.global_frame.x(),
            rect.y() - self.global_frame.y(),
            rect.width(),
            rect.height(),
        )
    }

    pub fn local_to_global_points(
        &self,
        rect: DisplayLocalPointRect,
    ) -> Result<GlobalDipRect, GeometryError> {
        self.validate_local_point_rect(rect)?;
        GlobalDipRect::new(
            self.global_frame.x() + rect.x(),
            self.global_frame.y() + rect.y(),
            rect.width(),
            rect.height(),
        )
    }

    pub fn local_points_to_pixels(
        &self,
        rect: DisplayLocalPointRect,
    ) -> Result<DisplayLocalPixelRect, GeometryError> {
        self.validate_local_point_rect(rect)?;

        let left = floor_to_u32(rect.x() * self.scale.x())?;
        let top = floor_to_u32(rect.y() * self.scale.y())?;
        let right = ceil_to_u32(rect.right() * self.scale.x())?;
        let bottom = ceil_to_u32(rect.bottom() * self.scale.y())?;
        DisplayLocalPixelRect::new(
            left,
            top,
            right
                .checked_sub(left)
                .ok_or_else(|| GeometryError::new("pixel rectangle horizontal bounds overflow"))?,
            bottom
                .checked_sub(top)
                .ok_or_else(|| GeometryError::new("pixel rectangle vertical bounds overflow"))?,
        )
    }

    pub fn local_pixels_to_points(
        &self,
        rect: DisplayLocalPixelRect,
    ) -> Result<DisplayLocalPointRect, GeometryError> {
        if rect.right() > self.oriented_pixel_size.width()
            || rect.bottom() > self.oriented_pixel_size.height()
        {
            return Err(GeometryError::new(
                "pixel rectangle is outside display bounds",
            ));
        }
        DisplayLocalPointRect::new(
            f64::from(rect.x()) / self.scale.x(),
            f64::from(rect.y()) / self.scale.y(),
            f64::from(rect.width()) / self.scale.x(),
            f64::from(rect.height()) / self.scale.y(),
        )
    }

    fn validate_local_point_rect(&self, rect: DisplayLocalPointRect) -> Result<(), GeometryError> {
        if rect.right() > self.global_frame.width() || rect.bottom() > self.global_frame.height() {
            return Err(GeometryError::new("rectangle is outside display bounds"));
        }
        Ok(())
    }
}

fn floor_to_u32(value: f64) -> Result<u32, GeometryError> {
    rounded_to_u32(value.floor())
}

fn ceil_to_u32(value: f64) -> Result<u32, GeometryError> {
    rounded_to_u32(value.ceil())
}

pub(crate) fn nearest_to_u32(value: f64) -> Result<u32, GeometryError> {
    rounded_to_u32(value.round())
}

fn rounded_to_u32(value: f64) -> Result<u32, GeometryError> {
    if !value.is_finite() || value < 0.0 || value > f64::from(u32::MAX) {
        return Err(GeometryError::new("pixel coordinate is out of range"));
    }
    Ok(value as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> GlobalDipRect {
        GlobalDipRect::new(x, y, width, height).expect("valid rectangle")
    }

    fn size(width: u32, height: u32) -> PixelSize {
        PixelSize::new(width, height).expect("valid pixel size")
    }

    #[test]
    fn half_open_rectangles_exclude_right_and_bottom_edges() {
        let bounds = rect(-100.0, -50.0, 200.0, 100.0);
        assert!(bounds.contains_point(GlobalDipPoint::new(-100.0, -50.0).unwrap()));
        assert!(bounds.contains_point(GlobalDipPoint::new(99.999, 49.999).unwrap()));
        assert!(!bounds.contains_point(GlobalDipPoint::new(100.0, 0.0).unwrap()));
        assert!(!bounds.contains_point(GlobalDipPoint::new(0.0, 50.0).unwrap()));
        assert!(
            bounds
                .intersection(rect(100.0, -50.0, 10.0, 10.0))
                .is_none()
        );
    }

    #[test]
    fn local_first_transform_does_not_scale_negative_global_origin() {
        let display = DisplayGeometry::from_mode(
            rect(-1920.0, 0.0, 1920.0, 1080.0),
            size(1920, 1080),
            Rotation::Degrees0,
        )
        .unwrap();
        let global = rect(-120.25, 100.5, 120.25, 200.25);

        let local = display.global_to_local_points(global).unwrap();
        assert_eq!(local.x(), 1799.75);
        assert_eq!(local.y(), 100.5);
        let pixels = display.local_points_to_pixels(local).unwrap();
        assert_eq!(pixels.x(), 1799);
        assert_eq!(pixels.y(), 100);
        assert_eq!(pixels.right(), 1920);
        assert_eq!(pixels.bottom(), 301);
    }

    #[test]
    fn mixed_scale_round_trip_expands_only_to_source_pixel_edges() {
        let display = DisplayGeometry::from_mode(
            rect(0.0, 0.0, 1440.0, 900.0),
            size(2880, 1800),
            Rotation::Degrees0,
        )
        .unwrap();
        let local = DisplayLocalPointRect::new(0.125, 10.25, 120.125, 50.25).unwrap();

        let pixels = display.local_points_to_pixels(local).unwrap();
        assert_eq!(pixels, DisplayLocalPixelRect::new(0, 20, 241, 101).unwrap());
        let expanded = display.local_pixels_to_points(pixels).unwrap();
        assert!(expanded.x() <= local.x());
        assert!(expanded.y() <= local.y());
        assert!(expanded.right() >= local.right());
        assert!(expanded.bottom() >= local.bottom());
        assert_eq!(
            display.local_to_global_points(local).unwrap(),
            rect(0.125, 10.25, 120.125, 50.25)
        );
    }

    #[test]
    fn ninety_and_two_seventy_rotations_swap_mode_axes() {
        for rotation in [Rotation::Degrees90, Rotation::Degrees270] {
            let display = DisplayGeometry::from_mode(
                rect(240.0, -1080.0, 1920.0, 1080.0),
                size(2160, 3840),
                rotation,
            )
            .unwrap();
            assert_eq!(display.oriented_pixel_size(), size(3840, 2160));
            assert_eq!(display.scale(), AxisScale::new(2.0, 2.0).unwrap());
        }
    }

    #[test]
    fn transforms_reject_rectangles_outside_the_display() {
        let display = DisplayGeometry::from_mode(
            rect(0.0, 0.0, 100.0, 100.0),
            size(200, 200),
            Rotation::Degrees0,
        )
        .unwrap();
        assert!(
            display
                .global_to_local_points(rect(-1.0, 0.0, 10.0, 10.0))
                .is_err()
        );
        assert!(
            display
                .local_points_to_pixels(DisplayLocalPointRect::new(90.0, 90.0, 11.0, 10.0).unwrap())
                .is_err()
        );
    }
}
