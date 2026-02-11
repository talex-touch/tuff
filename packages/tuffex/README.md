# TuffEx

<p align="center">
  <img src="https://img.shields.io/npm/v/@talex-touch/tuffex?style=flat-square&logo=npm&color=ff6b6b" alt="NPM Version">
  <img src="https://img.shields.io/badge/Vue-3.5-4fc08d?style=flat-square&logo=vue.js" alt="Vue 3.5">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/tree%20shaking-%E2%9C%93-success?style=flat-square" alt="Tree Shaking">
</p>

<p align="center">
  An elegant Vue 3 component library crafted for tactile experience and smooth interaction.<br/>
  Part of the <a href="https://tuff.tagzxia.com">Tuff</a> ecosystem.
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#components">Components</a> &middot;
  <a href="#design-philosophy">Design Philosophy</a> &middot;
  <a href="#documentation">Documentation</a>
</p>

---

## Getting Started

### Installation

```bash
pnpm add @talex-touch/tuffex
```

### Full Import

```typescript
import { createApp } from 'vue'
import TuffUI from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TuffUI)
```

### On-Demand Import

```typescript
import { TxButton, TxCard, TxDrawer } from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

app.use(TxButton)
app.use(TxCard)
app.use(TxDrawer)
```

## Design Philosophy

TuffEx is designed with one guiding principle: **interfaces should feel alive**.

- **Touch First.** Every interaction responds with warm, textured feedback.
- **Flow Aesthetics.** Functional animations guide the eye and maintain visual continuity.
- **Material Experience.** Digital surfaces carry real weight, depth, and presence.
- **Simplicity.** No unnecessary complexity. Every component does one thing well.

---

## Components

TuffEx ships **90+ components** organized into 10 categories. Every component is tree-shakeable, fully typed, and works with both Options API and Composition API.

### Basic

Foundational elements used across your entire application.

| Component | Description |
|-----------|-------------|
| `TxButton` | Tactile buttons with elastic feedback and variant system |
| `TxFlatButton` | Flat-style buttons with hover effects and loading states |
| `TxIcon` | Unified icon component supporting class and SVG icons |
| `TxAvatar` / `TxAvatarGroup` | User avatars with size, shape, status, and stacking |
| `TxTag` | Inline tags with variant, closable, and animation support |
| `TxStatusBadge` | Status indicators with pulse, glow, and color modes |
| `TxBadge` | Numeric and dot badges for notifications |
| `TxOutlineBorder` | Decorative outline borders with animated effects |
| `TxCornerOverlay` | Corner-positioned overlays on any element |
| `TxAlert` | Contextual alert banners for information, warning, and error |
| `TxBreadcrumb` | Navigation breadcrumbs with separator customization |

### Form

Input controls for collecting and validating user data.

| Component | Description |
|-----------|-------------|
| `TxInput` | Text input with focus transitions and validation states |
| `TxSelect` / `TxSelectItem` | Dropdown select with floating positioning |
| `TxSwitch` | Toggle switch with spring animation |
| `TxCheckbox` | Checkbox with indeterminate state and label placement |
| `TxRadio` / `TxRadioGroup` | Radio buttons with group management |
| `TxSlider` | Range slider with marks and tooltip |
| `TxSegmentedSlider` | Segmented control slider |
| `TxPicker` / `TxDatePicker` | Value and date pickers |
| `TxCascader` | Multi-level cascading selection |
| `TxTreeSelect` | Tree-structured dropdown selection |
| `TxSearchInput` | Search input with debounce and clear |
| `TxSearchSelect` | Searchable select with async data loading |
| `TxTagInput` | Multi-value tag input |
| `TxCodeEditor` / `TxCodeEditorToolbar` | Code editing with syntax highlighting |
| `TxForm` / `TxFormItem` | Form layout with validation rules |
| `TxRating` | Star rating input |

### Data Display

Components for presenting structured content and states.

| Component | Description |
|-----------|-------------|
| `TxCard` / `TxCardItem` | Cards with glass, solid, and outlined variants |
| `TxDataTable` | Data table with sorting, selection, and column config |
| `TxStatCard` | Statistic card for dashboards |
| `TxMarkdownView` | Markdown renderer with syntax highlighting |
| `TxTree` | Tree view with expand, select, and search |
| `TxTimeline` / `TxTimelineItem` | Vertical timeline for events and steps |
| `TxSteps` / `TxStep` | Step indicator for multi-step flows |
| `TxCollapse` / `TxCollapseItem` | Collapsible content panels |
| `TxPagination` | Page navigation with size options |
| `TxEmpty` | Simple empty placeholder |
| `TxEmptyState` | Rich empty state with icon, title, and action |
| `TxBlankSlate` | Blank slate for first-time-use experiences |
| `TxLoadingState` | Loading placeholder state |
| `TxNoSelection` | "No item selected" placeholder |
| `TxNoData` | "No data" placeholder |
| `TxSearchEmpty` | "No search results" placeholder |
| `TxOfflineState` | Offline status placeholder |
| `TxPermissionState` | Permission denied placeholder |

### Navigation

Components for moving between views and content.

| Component | Description |
|-----------|-------------|
| `TxTabs` / `TxTabItem` / `TxTabHeader` | Tabbed navigation with animated indicator |
| `TxTabBar` | Bottom tab bar for mobile layouts |
| `TxNavBar` | Top navigation bar |
| `TxTooltip` | Hover tooltips with placement and delay |
| `TxPopover` | Click-triggered popovers with rich content |
| `TxDropdownMenu` / `TxDropdownItem` | Dropdown menus with icon and shortcut support |
| `TxContextMenu` / `TxContextMenuItem` | Right-click context menus |
| `TxCommandPalette` | Keyboard-first command palette (Cmd+K style) |

### Layout

Structural components for arranging content.

| Component | Description |
|-----------|-------------|
| `TxContainer` / `TxRow` / `TxCol` | 24-column responsive grid system |
| `TxGrid` / `TxGridItem` | CSS Grid-based layout |
| `TxGridLayout` | Draggable grid layout |
| `TxFlex` | Flexbox wrapper with gap and direction props |
| `TxStack` | Vertical or horizontal stack layout |
| `TxSplitter` | Resizable split panel |
| `TxScroll` | Custom scrollbar with pull-to-refresh |
| `TxVirtualList` | Virtualized list for large datasets |
| `TxLayoutSkeleton` | Page layout skeleton placeholder |
| `TxGroupBlock` | Settings-style collapsible group |
| `TxBlockSlot` / `TxBlockLine` / `TxBlockSwitch` | Group block child items |
| `TxAgentsList` / `TxAgentItem` | Agent listing layout |

### Feedback

Visual indicators for progress, loading, and notifications.

| Component | Description |
|-----------|-------------|
| `TxProgressBar` | Horizontal progress bar with segments and animation |
| `TxProgress` | Circular or linear progress indicator |
| `TxSpinner` | Loading spinner with size variants |
| `TxLoadingOverlay` | Full-area loading overlay |
| `TxSkeleton` / `TxCardSkeleton` / `TxListItemSkeleton` | Content skeleton placeholders |
| `TxToastHost` | Toast notification host |

### Overlay

Modal and panel components that appear above the page.

| Component | Description |
|-----------|-------------|
| `TxDrawer` | Side panel with spring slide-in animation |
| `TxModal` | Modal dialog with backdrop blur |
| `TxBottomDialog` | Bottom sheet dialog |
| `TxBlowDialog` | Expanding dialog from a trigger element |
| `TxPopperDialog` | Popper-positioned dialog |
| `TxTouchTip` | Touch-friendly tooltip dialog |
| `TxFlipOverlay` | Flip-card overlay transition |
| `TxCommandPalette` | Quick-access command palette |

### Animation

Motion primitives and transition components.

| Component | Description |
|-----------|-------------|
| `TxAutoSizer` | Smooth auto-sizing container |
| `TxTransition` / `TxTransitionFade` / `TxTransitionSlideFade` | Enter/leave transitions |
| `TxTransitionRebound` | Spring-physics rebound transition |
| `TxTransitionSmoothSize` | Smooth size change transition |
| `TxTextTransformer` | Animated text transitions (typing, morphing) |
| `TxFusion` | Multi-element orchestrated animation |
| `TxStagger` | Staggered children animation |
| `TxSortableList` | Drag-and-drop sortable list |

### AI

Components for building AI-powered interfaces.

| Component | Description |
|-----------|-------------|
| `TxChatList` / `TxChatMessage` | Chat message list with markdown and attachments |
| `TxChatComposer` | Chat input with file attachment support |
| `TxTypingIndicator` | AI typing indicator animation |
| `TxImageUploader` | Image upload with preview and crop |
| `TxFileUploader` | File upload with drag-and-drop |
| `TxImageGallery` | Image gallery with lightbox |

### Visual

Decorative and visual effect components.

| Component | Description |
|-----------|-------------|
| `TxGlassSurface` | Frosted glass panel with blur and noise |
| `TxGradualBlur` | Gradual blur effect |
| `TxGradientBorder` | Animated gradient border |
| `TxGlowText` | Glowing text effect |

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Vue | 3.5+ | Composition API with `<script setup>` |
| TypeScript | 5.8+ | Full type safety and IntelliSense |
| Vite | 6.0+ | Development and build tooling |
| VitePress | 1.5+ | Documentation |
| Sass | 1.89+ | Advanced styling |
| VueUse | 13.0+ | Composition utilities |

## Documentation

- **[Online Documentation](https://tuffex.tagzxia.com/docs/dev/tuffex)** - Component guides, API reference, and design system
- **Local Development** - Run `pnpm docs:dev` for the VitePress documentation site at `localhost:8000`

## Development

```bash
pnpm install            # Install dependencies
pnpm docs:dev           # Start documentation server
pnpm build              # Build the library
pnpm docs:build         # Build documentation for production
```

## Integration with Tuff

TuffEx is the UI foundation of the [Tuff](https://tuff.tagzxia.com) desktop application. Components are shared between the core app and external plugin developers through this standalone library.

## Contributing

- [Report Issues](https://github.com/talex-touch/tuff/issues)
- [Feature Requests](https://github.com/talex-touch/tuff/discussions)
- [Submit PRs](https://github.com/talex-touch/tuff/pulls)

## License

[MIT License](LICENSE) &copy; 2025 TalexDreamSoul
