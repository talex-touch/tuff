use serde::Deserialize;

use crate::model::{AxisScale, GlobalDipRect, PixelSize, Rotation};

pub(crate) const TOPOLOGIES: &str = include_str!("../../fixtures/screenshot-v1/topologies.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct FixtureFile {
    pub(crate) version: u16,
    pub(crate) topologies: Vec<TopologyFixture>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TopologyFixture {
    pub(crate) name: String,
    pub(crate) displays: Vec<DisplayFixture>,
    pub(crate) regions: Vec<RegionFixture>,
    pub(crate) windows: Vec<WindowFixture>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DisplayFixture {
    pub(crate) id: String,
    pub(crate) native_id: String,
    pub(crate) global_frame: GlobalDipRect,
    pub(crate) mode_pixel_size: PixelSize,
    pub(crate) rotation: Rotation,
    pub(crate) expected_oriented_pixel_size: PixelSize,
    pub(crate) expected_scale: AxisScale,
    pub(crate) is_primary: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RegionFixture {
    pub(crate) name: String,
    pub(crate) global_rect: GlobalDipRect,
    pub(crate) expected_display_ids: Vec<String>,
    pub(crate) expected_output_scale: AxisScale,
    pub(crate) expected_transparent_hole: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WindowFixture {
    pub(crate) id: String,
    pub(crate) native_id: String,
    pub(crate) global_frame: GlobalDipRect,
    pub(crate) expected_covered_display_ids: Vec<String>,
    pub(crate) expected_maximum_scale: AxisScale,
}

pub(crate) fn fixture() -> FixtureFile {
    serde_json::from_str(TOPOLOGIES).expect("screenshot topology fixture must decode")
}
