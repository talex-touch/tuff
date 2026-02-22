# UpdatePromptDialog Visual Reference

## Component States

### State 1: Initial Update Available
```
┌─────────────────────────────────────────────────────────┐
│  🎉 New Version Available                          [×]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Current Version    →    New Version              │ │
│  │     v2.4.6                 v2.5.0                 │ │
│  │     [INFO]                [SUCCESS]               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  📅 January 15, 2024        💾 250 MB                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  📄 Release Notes                                  │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │ ## 🎉 New Features                           │ │ │
│  │  │                                               │ │ │
│  │  │ - Unified Download Center                    │ │ │
│  │  │ - Auto Update System                         │ │ │
│  │  │                                               │ │ │
│  │  │ ## 🔧 Improvements                           │ │ │
│  │  │                                               │ │ │
│  │  │ - Optimized performance                      │ │ │
│  │  │ - Fixed known issues                         │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  [Ignore Version]    [Remind Later]  [Download Now]    │
└─────────────────────────────────────────────────────────┘
```

### State 2: Downloading Update
```
┌─────────────────────────────────────────────────────────┐
│  ⏬ Downloading Update                             [×]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Current Version    →    New Version              │ │
│  │     v2.4.6                 v2.5.0                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  📅 January 15, 2024        💾 250 MB                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  📄 Release Notes                                  │ │
│  │  [Scrollable content...]                           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ⏳ Downloading                                    │ │
│  │                                                     │ │
│  │  45.2%                              2.1 MB/s       │ │
│  │  113 MB / 250 MB                    1分12秒        │ │
│  │  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                      [Cancel Download]  │
└─────────────────────────────────────────────────────────┘
```

### State 3: Download Complete
```
┌─────────────────────────────────────────────────────────┐
│  🎉 Update Ready                                   [×]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Current Version    →    New Version              │ │
│  │     v2.4.6                 v2.5.0                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  📅 January 15, 2024        💾 250 MB                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  📄 Release Notes                                  │ │
│  │  [Scrollable content...]                           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ⏳ Downloading                                    │ │
│  │                                                     │ │
│  │  100.0%                             2.1 MB/s       │ │
│  │  250 MB / 250 MB                    完成           │ │
│  │  ████████████████████████████████████████████████  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ✅ Download Complete                              │ │
│  │  Update package downloaded and ready to install    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                          [Install Now]  │
└─────────────────────────────────────────────────────────┘
```

## Color Scheme

### Version Tags
- **Current Version**: Blue/Info tag (`--tx-color-info`)
- **New Version**: Green/Success tag (`--tx-color-success`)

### Status Colors
- **Downloading**: Blue (`--tx-color-primary`)
- **Complete**: Green (`--tx-color-success`)
- **Failed**: Red (`--tx-color-danger`)

### Progress Bar
- **Active**: Blue with pulse animation
- **Complete**: Green
- **Failed**: Red

## Responsive Behavior

### Desktop (> 768px)
- Dialog width: 650px
- Horizontal version comparison
- Side-by-side info items
- Horizontal button layout

### Mobile (≤ 768px)
- Full width dialog
- Vertical version comparison
- Stacked info items
- Vertical button layout

## Interactive Elements

### Buttons
1. **Download Now** (Primary)
   - Blue background
   - Download icon
   - Visible in initial state

2. **Install Now** (Success)
   - Green background
   - Upload icon
   - Visible when download complete

3. **Remind Later** (Default)
   - Gray background
   - Visible in initial state

4. **Ignore Version** (Text)
   - No background
   - Left-aligned
   - Visible in initial state

5. **Cancel Download** (Warning)
   - Orange background
   - Close icon
   - Visible during download

### Hover States
- Buttons: Slight color darkening
- Links in release notes: Underline
- Close button: Red highlight

### Focus States
- Blue outline for keyboard navigation
- Tab order: Close → Ignore → Remind → Download/Install

## Animations

### Dialog Entry
- Fade in with slide down (0.3s ease-out)

### Progress Bar
- Smooth width transition (0.3s ease)
- Pulse animation during download (2s infinite)

### State Transitions
- Fade between states (0.2s)
- Button appearance/disappearance (0.2s)

## Accessibility Features

### ARIA Labels
- Dialog role: "dialog"
- Title: "alertdialog" for important updates
- Progress bar: "progressbar" with aria-valuenow

### Keyboard Navigation
- Tab: Navigate between interactive elements
- Enter: Activate focused button
- Escape: Close dialog (if not downloading)
- Arrow keys: Scroll release notes

### Screen Reader Support
- Version comparison announced
- Progress updates announced
- Button states announced
- Error messages announced

## Typography

### Headers
- Dialog title: 18px, bold
- Section titles: 16px, semi-bold
- Release notes H1: 20px, bold
- Release notes H2: 18px, bold
- Release notes H3: 16px, bold

### Body Text
- Regular text: 14px
- Small text: 12px
- Code/monospace: 13px

### Line Heights
- Headers: 1.2
- Body text: 1.6
- Code: 1.4

## Spacing

### Padding
- Dialog content: 8px 0
- Sections: 24px bottom
- Cards: 16px all sides
- Buttons: 12px 20px

### Margins
- Section titles: 0 0 16px 0
- Info items: 12px bottom
- List items: 4px bottom

### Gaps
- Version comparison: 24px
- Info items: 24px
- Button groups: 8px

## Scrolling

### Release Notes
- Max height: 300px
- Overflow: auto
- Custom scrollbar:
  - Width: 6px
  - Track: Light gray
  - Thumb: Medium gray
  - Hover: Dark gray

## Icons

### Used Icons (Carbon/UnoCSS)
- Right: Version arrow
- Calendar: Release date
- Download: Download size & button
- Document: Release notes
- Loading: Downloading state
- Upload: Install button
- Close: Cancel button

## Markdown Rendering

### Supported Elements
```markdown
# H1 Header
## H2 Header
### H3 Header

**Bold text**
__Also bold__

*Italic text*
_Also italic_

[Link text](https://example.com)

- List item 1
- List item 2

Paragraph text with line breaks.
```

### Rendered Styles
- Headers: Bold, larger font, margin spacing
- Bold: font-weight 600
- Italic: font-style italic
- Links: Primary color, underline on hover
- Lists: Disc bullets, 24px left padding
- Paragraphs: 8px vertical margin

## Error States

### Download Failed
```
┌────────────────────────────────────────────────┐
│  ❌ Download Failed                            │
│  Network connection error. Please try again.   │
│                                                 │
│  [Retry Download]                              │
└────────────────────────────────────────────────┘
```

### Checksum Failed
```
┌────────────────────────────────────────────────┐
│  ⚠️ Verification Failed                        │
│  File integrity check failed.                  │
│                                                 │
│  [Download Again]                              │
└────────────────────────────────────────────────┘
```

## Loading States

### Checking for Updates
```
┌────────────────────────────────────────────────┐
│  🔄 Checking for Updates...                    │
│                                                 │
│  [Spinner animation]                           │
└────────────────────────────────────────────────┘
```

## Empty States

### No Release Data
```
┌────────────────────────────────────────────────┐
│  ℹ️ No Update Information                      │
│  Unable to load update details.                │
│                                                 │
│  [Close]                                       │
└────────────────────────────────────────────────┘
```
