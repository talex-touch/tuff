/**
 * Icon classes of the built-in Flow targets, for the UnoCSS safelist in `uno.config.ts`.
 *
 * Main declares each target's icon as `ri:<name>`: QuickOps in `main/modules/quick-ops/index.ts`,
 * the native share targets in `main/modules/flow-bus/native-share.ts`, and the `pluginIcon` each
 * registers under, there and in `main/modules/flow-bus/module.ts`. The ⌘K card's Flow page draws
 * them through `normalizeCoreBoxIcon`, which turns `ri:<name>` into the class `i-ri-<name>`. UnoCSS
 * extracts classes from `.vue` sources but never from `.ts` modules, and these names exist only in
 * main-process code, so a class is generated only if it is listed here; otherwise the target's
 * row draws an empty box.
 *
 * A literal list, because the config loader cannot evaluate main-process modules: nothing here
 * may import anything. `flow-target-icons.test.ts` reads the three sources and fails when a target
 * declares an icon missing here, or one the installed Remix Icon set does not have.
 */
export const BUILTIN_FLOW_TARGET_ICON_CLASSES: readonly string[] = Object.freeze([
  // QuickOps: its `pluginIcon`, which is also its first target's icon, then its targets in
  // declaration order.
  'i-ri-tools-line',
  'i-ri-pulse-line',
  'i-ri-stop-circle-line',
  'i-ri-computer-line',
  'i-ri-stethoscope-line',
  'i-ri-hard-drive-line',
  'i-ri-folder-chart-line',
  'i-ri-router-line',
  'i-ri-battery-charge-line',
  'i-ri-exchange-line',
  'i-ri-global-line',
  'i-ri-server-line',
  'i-ri-file-shield-line',
  'i-ri-file-code-line',
  'i-ri-download-line',
  'i-ri-folder-line',
  'i-ri-route-line',
  'i-ri-file-text-line',
  'i-ri-folder-add-line',
  'i-ri-moon-clear-line',
  'i-ri-shut-down-line',
  'i-ri-sun-line',
  'i-ri-cup-line',
  'i-ri-timer-line',
  'i-ri-pause-circle-line',
  'i-ri-play-circle-line',
  'i-ri-timer-flash-line',
  'i-ri-fullscreen-line',
  'i-ri-close-circle-line',
  'i-ri-flag-line',
  'i-ri-notification-3-line',
  'i-ri-clipboard-line',
  'i-ri-text',
  'i-ri-folder-open-line',
  // Native share: the `pluginIcon` the flow bus registers it under, then every platform's targets.
  'i-ri-share-forward-line',
  'i-ri-share-line',
  'i-ri-wireless-charging-line',
  'i-ri-mail-line',
  'i-ri-message-3-line'
])
