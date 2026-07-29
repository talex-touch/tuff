// Centralized compile-time contract for the m1 "missing-export" audit batch.
//
// Every type below is a public export a component's docs advertise but that used
// to be unreachable from the component's package entry (`<comp>/index.ts`). This
// file imports each one from that entry and pins it into an exported tuple, so
// deleting any single re-export turns into a `vue-tsc` TS2305 here.
//
// WHY THIS LIVES OUTSIDE `src/` AND OUTSIDE `__tests__/`:
//   - `tsconfig.json` excludes `**/__tests__/**` from vue-tsc, and both vitest
//     (`import type` erased) and `expectTypeOf` (runtime no-op under `vitest run`)
//     would leave a test file permanently green — no discriminating power.
//   - vue-tsc DOES type-check any `packages/**/*.ts` that is not a test, so a
//     sibling-of-`src/` module is the one place a removed type export actually
//     fails a required verification.
//   - The Vite build only bundles files reachable from `src/**/index.ts` entries,
//     so nothing here ships to `dist/`.
//
// Runtime `withInstall`/`.install` registration is guarded separately by the
// per-component install tests (grid/flat-button/progress/rating/timeline), which
// `vitest run` can actually execute.
//
// MAINTENANCE — the scope of this file, and how to decide what to add:
//
// This registers public types the docs advertise that were (or could become)
// UNREACHABLE from a component's package entry (`<comp>/index.ts`). Its one job is
// to catch the decay index.ts's own type-check chain does NOT flag: a re-export
// line and its now-unused import deleted together. (In the tooltip experiment that
// motivated this file, dropping both lines drew nothing from index.ts's own chain;
// only a TS2724 here caught it.)
//
// It is NOT a full public-API snapshot. Do not add a type just because it is newly
// exported — that inflates this file into a per-batch API dump whose upkeep dwarfs
// its value, and it slowly stops guarding anything in particular.
//
// To decide whether a new type belongs, ask one question:
//     Could this type become unreachable from `<comp>/index.ts` while the docs
//     still reference it?
// If its reachability is guaranteed by construction — e.g. an
// `InstanceType<typeof Component>` written inline at the entry, already covered by
// `audit:exports` and by real consumer imports — the answer is no; leave it out.
// Example: collapse's `TxCollapseInstance` / `TxCollapseItemInstance` are
// deliberately absent — collapse's only audit finding was withInstall registration
// (guarded by its install test), not a missing type export. Being exported, or being
// an `*Instance` type, is not by itself a reason to register; apply the question.

import type { AgentsListGroup } from './src/agents/index'
import type {
  BaseAnchorClassValue,
  BaseAnchorPanelCardProps,
  BaseAnchorPlacement,
  BaseAnchorSurfaceMotionAdaptation,
  BaseAnchorVirtualReference,
} from './src/base-anchor/index'
import type { AvatarPresetSize, AvatarShape } from './src/avatar/index'
import type { CardItemAvatarShape } from './src/card-item/index'
import type { CascaderKey, CascaderPath } from './src/cascader/index'
import type { ChatMessageAttachment, ChatMessageAttachmentImage, ChatMessageRole } from './src/chat/index'
import type { CommandPaletteClassValue } from './src/command-palette/index'
import type {
  ContextMenuAnchorMode,
  ContextMenuOpenTarget,
  ContextMenuPanelBackground,
  ContextMenuPanelShadow,
  ContextMenuPanelVariant,
  ContextMenuPoint,
  ContextMenuTrigger,
} from './src/context-menu/index'
import type { DatePickerVariant } from './src/date-picker/index'
import type { DividerGradient, DividerProps } from './src/divider/index'
import type { FlatButtonProps, TuffFlatButtonInstance } from './src/flat-button/index'
import type { FlatInputEmits, FlatInputProps, TxFlatInputInstance } from './src/flat-input/index'
import type { TxFlatRadioContext, TxFlatRadioSize } from './src/flat-radio/index'
import type {
  GradualBlurAnimated,
  GradualBlurCurve,
  GradualBlurPosition,
  GradualBlurTarget,
} from './src/gradual-blur/index'
import type {
  Breakpoint,
  GridGap,
  GridItemProps,
  GridProps,
  Responsive,
  TxGridInstance,
  TxGridItemInstance,
} from './src/grid/index'
import type { TxIconButtonProps } from './src/icon-button/index'
import type { TxImageGalleryInstance } from './src/image-gallery/index'
import type { KbdProps } from './src/kbd/index'
import type { PopoverPlacement } from './src/popover/index'
import type { ProgressProps, TuffProgressInstance } from './src/progress/index'
import type { TxRadioIndicatorVariant, TxRadioType } from './src/radio/index'
import type { RatingIcon } from './src/rating/index'
import type { SkeletonVariant } from './src/skeleton/index'
import type { SplitterDirection } from './src/splitter/index'
import type { StackDirection } from './src/stack/index'
import type { StaggerEasing } from './src/stagger/index'
import type { TabBarValue } from './src/tab-bar/index'
import type { TxTimelineInstance, TxTimelineItemInstance } from './src/timeline/index'
import type { TooltipAnchorProps } from './src/tooltip/index'

// Referencing every name in an exported tuple keeps them "used" and makes any
// missing re-export a hard compile error at exactly the deleted name.
export type MissingExportContract = [
  // agents
  AgentsListGroup<unknown>,
  // avatar
  AvatarPresetSize,
  AvatarShape,
  // base-anchor
  BaseAnchorClassValue,
  BaseAnchorPanelCardProps,
  BaseAnchorPlacement,
  BaseAnchorSurfaceMotionAdaptation,
  BaseAnchorVirtualReference,
  // card-item
  CardItemAvatarShape,
  // cascader
  CascaderKey,
  CascaderPath,
  // chat
  ChatMessageAttachment,
  ChatMessageAttachmentImage,
  ChatMessageRole,
  // command-palette
  CommandPaletteClassValue,
  // context-menu
  ContextMenuAnchorMode,
  ContextMenuOpenTarget,
  ContextMenuPanelBackground,
  ContextMenuPanelShadow,
  ContextMenuPanelVariant,
  ContextMenuPoint,
  ContextMenuTrigger,
  // date-picker
  DatePickerVariant,
  // divider
  DividerGradient,
  DividerProps,
  // flat-button
  FlatButtonProps,
  TuffFlatButtonInstance,
  // flat-input
  FlatInputEmits,
  FlatInputProps,
  TxFlatInputInstance,
  // flat-radio
  TxFlatRadioContext,
  TxFlatRadioSize,
  // gradual-blur
  GradualBlurAnimated,
  GradualBlurCurve,
  GradualBlurPosition,
  GradualBlurTarget,
  // grid
  Breakpoint,
  GridGap,
  GridItemProps,
  GridProps,
  Responsive<number>,
  TxGridInstance,
  TxGridItemInstance,
  // icon-button
  TxIconButtonProps,
  // image-gallery
  TxImageGalleryInstance,
  // kbd
  KbdProps,
  // popover
  PopoverPlacement,
  // progress
  ProgressProps,
  TuffProgressInstance,
  // radio
  TxRadioIndicatorVariant,
  TxRadioType,
  // rating
  RatingIcon,
  // skeleton
  SkeletonVariant,
  // splitter
  SplitterDirection,
  // stack
  StackDirection,
  // stagger
  StaggerEasing,
  // tab-bar
  TabBarValue,
  // timeline
  TxTimelineInstance,
  TxTimelineItemInstance,
  // tooltip
  TooltipAnchorProps,
]
