/**
 * Common icon constants for UnoCSS preset-icons
 *
 * @description
 * Defines commonly used icon class names following UnoCSS icones convention.
 * Icons are organized by category for easy discovery and consistent usage.
 *
 * Usage:
 * ```vue
 * <i :class="TuffIcons.Search" />
 * <span :class="TuffIcons.Settings" />
 * ```
 *
 * @see https://icones.js.org for icon explorer
 * @see https://unocss.dev/presets/icons for UnoCSS icons preset
 */

import type { ITuffIcon } from '../types/icon'
export * from './svg'

/**
 * Create a class-type ITuffIcon from an icon class name
 */
export function classIcon(iconClass: string): ITuffIcon {
  return {
    type: 'class',
    value: iconClass
  }
}

/**
 * Common icon constants using UnoCSS class names
 *
 * @description
 * Icon naming convention: i-{collection}-{icon-name}
 * - ri: Remix Icon (outline style)
 * - carbon: Carbon Design System icons
 * - simple-icons: Brand/logo icons
 */
export const TuffIcons = {
  //============ Navigation ============
  Home: 'i-ri-home-line',
  HomeFill: 'i-ri-home-fill',
  Back: 'i-ri-arrow-left-line',
  Forward: 'i-ri-arrow-right-line',
  Up: 'i-ri-arrow-up-line',
  Down: 'i-ri-arrow-down-line',
  Menu: 'i-ri-menu-line',
  MenuFold: 'i-ri-menu-fold-line',
  MenuUnfold: 'i-ri-menu-unfold-line',

  // ============ Actions ============
  Search: 'i-ri-search-line',
  SearchFill: 'i-ri-search-fill',
  Add: 'i-ri-add-line',
  AddCircle: 'i-ri-add-circle-line',
  Remove: 'i-ri-subtract-line',
  Delete: 'i-ri-delete-bin-line',
  Edit: 'i-ri-edit-line',
  Copy: 'i-ri-file-copy-line',
  Paste: 'i-ri-clipboard-line',
  Cut: 'i-ri-scissors-line',
  Save: 'i-ri-save-line',
  Download: 'i-ri-download-line',
  Upload: 'i-ri-upload-line',Refresh: 'i-ri-refresh-line',
  Sync: 'i-ri-loop-left-line',

  // ============ Status ============
  Check: 'i-ri-check-line',
  CheckCircle: 'i-ri-checkbox-circle-line',
  CheckCircleFill: 'i-ri-checkbox-circle-fill',
  Close: 'i-ri-close-line',
  CloseCircle: 'i-ri-close-circle-line',
  CloseCircleFill: 'i-ri-close-circle-fill',
  Warning: 'i-ri-error-warning-line',
  WarningFill: 'i-ri-error-warning-fill',
  Error: 'i-ri-close-circle-line',
  ErrorFill: 'i-ri-close-circle-fill',
  Info: 'i-ri-information-line',
  InfoFill: 'i-ri-information-fill',
  Question: 'i-ri-question-line',
  QuestionFill: 'i-ri-question-fill',

  // ============ Files & Folders ============
  File: 'i-ri-file-line',
  FileFill: 'i-ri-file-fill',
  FileText: 'i-ri-file-text-line',
  FileCode: 'i-ri-file-code-line',
  FileImage: 'i-ri-image-line',
  FileVideo: 'i-ri-video-line',
  FileAudio: 'i-ri-music-line',
  FilePdf: 'i-ri-file-pdf-line',
  FileZip: 'i-ri-file-zip-line',

  //============ Folders ============
  Folder: 'i-ri-folder-line',
  FolderFill: 'i-ri-folder-fill',
  FolderOpen: 'i-ri-folder-open-line',
  FolderAdd: 'i-ri-folder-add-line',

  // ============ UI Elements ============
  Settings: 'i-ri-settings-3-line',
  SettingsFill: 'i-ri-settings-3-fill',
  User: 'i-ri-user-line',
  UserFill: 'i-ri-user-fill',
  Users: 'i-ri-group-line',
  Notification: 'i-ri-notification-line',
  NotificationFill: 'i-ri-notification-fill',
  Bell: 'i-ri-notification-3-line',
  Star: 'i-ri-star-line',
  StarFill: 'i-ri-star-fill',
  Heart: 'i-ri-heart-line',
  HeartFill: 'i-ri-heart-fill',
  Bookmark: 'i-ri-bookmark-line',
  BookmarkFill: 'i-ri-bookmark-fill',
  Pin: 'i-ri-pushpin-line',
  PinFill: 'i-ri-pushpin-fill',
  Lock: 'i-ri-lock-line',
  LockFill: 'i-ri-lock-fill',
  Unlock: 'i-ri-lock-unlock-line',
  Eye: 'i-ri-eye-line',
  EyeOff: 'i-ri-eye-off-line',

  // ============ Media Controls ============
  Play: 'i-ri-play-line',
  PlayFill: 'i-ri-play-fill',
  Pause: 'i-ri-pause-line',
  PauseFill: 'i-ri-pause-fill',
  Stop: 'i-ri-stop-line',
  SkipBack: 'i-ri-skip-back-line',
  SkipForward: 'i-ri-skip-forward-line',
  Volume: 'i-ri-volume-up-line',
  VolumeMute: 'i-ri-volume-mute-line',
  Fullscreen: 'i-ri-fullscreen-line',
  ExitFullscreen: 'i-ri-fullscreen-exit-line',

  // ============ Communication ============
  Mail: 'i-ri-mail-line',
  MailFill: 'i-ri-mail-fill',
  Chat: 'i-ri-chat-3-line',
  ChatFill: 'i-ri-chat-3-fill',
  Send: 'i-ri-send-plane-line',
  Share: 'i-ri-share-line',
  Link: 'i-ri-link',
  Unlink: 'i-ri-link-unlink',
  ExternalLink: 'i-ri-external-link-line',

  // ============ Data & Analytics ============
  Chart: 'i-ri-bar-chart-line',
  ChartPie: 'i-ri-pie-chart-line',
  Dashboard: 'i-ri-dashboard-line',
  Database: 'i-ri-database-line',
  Cloud: 'i-ri-cloud-line',
  CloudUpload: 'i-ri-cloud-upload-line',
  CloudDownload: 'i-ri-cloud-download-line',

  // ============ Development ============
  Code: 'i-ri-code-line',
  Terminal: 'i-ri-terminal-line',
  Bug: 'i-ri-bug-line',
  Git: 'i-ri-git-branch-line',
  Cpu: 'i-ri-cpu-line',
  Plugin: 'i-ri-plug-line',
  Api: 'i-ri-code-s-slash-line',

  // ============ System ============
  Apps: 'i-ri-apps-line',
  AppsFill: 'i-ri-apps-fill',
  Grid: 'i-ri-grid-line',
  List: 'i-ri-list-unordered',
  Filter: 'i-ri-filter-line',
  Sort: 'i-ri-sort-asc',
  More: 'i-ri-more-line',
  MoreVertical: 'i-ri-more-2-line',
  Drag: 'i-ri-drag-move-line',
  Expand: 'i-ri-expand-diagonal-line',
  Collapse: 'i-ri-contract-left-right-line',

  // ============ Time ============
  Time: 'i-ri-time-line',
  Calendar: 'i-ri-calendar-line',
  CalendarEvent: 'i-ri-calendar-event-line',
  History: 'i-ri-history-line',
  Timer: 'i-ri-timer-line',

  // ============ Theme ============
  Sun: 'i-ri-sun-line',
  Moon: 'i-ri-moon-line',
  Palette: 'i-ri-palette-line',

  // ============ Misc ============
  Rocket: 'i-ri-rocket-line',
  RocketFill: 'i-ri-rocket-fill',
  Magic: 'i-ri-magic-line',
  Lightbulb: 'i-ri-lightbulb-line',
  Award: 'i-ri-award-line',
  Trophy: 'i-ri-trophy-line',
  Gift: 'i-ri-gift-line',
  Fire: 'i-ri-fire-line',
  Sparkles: 'i-ri-sparkles-line',
  Loader: 'i-ri-loader-4-line',
  Loading: 'i-ri-loader-line'
} as const

/**
 * Icon type derived from TuffIcons keys
 */
export type TuffIconKey = keyof typeof TuffIcons

/**
 * Icon class type derived from TuffIcons values
 */
export type TuffIconClass = (typeof TuffIcons)[TuffIconKey]

/**
 * Get ITuffIcon from icon key
 */
export function getIcon(key: TuffIconKey): ITuffIcon {
  return classIcon(TuffIcons[key])
}

/**
 * Platform-specific application icons (Carbon icons)
 */
export const AppIcons = {
  // macOS
  Finder: 'i-carbon-folder',
  Safari: 'i-simple-icons-safari',
  Terminal: 'i-carbon-terminal',
  Xcode: 'i-simple-icons-xcode',

  // Windows
  Explorer: 'i-carbon-folder',
  Edge: 'i-simple-icons-microsoftedge',
  PowerShell: 'i-carbon-terminal',
  VisualStudio: 'i-simple-icons-visualstudio',

  // Cross-platform
  Chrome: 'i-simple-icons-googlechrome',
  Firefox: 'i-simple-icons-firefox',
  VSCode: 'i-simple-icons-visualstudiocode',
  Slack: 'i-simple-icons-slack',
  Discord: 'i-simple-icons-discord',
  Spotify: 'i-simple-icons-spotify',
  GitHub: 'i-simple-icons-github',
  GitLab: 'i-simple-icons-gitlab',
  Docker: 'i-simple-icons-docker',
  Figma: 'i-simple-icons-figma',
  Notion: 'i-simple-icons-notion'
} as const

/**
 * App icon type
 */
export type AppIconKey = keyof typeof AppIcons