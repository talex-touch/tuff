use std::collections::{HashMap, HashSet};

use crate::limits::ScreenshotLimits;
use crate::model::{AxisScale, DescriptorId, GeometryError, GlobalDipPoint, GlobalDipRect};
use crate::region_plan::RegionDisplay;

const MIN_ALPHA: f64 = 0.01;
const MAX_BOUNDS_COHERENCE_DELTA: f64 = 0.5;
const MAX_PANEL_LAYER: i32 = 25;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowOwner {
    process_id: u32,
    bundle_id: Option<String>,
    application_name: Option<String>,
}

impl WindowOwner {
    pub fn new(
        process_id: u32,
        bundle_id: Option<String>,
        application_name: Option<String>,
    ) -> Result<Self, GeometryError> {
        if process_id == 0 {
            return Err(GeometryError::new("window process id must be positive"));
        }
        let limits = ScreenshotLimits::default();
        validate_optional_text(bundle_id.as_deref(), limits.max_bundle_id_bytes())?;
        validate_optional_text(
            application_name.as_deref(),
            limits.max_application_name_bytes(),
        )?;
        Ok(Self {
            process_id,
            bundle_id,
            application_name,
        })
    }

    pub const fn process_id(&self) -> u32 {
        self.process_id
    }

    pub fn bundle_id(&self) -> Option<&str> {
        self.bundle_id.as_deref()
    }

    pub fn application_name(&self) -> Option<&str> {
        self.application_name.as_deref()
    }
}

#[derive(Clone)]
pub struct ShareableWindow {
    id: DescriptorId,
    native_id: u32,
    owner: WindowOwner,
    title: Option<String>,
    global_frame: GlobalDipRect,
    layer: i32,
    on_screen: bool,
    active: Option<bool>,
    capturable: bool,
}

impl ShareableWindow {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: DescriptorId,
        native_id: u32,
        owner: WindowOwner,
        title: Option<String>,
        global_frame: GlobalDipRect,
        layer: i32,
        on_screen: bool,
        active: Option<bool>,
        capturable: bool,
    ) -> Result<Self, GeometryError> {
        if native_id == 0 {
            return Err(GeometryError::new("native window id must be positive"));
        }
        let limits = ScreenshotLimits::default();
        if title
            .as_deref()
            .is_some_and(|value| value.chars().count() > limits.max_title_scalars())
        {
            return Err(GeometryError::new("window title exceeds the safe limit"));
        }
        Ok(Self {
            id,
            native_id,
            owner,
            title,
            global_frame,
            layer,
            on_screen,
            active,
            capturable,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowSharing {
    None,
    ReadOnly,
    ReadWrite,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CgWindowMetadata {
    native_id: u32,
    process_id: u32,
    global_frame: GlobalDipRect,
    layer: i32,
    alpha: f64,
    sharing: WindowSharing,
    on_screen: Option<bool>,
}

impl CgWindowMetadata {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        native_id: u32,
        process_id: u32,
        global_frame: GlobalDipRect,
        layer: i32,
        alpha: f64,
        sharing: WindowSharing,
        on_screen: Option<bool>,
    ) -> Result<Self, GeometryError> {
        if native_id == 0 || process_id == 0 {
            return Err(GeometryError::new("window identifiers must be positive"));
        }
        if !alpha.is_finite() {
            return Err(GeometryError::new("window alpha must be finite"));
        }
        Ok(Self {
            native_id,
            process_id,
            global_frame,
            layer,
            alpha,
            sharing,
            on_screen,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelfWindowPolicy {
    process_ids: HashSet<u32>,
    bundle_ids: HashSet<String>,
    native_window_ids: HashSet<u32>,
}

impl SelfWindowPolicy {
    pub fn new(
        process_ids: Vec<u32>,
        bundle_ids: Vec<String>,
        native_window_ids: Vec<u32>,
    ) -> Result<Self, GeometryError> {
        if process_ids.contains(&0) || native_window_ids.contains(&0) {
            return Err(GeometryError::new(
                "self window identifiers must be positive",
            ));
        }
        let limits = ScreenshotLimits::default();
        for bundle_id in &bundle_ids {
            validate_text(bundle_id, limits.max_bundle_id_bytes())?;
        }
        Ok(Self {
            process_ids: process_ids.into_iter().collect(),
            bundle_ids: bundle_ids.into_iter().collect(),
            native_window_ids: native_window_ids.into_iter().collect(),
        })
    }

    fn matches(&self, window: &ShareableWindow) -> bool {
        self.process_ids.contains(&window.owner.process_id)
            || window
                .owner
                .bundle_id
                .as_ref()
                .is_some_and(|bundle_id| self.bundle_ids.contains(bundle_id))
            || self.native_window_ids.contains(&window.native_id)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct WindowSelectionPolicy {
    minimum_size: f64,
    self_windows: SelfWindowPolicy,
    system_bundle_ids: HashSet<String>,
}

impl WindowSelectionPolicy {
    pub fn new(
        minimum_size: f64,
        self_windows: SelfWindowPolicy,
        system_bundle_ids: Vec<String>,
    ) -> Result<Self, GeometryError> {
        if !minimum_size.is_finite() || minimum_size <= 0.0 {
            return Err(GeometryError::new("window minimum size must be positive"));
        }
        let limits = ScreenshotLimits::default();
        for bundle_id in &system_bundle_ids {
            validate_text(bundle_id, limits.max_bundle_id_bytes())?;
        }
        Ok(Self {
            minimum_size,
            self_windows,
            system_bundle_ids: system_bundle_ids.into_iter().collect(),
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowKind {
    Normal,
    Panel,
    Transient,
    System,
    Unknown,
}

#[derive(Clone)]
pub struct WindowDescriptor {
    id: DescriptorId,
    native_id: u32,
    owner: WindowOwner,
    title: Option<String>,
    global_frame: GlobalDipRect,
    layer: i32,
    z_index: usize,
    kind: WindowKind,
    on_screen: bool,
    active: Option<bool>,
    capturable: bool,
    minimized: Option<bool>,
    covered_display_ids: Vec<DescriptorId>,
    maximum_scale: Option<AxisScale>,
    is_self: bool,
}

impl WindowDescriptor {
    pub const fn id(&self) -> &DescriptorId {
        &self.id
    }

    pub const fn native_id(&self) -> u32 {
        self.native_id
    }

    pub const fn owner(&self) -> &WindowOwner {
        &self.owner
    }

    pub fn title(&self) -> Option<&str> {
        self.title.as_deref()
    }

    pub const fn global_frame(&self) -> GlobalDipRect {
        self.global_frame
    }

    pub const fn layer(&self) -> i32 {
        self.layer
    }

    pub const fn z_index(&self) -> usize {
        self.z_index
    }

    pub const fn kind(&self) -> WindowKind {
        self.kind
    }

    pub const fn on_screen(&self) -> bool {
        self.on_screen
    }

    pub const fn active(&self) -> Option<bool> {
        self.active
    }

    pub const fn capturable(&self) -> bool {
        self.capturable
    }

    pub const fn minimized(&self) -> Option<bool> {
        self.minimized
    }

    pub fn covered_display_ids(&self) -> &[DescriptorId] {
        &self.covered_display_ids
    }

    pub const fn maximum_scale(&self) -> Option<AxisScale> {
        self.maximum_scale
    }

    pub const fn is_self(&self) -> bool {
        self.is_self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowHitTestOptions {
    include_panels: bool,
    max_candidates: usize,
}

impl WindowHitTestOptions {
    pub fn new(include_panels: bool, max_candidates: usize) -> Self {
        let limits = ScreenshotLimits::default();
        Self {
            include_panels,
            max_candidates: max_candidates.clamp(1, limits.max_window_candidates()),
        }
    }
}

pub fn build_window_descriptors(
    shareable_windows: Vec<ShareableWindow>,
    cg_windows_front_to_back: Vec<CgWindowMetadata>,
    displays: &[RegionDisplay],
    policy: &WindowSelectionPolicy,
) -> Vec<WindowDescriptor> {
    let shareable_counts = count_ids(shareable_windows.iter().map(|window| window.native_id));
    let mut shareable_by_id = shareable_windows
        .into_iter()
        .filter(|window| shareable_counts.get(&window.native_id) == Some(&1))
        .map(|window| (window.native_id, window))
        .collect::<HashMap<_, _>>();
    let cg_counts = count_ids(
        cg_windows_front_to_back
            .iter()
            .map(|window| window.native_id),
    );

    cg_windows_front_to_back
        .into_iter()
        .enumerate()
        .filter_map(|(z_index, cg_window)| {
            if cg_counts.get(&cg_window.native_id) != Some(&1) {
                return None;
            }
            let shareable = shareable_by_id.remove(&cg_window.native_id)?;
            let on_screen = shareable.on_screen && cg_window.on_screen.unwrap_or(true);
            if !on_screen {
                return None;
            }

            let kind = classify_window(&shareable, cg_window.layer, policy);
            let (covered_display_ids, maximum_scale) =
                display_coverage(shareable.global_frame, displays);
            let coherent = shareable.owner.process_id == cg_window.process_id
                && shareable.layer == cg_window.layer
                && coherent_bounds(shareable.global_frame, cg_window.global_frame);
            let geometry_eligible = shareable.global_frame.width() >= policy.minimum_size
                && shareable.global_frame.height() >= policy.minimum_size
                && cg_window.alpha > MIN_ALPHA;
            let capturable = shareable.capturable
                && coherent
                && geometry_eligible
                && cg_window.sharing != WindowSharing::None
                && !covered_display_ids.is_empty();
            let is_self = policy.self_windows.matches(&shareable);

            Some(WindowDescriptor {
                id: shareable.id,
                native_id: shareable.native_id,
                owner: shareable.owner,
                title: shareable.title,
                global_frame: shareable.global_frame,
                layer: cg_window.layer,
                z_index,
                kind,
                on_screen,
                active: shareable.active,
                capturable,
                minimized: None,
                covered_display_ids,
                maximum_scale,
                is_self,
            })
        })
        .collect()
}

pub fn hit_test_windows(
    windows: &[WindowDescriptor],
    point: GlobalDipPoint,
    options: WindowHitTestOptions,
) -> Vec<WindowDescriptor> {
    windows
        .iter()
        .filter(|window| {
            window.capturable
                && !window.is_self
                && window.global_frame.contains_point(point)
                && match window.kind {
                    WindowKind::Normal => true,
                    WindowKind::Panel => options.include_panels,
                    WindowKind::Transient | WindowKind::System | WindowKind::Unknown => false,
                }
        })
        .take(options.max_candidates)
        .cloned()
        .collect()
}

fn count_ids(ids: impl Iterator<Item = u32>) -> HashMap<u32, usize> {
    let mut counts = HashMap::new();
    for id in ids {
        *counts.entry(id).or_insert(0) += 1;
    }
    counts
}

fn classify_window(
    window: &ShareableWindow,
    layer: i32,
    policy: &WindowSelectionPolicy,
) -> WindowKind {
    if window
        .owner
        .bundle_id
        .as_ref()
        .is_some_and(|bundle_id| policy.system_bundle_ids.contains(bundle_id))
    {
        WindowKind::System
    } else if layer == 0 {
        WindowKind::Normal
    } else if (1..=MAX_PANEL_LAYER).contains(&layer) {
        WindowKind::Panel
    } else if layer > MAX_PANEL_LAYER {
        WindowKind::Transient
    } else {
        WindowKind::Unknown
    }
}

fn coherent_bounds(left: GlobalDipRect, right: GlobalDipRect) -> bool {
    (left.x() - right.x()).abs() <= MAX_BOUNDS_COHERENCE_DELTA
        && (left.y() - right.y()).abs() <= MAX_BOUNDS_COHERENCE_DELTA
        && (left.width() - right.width()).abs() <= MAX_BOUNDS_COHERENCE_DELTA
        && (left.height() - right.height()).abs() <= MAX_BOUNDS_COHERENCE_DELTA
}

fn display_coverage(
    window_frame: GlobalDipRect,
    displays: &[RegionDisplay],
) -> (Vec<DescriptorId>, Option<AxisScale>) {
    let mut covered = displays
        .iter()
        .filter(|display| {
            display
                .geometry()
                .global_frame()
                .intersection(window_frame)
                .is_some()
        })
        .collect::<Vec<_>>();
    covered.sort_by(|left, right| left.id().as_str().cmp(right.id().as_str()));

    let mut maximum_scale: Option<AxisScale> = None;
    let mut ids = Vec::with_capacity(covered.len());
    for display in covered {
        maximum_scale = Some(match maximum_scale {
            Some(scale) => scale.maximum(display.geometry().scale()),
            None => display.geometry().scale(),
        });
        ids.push(display.id().clone());
    }
    (ids, maximum_scale)
}

fn validate_optional_text(value: Option<&str>, max_bytes: usize) -> Result<(), GeometryError> {
    if let Some(value) = value {
        validate_text(value, max_bytes)?;
    }
    Ok(())
}

fn validate_text(value: &str, max_bytes: usize) -> Result<(), GeometryError> {
    if value.is_empty() || value.len() > max_bytes {
        return Err(GeometryError::new("window metadata text is invalid"));
    }
    Ok(())
}
