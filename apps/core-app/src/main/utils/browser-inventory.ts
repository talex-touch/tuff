import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Absolute so a hijacked PATH cannot substitute another binary. */
const OSASCRIPT_PATH = '/usr/bin/osascript'
const POWERSHELL_RELATIVE_PATH = ['System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe']
const DISCOVERY_TIMEOUT_MS = 4000
const MAX_OUTPUT_BYTES = 256 * 1024
const MAX_CANDIDATES = 32
const MAX_ID_LENGTH = 24
const MAX_NAME_LENGTH = 64
const MAX_PATH_LENGTH = 4096

const BROWSER_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const ID_SANITIZE_PATTERN = /[^a-z0-9-]+/g

export interface NativeBrowserCandidate {
  readonly id: string
  readonly name: string
  readonly path: string
}

export interface NativeBrowserDiscoveryOptions {
  readonly platform: NodeJS.Platform
  readonly environment: Readonly<Record<string, string | undefined>>
}

/**
 * Bundle identifiers whose browser identity must survive across machines; the value is the public
 * browser id the plugin contract already exposes. Anything else falls back to a derived id.
 */
const KNOWN_BUNDLE_IDS: Readonly<Record<string, string>> = Object.freeze({
  'com.apple.safari': 'safari',
  'com.google.chrome': 'chrome',
  'com.microsoft.edgemac': 'edge',
  'org.mozilla.firefox': 'firefox',
  'com.brave.browser': 'brave',
  'com.operasoftware.opera': 'opera',
  'com.vivaldi.vivaldi': 'vivaldi',
  'company.thebrowser.browser': 'arc'
})

/**
 * Executables that are browsers even when they only appear through the weaker `App Paths` source.
 * `StartMenuInternet` is the OS's own browser registry and needs no allowlist; this table only
 * keeps "an executable registered somewhere for something" from being read as a browser.
 */
const KNOWN_WINDOWS_EXECUTABLES: Readonly<Record<string, true>> = Object.freeze({
  'chrome.exe': true,
  'msedge.exe': true,
  'firefox.exe': true,
  'brave.exe': true,
  'opera.exe': true,
  'launcher.exe': true,
  'vivaldi.exe': true,
  'arc.exe': true,
  'thorium.exe': true,
  'librewolf.exe': true,
  'waterfox.exe': true,
  'brave-browser.exe': true
})

/**
 * One LaunchServices query: every application the OS would open an `https` URL with, in the ranking
 * the Finder's "Open With" uses — the same set the previous fixed inventory guessed at with vendor
 * install paths. One short-lived `osascript` per refresh.
 *
 * That ranking alone is not a browser list: a downloader (`Downie`, FDM) and `ChatGPT` answer it
 * without declaring any HTML type, and a terminal (iTerm, cmux) answers it while only ever running a
 * shell. Each candidate therefore also has to declare a real HTML document type in its
 * `CFBundleDocumentTypes` and must not claim `CFBundleTypeRole` `Shell`.
 * No argv and no temporary file are involved: the script takes no input.
 */
const JXA_DISCOVERY_SOURCE = `function run() {
  ObjC.import('AppKit');
  ObjC.import('Foundation');
  var workspace = $.NSWorkspace.sharedWorkspace;
  var httpsUrl = $.NSURL.URLWithString('https://example.com/');

  var handlers = [];
  try {
    var urls = workspace.URLsForApplicationsToOpenURL(httpsUrl);
    if (urls && !urls.isNil()) {
      var total = urls.count;
      for (var i = 0; i < total; i += 1) {
        var value = ObjC.unwrap(urls.objectAtIndex(i).path);
        if (value) handlers.push(String(value));
      }
    }
  } catch (error) {}

  function describe(appPath) {
    var bundleId = '';
    var name = '';
    var declaresHtml = false;
    var shellRole = false;
    try {
      var bundle = $.NSBundle.bundleWithPath(appPath);
      if (bundle && !bundle.isNil()) {
        var identifier = bundle.bundleIdentifier;
        if (identifier && !identifier.isNil()) bundleId = String(ObjC.unwrap(identifier) || '');
        var display = bundle.objectForInfoDictionaryKey('CFBundleDisplayName');
        var short = bundle.objectForInfoDictionaryKey('CFBundleName');
        var chosen = (display && !display.isNil()) ? display : short;
        if (chosen && !chosen.isNil()) name = String(ObjC.unwrap(chosen) || '');
        var types = bundle.objectForInfoDictionaryKey('CFBundleDocumentTypes');
        if (types && !types.isNil()) {
          var total = types.count;
          for (var i = 0; i < total; i += 1) {
            var entry = types.objectAtIndex(i);
            var role = entry.objectForKey('CFBundleTypeRole');
            if (role && !role.isNil() && String(ObjC.unwrap(role)) === 'Shell') shellRole = true;
            var contentTypes = entry.objectForKey('LSItemContentTypes');
            if (contentTypes && !contentTypes.isNil()) {
              for (var j = 0; j < contentTypes.count; j += 1) {
                var contentType = String(ObjC.unwrap(contentTypes.objectAtIndex(j)) || '').toLowerCase();
                if (contentType === 'public.html' || contentType === 'public.xhtml' || contentType === 'org.ietf.mhtml') {
                  declaresHtml = true;
                }
              }
            }
            var extensions = entry.objectForKey('CFBundleTypeExtensions');
            if (extensions && !extensions.isNil()) {
              for (var k = 0; k < extensions.count; k += 1) {
                var extension = String(ObjC.unwrap(extensions.objectAtIndex(k)) || '').toLowerCase();
                if (extension === 'html' || extension === 'htm' || extension === 'xhtml') {
                  declaresHtml = true;
                }
              }
            }
          }
        }
      }
    } catch (error) {}
    return {
      path: appPath,
      bundleId: bundleId,
      name: name,
      declaresHtml: declaresHtml,
      shellRole: shellRole
    };
  }

  var output = [];
  var seen = {};
  for (var i = 0; i < handlers.length; i += 1) {
    var appPath = handlers[i];
    if (seen[appPath]) continue;
    seen[appPath] = true;
    output.push(describe(appPath));
  }
  return JSON.stringify(output);
}`

/**
 * The Windows side of the same question, asked of the OS registry instead of the vendor install
 * paths the fixed inventory hard-codes: `Clients\StartMenuInternet` is the browser list Windows
 * itself maintains, and `App Paths` adds executables registered by their vendor.
 */
const POWERSHELL_DISCOVERY_SOURCE = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '$browsers = @()',
  '$shellRoots = @(',
  "  'HKLM:\\SOFTWARE\\Clients\\StartMenuInternet\\*',",
  "  'HKCU:\\SOFTWARE\\Clients\\StartMenuInternet\\*',",
  "  'HKLM:\\SOFTWARE\\WOW6432Node\\Clients\\StartMenuInternet\\*'",
  ')',
  'foreach ($root in $shellRoots) {',
  '  Get-ChildItem -Path $root -ErrorAction SilentlyContinue | ForEach-Object {',
  '    $key = $_',
  '    $command = ""',
  "    $open = Get-Item -Path (Join-Path $key.PSPath 'shell\\open\\command') -ErrorAction SilentlyContinue",
  '    if ($open) { $command = [string]$open.GetValue("") }',
  '    $name = [string]$key.GetValue("")',
  "    $capabilities = Get-Item -Path (Join-Path $key.PSPath 'Capabilities') -ErrorAction SilentlyContinue",
  '    if ($capabilities) {',
  '      $applicationName = [string]$capabilities.GetValue("ApplicationName")',
  '      if ($applicationName) { $name = $applicationName }',
  '    }',
  '    $browsers += [PSCustomObject]@{',
  "      Source = 'start-menu-internet'",
  '      Identity = [string]$key.PSChildName',
  '      Name = $name',
  '      Command = $command',
  '    }',
  '  }',
  '}',
  '$appPathRoots = @(',
  "  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*',",
  "  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*',",
  "  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*'",
  ')',
  'foreach ($root in $appPathRoots) {',
  '  Get-ChildItem -Path $root -ErrorAction SilentlyContinue | ForEach-Object {',
  '    $browsers += [PSCustomObject]@{',
  "      Source = 'app-paths'",
  '      Identity = [string]$_.PSChildName',
  '      Name = ""',
  '      Command = [string]$_.GetValue("")',
  '    }',
  '  }',
  '}',
  '@($browsers) | ConvertTo-Json -Compress'
].join('\n')

/**
 * Windows executable names whose browser identity is stable and already public. The value is the id
 * the plugin contract exposes; an executable that is not listed falls back to a derived id.
 */
const KNOWN_WINDOWS_IDS: Readonly<Record<string, string>> = Object.freeze({
  'chrome.exe': 'chrome',
  'msedge.exe': 'edge',
  'firefox.exe': 'firefox',
  'brave.exe': 'brave',
  'opera.exe': 'opera',
  'vivaldi.exe': 'vivaldi',
  'arc.exe': 'arc'
})

/**
 * Turn an identity string (`com.citrolabs.ego.lite`, `Google Chrome`, `chrome.exe`) into a browser
 * id that satisfies the capability's `^[a-z][a-z0-9-]{0,31}$` contract, or an empty string when
 * nothing usable remains.
 */
function deriveBrowserId(identity: string): string {
  const segments = identity
    .trim()
    .replace(/\.(?:app|exe)$/i, '')
    .toLowerCase()
    .split('.')
    .filter((segment) => segment.length > 0)
  if (segments.length === 0) return ''
  // A reverse-DNS identity spends its first component on the top level domain and its second on the
  // vendor; the product name and its qualifiers are what identify the browser.
  const withoutTopLevel =
    segments.length > 1 && segments[0].length <= 4 ? segments.slice(1) : segments
  const product = withoutTopLevel.length > 1 ? withoutTopLevel.slice(1) : withoutTopLevel
  const sanitized = (product.length > 0 ? product : segments)
    .join('-')
    .replace(ID_SANITIZE_PATTERN, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ID_LENGTH)
    .replace(/-+$/g, '')
  return /^[a-z][a-z0-9-]{0,31}$/.test(sanitized) ? sanitized : ''
}

/** A candidate is only usable if every field is bounded and the id is a legal browser id. */
function isSafeCandidate(pathValue: unknown, nameValue: unknown, id: string): boolean {
  return (
    typeof pathValue === 'string' &&
    pathValue.length > 0 &&
    pathValue.length <= MAX_PATH_LENGTH &&
    !/[\0\r\n]/.test(pathValue) &&
    BROWSER_ID_PATTERN.test(id) &&
    typeof nameValue === 'string' &&
    nameValue.length > 0
  )
}

/** Display names come from the bundle or, failing that, the application's file name. */
function normalizeName(value: unknown, fallbackPath: string): string {
  const raw =
    typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : path.basename(fallbackPath).replace(/\.(?:app|exe)$/i, '')
  return raw.slice(0, MAX_NAME_LENGTH)
}

function parseJsonEntries(stdout: string): readonly unknown[] {
  const payload = stdout.trim()
  if (!payload) return []
  try {
    const parsed: unknown = JSON.parse(payload)
    if (Array.isArray(parsed)) return parsed
    return parsed && typeof parsed === 'object' ? [parsed] : []
  } catch {
    return []
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

/**
 * A Windows shell command is `"C:\...\chrome.exe" --single-argument %1`; the executable is the
 * quoted or leading token. Anything that is not one absolute `.exe` is dropped rather than guessed.
 */
function readWindowsExecutable(command: string): string {
  const trimmed = command.trim()
  const match = /^(?:"([^"]+)"|(\S+))/.exec(trimmed)
  const raw =
    path.win32.isAbsolute(trimmed) && path.win32.extname(trimmed).toLowerCase() === '.exe'
      ? trimmed
      : match
        ? (match[1] ?? match[2] ?? '')
        : ''
  if (!raw) return ''
  const normalized = path.win32.normalize(raw)
  if (!path.win32.isAbsolute(normalized)) return ''
  if (path.win32.extname(normalized).toLowerCase() !== '.exe') return ''
  if (/[\0\r\n]/.test(normalized) || normalized.length > MAX_PATH_LENGTH) return ''
  return normalized
}

function collectWindowsCandidates(entries: readonly unknown[]): NativeBrowserCandidate[] {
  const candidates: NativeBrowserCandidate[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const record = readRecord(entry)
    if (!record) continue
    const executable = readWindowsExecutable(readString(record, 'Command'))
    if (!executable || seen.has(executable)) continue
    const fileName = path.win32.basename(executable).toLowerCase()
    const isRegisteredBrowser = readString(record, 'Source') === 'start-menu-internet'
    if (!isRegisteredBrowser && KNOWN_WINDOWS_EXECUTABLES[fileName] !== true) continue
    const id = KNOWN_WINDOWS_IDS[fileName] ?? deriveBrowserId(fileName)
    const name = normalizeName(readString(record, 'Name'), executable)
    if (!isSafeCandidate(executable, name, id)) continue
    seen.add(executable)
    candidates.push({ id, name, path: executable })
  }
  return candidates
}

/**
 * The native browser inventory of this machine: the applications the OS itself would use to open an
 * `https` URL and that declare a real HTML document type (downloaders and terminals are excluded).
 * Each path carries native identity that main validates separately.
 *
 * Returns OS-ranked candidates with ids included; the caller drops candidates it cannot stat and
 * resolves final id uniqueness. Throws when the OS query itself fails, so a caller that owns a
 * fixed fallback can tell "this machine has no browsers" from "the question could not be asked".
 */
export async function discoverNativeBrowsers(
  options: NativeBrowserDiscoveryOptions
): Promise<readonly NativeBrowserCandidate[]> {
  const candidates =
    options.platform === 'darwin'
      ? await discoverDarwinCandidates()
      : options.platform === 'win32'
        ? await discoverWindowsCandidates(options.environment)
        : []
  return Object.freeze(candidates.slice(0, MAX_CANDIDATES))
}

async function discoverDarwinCandidates(): Promise<NativeBrowserCandidate[]> {
  const { stdout } = await execFileAsync(
    OSASCRIPT_PATH,
    ['-l', 'JavaScript', '-e', JXA_DISCOVERY_SOURCE],
    { timeout: DISCOVERY_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES }
  )
  const candidates: NativeBrowserCandidate[] = []
  for (const entry of parseJsonEntries(stdout)) {
    const record = readRecord(entry)
    if (!record) continue
    if (record.declaresHtml !== true || record.shellRole === true) continue
    const appPath = readString(record, 'path')
    const bundleId = readString(record, 'bundleId')
    const id =
      KNOWN_BUNDLE_IDS[bundleId.toLowerCase()] ||
      deriveBrowserId(bundleId) ||
      deriveBrowserId(path.basename(appPath))
    const name = normalizeName(readString(record, 'name'), appPath)
    if (!isSafeCandidate(appPath, name, id)) continue
    candidates.push({ id, name, path: appPath })
  }
  return candidates
}

async function discoverWindowsCandidates(
  environment: Readonly<Record<string, string | undefined>>
): Promise<NativeBrowserCandidate[]> {
  const windowsRoot = environment.SystemRoot ?? environment.WINDIR
  if (typeof windowsRoot !== 'string' || !path.win32.isAbsolute(windowsRoot)) {
    throw new Error('BROWSER_DISCOVERY_SYSTEM_ROOT_UNAVAILABLE')
  }
  const executable = path.win32.join(windowsRoot, ...POWERSHELL_RELATIVE_PATH)
  const { stdout } = await execFileAsync(
    executable,
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      POWERSHELL_DISCOVERY_SOURCE
    ],
    { timeout: DISCOVERY_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true }
  )
  return collectWindowsCandidates(parseJsonEntries(stdout))
}
