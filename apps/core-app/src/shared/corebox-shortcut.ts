/**
 * The global shortcut that opens CoreBox, shared by the module that binds it and the surfaces
 * that print it (tray, sidebar, onboarding, the main window's command window). Written once so the
 * key a hint teaches cannot drift from the key that is bound.
 */
export const COREBOX_TOGGLE_SHORTCUT_ID = 'core.box.toggle'

/**
 * ⌥Space on macOS, Alt+Space elsewhere: the launcher convention (Raycast, PowerToys Run).
 *
 * No other key stands in when it cannot be had: CoreBox is then left without a key, and the user
 * is told once per launch. Windows refuses a key another app holds (PowerToys Run ships on
 * Alt+Space). macOS does not: Raycast or Alfred holding ⌥Space leaves Tuff's registration
 * succeeding, so nothing reports the overlap there.
 */
export const COREBOX_TOGGLE_DEFAULT_ACCELERATOR = 'Alt+Space'

/**
 * Earlier defaults. A system-authored binding still on one of these was never chosen by the user,
 * so it moves to the current default; any other value is the user's and is left alone.
 */
export const COREBOX_TOGGLE_LEGACY_DEFAULT_ACCELERATORS: readonly string[] = ['CommandOrControl+E']
