import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** System JXA host. Absolute so a hijacked PATH cannot substitute another binary. */
const OSASCRIPT_PATH = '/usr/bin/osascript'
const RESOLVE_TIMEOUT_MS = 4000
const MAX_PATH_LENGTH = 4096

/**
 * LaunchServices is the only authority on "which app opens this file" — it is also what Finder
 * and `open(1)` consult, so it cannot be recomputed from the file extension in JS (`duti`, the
 * LaunchServices plist and each bundle's declared document types all take part, and user
 * overrides live in a binary plist).
 *
 * JXA is used rather than a native addon because the app already ships Electron's OSA bridge:
 * calling into AppKit from `osascript` costs one short-lived process and no build step, and it
 * needs no Automation (TCC) grant — nothing here scripts another application.
 *
 * `argv[0]` is the file path, passed as one argv entry (never interpolated into the script), so a
 * path cannot inject script source.
 */
const JXA_RESOLVE_SOURCE = `function run(argv) {
  ObjC.import('AppKit');
  ObjC.import('Foundation');
  var fileUrl = $.NSURL.fileURLWithPath(argv[0]);
  var appUrl = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(fileUrl);
  if (!appUrl || appUrl.isNil()) return '';
  var appPath = ObjC.unwrap(appUrl.path);
  var bundleId = '';
  var displayName = '';
  try {
    var bundle = $.NSBundle.bundleWithPath(appPath);
    if (bundle && !bundle.isNil()) {
      bundleId = ObjC.unwrap(bundle.bundleIdentifier) || '';
      var infoName = bundle.objectForInfoDictionaryKey('CFBundleDisplayName');
      var shortName = bundle.objectForInfoDictionaryKey('CFBundleName');
      var chosen = (infoName && !infoName.isNil()) ? infoName : shortName;
      if (chosen && !chosen.isNil()) displayName = ObjC.unwrap(chosen) || '';
    }
  } catch (error) {}
  return JSON.stringify({ path: appPath, bundleId: bundleId, displayName: displayName });
}`

export interface DefaultApplicationTarget {
  /** Absolute path of the application bundle that opens the file. */
  path: string
  /** Bundle identifier, empty when the bundle declares none. */
  bundleId: string
  /** `CFBundleDisplayName` / `CFBundleName`, empty when the bundle declares neither. */
  displayName: string
}

/**
 * The application the OS associates with `filePath`, or null when the platform cannot answer.
 *
 * Never throws: an unsupported platform, a missing file, an association the OS resolves to
 * nothing, and a failed `osascript` all report `null` so the caller keeps its fallback.
 */
export async function resolveDefaultApplicationTarget(
  filePath: string
): Promise<DefaultApplicationTarget | null> {
  if (process.platform !== 'darwin') return null
  if (typeof filePath !== 'string') return null

  const trimmed = filePath.trim()
  if (!trimmed || trimmed.length > MAX_PATH_LENGTH || !path.isAbsolute(trimmed)) return null

  try {
    await fs.access(trimmed)
  } catch {
    return null
  }

  try {
    const { stdout } = await execFileAsync(
      OSASCRIPT_PATH,
      ['-l', 'JavaScript', '-e', JXA_RESOLVE_SOURCE, trimmed],
      {
        timeout: RESOLVE_TIMEOUT_MS,
        maxBuffer: 64 * 1024
      }
    )

    const payload = stdout.trim()
    if (!payload) return null

    const parsed = JSON.parse(payload) as Partial<DefaultApplicationTarget>
    if (typeof parsed.path !== 'string' || !parsed.path) return null

    return {
      path: parsed.path,
      bundleId: typeof parsed.bundleId === 'string' ? parsed.bundleId : '',
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : ''
    }
  } catch {
    return null
  }
}
