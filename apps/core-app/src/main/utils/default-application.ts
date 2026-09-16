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
 * The OS could not be asked, or could not answer coherently.
 *
 * Thrown instead of folded into `null`: `null` is the OS's own answer that nothing opens this
 * file, and a caller that cannot tell the two apart reports success with no application — a
 * failure disguised as an answer, with no report behind it. The transport handler converts a
 * throw into `FILE_INDEX_DEFAULT_APPLICATION_FAILED` plus a degraded operational report.
 */
export class DefaultApplicationResolveError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DefaultApplicationResolveError'
  }
}

/**
 * The application the OS associates with `filePath`, or null when the OS associates none.
 *
 * `null` is reserved for answers: an unsupported platform, a path that is not a usable absolute
 * path, a file the index no longer has, and a LaunchServices answer that names no application.
 * Everything that means "the question could not be asked" (an unreadable file, a `osascript`
 * that fails or times out, a reply that is not the expected JSON) throws
 * `DefaultApplicationResolveError` so the caller can report it.
 */
export async function resolveDefaultApplicationTarget(
  filePath: string
): Promise<DefaultApplicationTarget | null> {
  if (process.platform !== 'darwin') return null
  if (typeof filePath !== 'string') return null

  // Whitespace is a legal character in a file name, so it is trimmed only to detect an empty
  // value: the path handed to `fs.access` and to LaunchServices must be the one the index holds.
  if (!filePath.trim() || filePath.length > MAX_PATH_LENGTH || !path.isAbsolute(filePath))
    return null

  try {
    await fs.access(filePath)
  } catch (error) {
    // A file the index no longer has is an answer ("nothing opens it"); any other errno means the
    // question could not be asked.
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw new DefaultApplicationResolveError('the indexed file could not be read', { cause: error })
  }

  let stdout: string
  try {
    stdout = (
      await execFileAsync(
        OSASCRIPT_PATH,
        ['-l', 'JavaScript', '-e', JXA_RESOLVE_SOURCE, filePath],
        {
          timeout: RESOLVE_TIMEOUT_MS,
          maxBuffer: 64 * 1024
        }
      )
    ).stdout
  } catch (error) {
    throw new DefaultApplicationResolveError('the OS association query failed', { cause: error })
  }

  const payload = stdout.trim()
  // The script answers an empty string when LaunchServices names no application. That is an
  // answer, and the caller's fallback is the correct outcome for it.
  if (!payload) return null

  let parsed: Partial<DefaultApplicationTarget> | null
  try {
    parsed = JSON.parse(payload) as Partial<DefaultApplicationTarget> | null
  } catch (error) {
    throw new DefaultApplicationResolveError('the OS association answer was not JSON', {
      cause: error
    })
  }
  if (!parsed || typeof parsed.path !== 'string' || !parsed.path) {
    throw new DefaultApplicationResolveError('the OS association answer named no application path')
  }

  return {
    path: parsed.path,
    bundleId: typeof parsed.bundleId === 'string' ? parsed.bundleId : '',
    displayName: typeof parsed.displayName === 'string' ? parsed.displayName : ''
  }
}
