import type { AssistantGlobeKeyStatus } from '@talex-touch/utils/transport/events/assistant'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { shell } from 'electron'
import { createLogger } from '../../utils/logger'

const globeKeyLog = createLogger('GlobeKey')

/** "Press the Globe key to: Do Nothing" — the only value that leaves a lone Fn press to us. */
const FN_USAGE_DO_NOTHING = 0
const FN_USAGE_DOMAIN = 'com.apple.HIToolbox'
const FN_USAGE_KEY = 'AppleFnUsageType'
const KEYBOARD_SETTINGS_URL = 'x-apple.systempreferences:com.apple.Keyboard-Settings.extension'

/**
 * Whether macOS still runs its own action on a lone Fn press.
 *
 * Nothing in this process can stop that action from the event stream. It is fired by WindowServer
 * below the event tap, so both available tap policies were tried physically and the Emoji panel
 * opened either way: dropping the `FlagsChanged` event, and forwarding it with `MaskSecondaryFn`
 * cleared. This preference is the only switch there is.
 */
export async function readGlobeKeyStatus(): Promise<AssistantGlobeKeyStatus> {
  if (process.platform !== 'darwin') {
    return { applies: false, systemActionActive: false }
  }

  try {
    const { stdout } = await execFileSafe('defaults', ['read', FN_USAGE_DOMAIN, FN_USAGE_KEY])
    const usageType = Number.parseInt(stdout.trim(), 10)
    // An unreadable value is not a disabled one. Reporting "inactive" here would promise an
    // interception we cannot deliver, so anything we cannot positively read as Do Nothing keeps
    // the hint visible.
    return {
      applies: true,
      systemActionActive: !Number.isFinite(usageType) || usageType !== FN_USAGE_DO_NOTHING
    }
  } catch {
    // `defaults read` exits non-zero when the key was never written, which is the state every
    // Mac ships in: the system default action is live.
    return { applies: true, systemActionActive: true }
  }
}

/**
 * Hands the Fn key to voice input by writing the user's own "Press the Globe key to" preference.
 *
 * This takes effect immediately — no logout, no agent restart, no reboot. Every source that
 * describes this key says the opposite (nix-darwin, and two other Fn-triggered dictation apps all
 * tell their users to log out after a `defaults write`), and all of them are repeating each other:
 * writing it and pressing Fn on macOS 26 stopped the panel on the spot. Do not reintroduce a
 * logout prompt on the strength of those documents; press the key instead.
 *
 * The write is the user's explicit click, never automatic — this is a system-wide preference, and
 * the only other thing it costs them is the panel itself. The rest of the Fn layer is untouched.
 */
export async function disableGlobeKeyAction(): Promise<AssistantGlobeKeyStatus> {
  if (process.platform !== 'darwin') {
    return { applies: false, systemActionActive: false }
  }

  try {
    await execFileSafe('defaults', [
      'write',
      FN_USAGE_DOMAIN,
      FN_USAGE_KEY,
      '-int',
      String(FN_USAGE_DO_NOTHING)
    ])
  } catch (error) {
    globeKeyLog.warn('Failed to write the Globe key preference', { error })
  }

  // Report what the system says now rather than what the write returned. A write that silently
  // did nothing must leave the hint on screen, so the user can still take the manual route.
  return await readGlobeKeyStatus()
}

/** Opens the Keyboard pane, where "Press the Globe key to" lives. */
export async function openKeyboardSettings(): Promise<boolean> {
  if (process.platform !== 'darwin') return false

  try {
    await shell.openExternal(KEYBOARD_SETTINGS_URL)
    return true
  } catch (error) {
    globeKeyLog.warn('Failed to open the Keyboard settings pane', { error })
    return false
  }
}
