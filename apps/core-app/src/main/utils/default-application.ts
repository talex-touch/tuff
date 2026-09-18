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
  var workspace = $.NSWorkspace.sharedWorkspace;
  var fileUrl = $.NSURL.fileURLWithPath(argv[0]);

  function describe(appPath) {
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
    return { path: appPath, bundleId: bundleId, displayName: displayName };
  }

  var appUrl = workspace.URLForApplicationToOpenURL(fileUrl);
  if (!appUrl || appUrl.isNil()) return '';
  var target = describe(ObjC.unwrap(appUrl.path));

  // Every handler LaunchServices would offer, in its own ranking - the same order and the same
  // set the Finder's "Open With" submenu shows. Absent on older systems, where the default alone
  // is still a complete answer.
  var candidates = [];
  try {
    var urls = workspace.URLsForApplicationsToOpenURL(fileUrl);
    if (urls && !urls.isNil()) {
      var total = urls.count;
      for (var i = 0; i < total; i += 1) {
        var candidatePath = ObjC.unwrap(urls.objectAtIndex(i).path);
        if (candidatePath) candidates.push(describe(candidatePath));
      }
    }
  } catch (error) {}

  return JSON.stringify({
    path: target.path,
    bundleId: target.bundleId,
    displayName: target.displayName,
    candidates: candidates
  });
}`

export interface DefaultApplicationTarget {
  /** Absolute path of the application bundle that opens the file. */
  path: string
  /** Bundle identifier, empty when the bundle declares none. */
  bundleId: string
  /** `CFBundleDisplayName` / `CFBundleName`, empty when the bundle declares neither. */
  displayName: string
}

export interface DefaultApplicationResolution {
  /** What a double-click launches. */
  target: DefaultApplicationTarget
  /**
   * Every application LaunchServices would offer for this file, in its own ranking, including
   * `target`. Empty on a system whose AppKit lacks the query — the default alone is still a
   * complete answer, and the caller renders no alternatives rather than a wrong list.
   */
  candidates: DefaultApplicationTarget[]
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
): Promise<DefaultApplicationResolution | null> {
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

  let parsed: (Partial<DefaultApplicationTarget> & { candidates?: unknown }) | null
  try {
    parsed = JSON.parse(payload) as
      | (Partial<DefaultApplicationTarget> & { candidates?: unknown })
      | null
  } catch (error) {
    throw new DefaultApplicationResolveError('the OS association answer was not JSON', {
      cause: error
    })
  }
  if (!parsed || typeof parsed.path !== 'string' || !parsed.path) {
    throw new DefaultApplicationResolveError('the OS association answer named no application path')
  }

  const target = readTarget(parsed)
  if (!target) {
    throw new DefaultApplicationResolveError('the OS association answer named no application path')
  }

  // LaunchServices ranks the default first and repeats it in the candidate list. Deduplicating
  // by bundle path keeps the pane from drawing it twice, and a malformed entry is dropped rather
  // than thrown on: the default resolved, and losing one alternative is a smaller failure than
  // losing the answer the pane is built around.
  const candidates: DefaultApplicationTarget[] = [target]
  const seen = new Set<string>([target.path])

  if (Array.isArray(parsed.candidates)) {
    for (const value of parsed.candidates) {
      const candidate = readTarget(value)
      if (!candidate || seen.has(candidate.path)) continue
      seen.add(candidate.path)
      candidates.push(candidate)
    }
  }

  return { target, candidates }
}

function readTarget(value: unknown): DefaultApplicationTarget | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<DefaultApplicationTarget>
  if (typeof entry.path !== 'string' || !entry.path) return null
  return {
    path: entry.path,
    bundleId: typeof entry.bundleId === 'string' ? entry.bundleId : '',
    displayName: typeof entry.displayName === 'string' ? entry.displayName : ''
  }
}
