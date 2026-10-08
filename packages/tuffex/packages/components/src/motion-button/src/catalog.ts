// Ported from Amicro src/data/buttons.tsx:43-77 (commit 43c29ce).
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { MotionButtonCatalogEntry, MotionButtonSourceId } from './types'

const primary = 'var(--tx-color-primary)'
const success = 'var(--tx-color-success)'
const warning = 'var(--tx-color-warning)'
const danger = 'var(--tx-color-danger)'
const muted = 'var(--tx-text-color-placeholder)'

export const MOTION_BUTTON_CATALOG: readonly MotionButtonCatalogEntry[] = [
  { sourceId: '1', sourceLabel: 'Download for Mac', variant: 'slide-arrow', icon: 'apple', activeIcon: 'arrow-right', sourceRef: 'src/data/buttons.tsx:43' },
  { sourceId: '2', sourceLabel: 'Star on GitHub', variant: 'sparkle', icon: 'github', activeIcon: 'star', activeIconColor: warning, sourceRef: 'src/data/buttons.tsx:44' },
  { sourceId: '3', sourceLabel: 'Deploy App', variant: 'morph', icon: 'cloud', activeIcon: 'cloud-upload', activeIconColor: primary, sourceRef: 'src/data/buttons.tsx:45' },
  { sourceId: '4', sourceLabel: 'Copy Hash', variant: 'morph', icon: 'copy', activeIcon: 'check', activeIconColor: success, holdDuration: 500, sourceRef: 'src/data/buttons.tsx:46' },
  { sourceId: '5', sourceLabel: 'Sponsor', variant: 'pulse', icon: 'heart', iconColor: danger, activeFill: true, sourceRef: 'src/data/buttons.tsx:47' },
  { sourceId: '6', sourceLabel: 'Share', variant: 'morph', icon: 'link', activeIcon: 'send', activeIconColor: primary, sourceRef: 'src/data/buttons.tsx:48' },
  { sourceId: '7', sourceLabel: 'Preview', variant: 'morph', icon: 'play', activeIcon: 'pause', activeIconColor: success, sourceRef: 'src/data/buttons.tsx:49' },
  { sourceId: '8', sourceLabel: 'Settings', variant: 'rotate', icon: 'settings', sourceRef: 'src/data/buttons.tsx:50' },
  { sourceId: '9', sourceLabel: 'Delete', variant: 'shake', icon: 'trash', iconColor: danger, sourceRef: 'src/data/buttons.tsx:51' },
  { sourceId: '10', sourceLabel: 'Subscribe', variant: 'ring', icon: 'bell', activeIcon: 'bell-ring', activeIconColor: warning, sourceRef: 'src/data/buttons.tsx:52' },
  { sourceId: '11', sourceLabel: 'Search', variant: 'morph', icon: 'search', activeIcon: 'close', sourceRef: 'src/data/buttons.tsx:53' },
  { sourceId: '12', sourceLabel: 'Theme', variant: 'morph', icon: 'moon', activeIcon: 'sun', activeIconColor: warning, sourceRef: 'src/data/buttons.tsx:54' },
  { sourceId: '13', sourceLabel: 'Microphone', variant: 'morph', icon: 'mic', activeIcon: 'mic-off', activeIconColor: danger, sourceRef: 'src/data/buttons.tsx:55' },
  { sourceId: '14', sourceLabel: 'Camera', variant: 'morph', icon: 'video', activeIcon: 'video-off', activeIconColor: danger, sourceRef: 'src/data/buttons.tsx:56' },
  { sourceId: '15', sourceLabel: 'Volume', variant: 'morph', icon: 'volume', activeIcon: 'volume-off', activeIconColor: muted, sourceRef: 'src/data/buttons.tsx:57' },
  { sourceId: '16', sourceLabel: 'Lock', variant: 'morph', icon: 'lock', activeIcon: 'unlock', activeIconColor: success, sourceRef: 'src/data/buttons.tsx:58' },
  { sourceId: '17', sourceLabel: 'Directory', variant: 'morph', icon: 'folder', activeIcon: 'folder-open', activeIconColor: primary, sourceRef: 'src/data/buttons.tsx:59' },
  { sourceId: '18', sourceLabel: 'Visibility', variant: 'morph', icon: 'eye', activeIcon: 'eye-off', activeIconColor: muted, sourceRef: 'src/data/buttons.tsx:60' },
  { sourceId: '19', sourceLabel: 'Save Later', variant: 'color-morph', icon: 'bookmark', activeIcon: 'bookmark', activeIconColor: primary, activeFill: true, sourceRef: 'src/data/buttons.tsx:61' },
  { sourceId: '20', sourceLabel: 'Like', variant: 'color-morph', icon: 'thumbs-up', activeIcon: 'thumbs-up', activeIconColor: primary, activeFill: true, sourceRef: 'src/data/buttons.tsx:62' },
  { sourceId: '21', sourceLabel: 'Download', variant: 'morph', icon: 'download', activeIcon: 'check', activeIconColor: success, holdDuration: 500, sourceRef: 'src/data/buttons.tsx:63' },
  { sourceId: '22', sourceLabel: 'Upload', variant: 'morph', icon: 'upload', activeIcon: 'check', activeIconColor: primary, holdDuration: 500, sourceRef: 'src/data/buttons.tsx:64' },
  { sourceId: '23', sourceLabel: 'Account', variant: 'morph', icon: 'user', activeIcon: 'user-check', activeIconColor: success, sourceRef: 'src/data/buttons.tsx:65' },
  { sourceId: '24', sourceLabel: 'Submit', variant: 'morph', icon: 'send', activeIcon: 'check', activeIconColor: success, holdDuration: 500, sourceRef: 'src/data/buttons.tsx:66' },
  { sourceId: '25', sourceLabel: 'Edit', variant: 'morph', icon: 'pen', activeIcon: 'check', activeIconColor: success, holdDuration: 500, sourceRef: 'src/data/buttons.tsx:67' },
  { sourceId: '26', sourceLabel: 'Network', variant: 'morph', icon: 'wifi', activeIcon: 'wifi-off', activeIconColor: danger, sourceRef: 'src/data/buttons.tsx:68' },
  { sourceId: '27', sourceLabel: 'Power', variant: 'morph', icon: 'battery', activeIcon: 'battery-charging', activeIconColor: success, sourceRef: 'src/data/buttons.tsx:69' },
  { sourceId: '28', sourceLabel: 'Expand', variant: 'morph', icon: 'maximize', activeIcon: 'minimize', sourceRef: 'src/data/buttons.tsx:70' },
  { sourceId: '29', sourceLabel: 'Reload', variant: 'rotate', icon: 'refresh', sourceRef: 'src/data/buttons.tsx:71' },
  { sourceId: '30', sourceLabel: 'Favorite', variant: 'color-morph', icon: 'star', activeIcon: 'star', activeIconColor: warning, activeFill: true, sourceRef: 'src/data/buttons.tsx:72' },
  { sourceId: '31', sourceLabel: 'Glare Shine', variant: 'glare', icon: 'star', sourceRef: 'src/data/buttons.tsx:73' },
  { sourceId: '32', sourceLabel: 'Text Reveal', variant: 'text-reveal', icon: 'arrow-right', sourceRef: 'src/data/buttons.tsx:74' },
  { sourceId: '33', sourceLabel: 'Magnetic Field', variant: 'magnetic', icon: 'github', sourceRef: 'src/data/buttons.tsx:75' },
  { sourceId: '34', sourceLabel: 'Expand Ring', variant: 'expand-ring', icon: 'link', sourceRef: 'src/data/buttons.tsx:76' },
  { sourceId: '35', sourceLabel: 'Focus Blur Links', variant: 'focus-blur', icon: 'link', sourceRef: 'src/data/buttons.tsx:77' },
]

export const MOTION_BUTTON_PRESETS: Readonly<Record<MotionButtonSourceId, MotionButtonCatalogEntry>>
  = Object.fromEntries(MOTION_BUTTON_CATALOG.map(entry => [entry.sourceId, entry])) as Record<MotionButtonSourceId, MotionButtonCatalogEntry>
