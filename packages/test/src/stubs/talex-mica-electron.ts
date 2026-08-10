/**
 * Resolution target for `talex-mica-electron` inside this package.
 *
 * A CJS package whose main.js calls `require('electron')` at module scope. Two
 * things make it unusable here: packages/test cannot resolve it, so a
 * vi.mock('talex-mica-electron', ...) in a test never binds (see
 * src/stubs/electron.ts for why); and inlining it does not help either, because
 * vite's CJS interop routes its `require` through Node rather than the alias map,
 * so it still fails to find electron under pnpm's strict layout.
 *
 * The package applies Windows Mica/Acrylic window effects. It has nothing to say
 * on any other platform and nothing at all outside a real Electron runtime, so
 * the stub reports "not Windows 11" and hands back inert shapes -- the same
 * answers core-app's own suites give it via vi.mock (see
 * apps/core-app/src/main/channel/common.test.ts).
 */

export const IS_WINDOWS_11 = false
export const WIN10 = false

export class MicaBrowserWindow {}

export function useMicaElectron(_path?: string): void {}
export function setMicaEffect(): void {}
export function disableMicaEffect(): void {}

export default { IS_WINDOWS_11, WIN10, MicaBrowserWindow, useMicaElectron, setMicaEffect, disableMicaEffect }
