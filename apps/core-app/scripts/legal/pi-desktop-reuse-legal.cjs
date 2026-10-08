'use strict'

/**
 * LGPL-3.0 delivery for `@talex-touch/pi-desktop-reuse`.
 *
 * The package is compiled into Tuff's main, preload and renderer bundles, so it is not a
 * replaceable shared library and LGPL section 4(d)(1) does not apply. Every packaged build
 * therefore carries, under section 4(d)(0), the Minimal Corresponding Source of the Library
 * together with the Corresponding Application Code it was combined with.
 *
 * The source closure is not a hand-kept list: electron-vite reports the modules each of the
 * three builds actually loaded, and this module adds the build configuration those builds
 * ran with (relative-import closure of the Vite/Uno configs, tsconfig chains), the workspace
 * manifests reachable from apps/core-app in pnpm-lock.yaml, the lockfile and install
 * patches. Anything missing, unmapped, outside the workspace or matching a secret/migration
 * exclusion fails the build instead of producing an incomplete archive.
 *
 * Producer: `createPiDesktopReuseLegalCollector` (Vite plugins, see electron.vite.config.ts).
 * Gates:    `verifyBundle` (electron-builder beforePack), `verifyPackagedBundle` (afterPack).
 * CLI:      `node scripts/legal/pi-desktop-reuse-legal.cjs check|verify|reproduce`.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')

const PINNED_COMMIT = '3b036cc7810e18b3ef7689a2b93385125a8d0a3f'
const PACKAGE_NAME = '@talex-touch/pi-desktop-reuse'
/** Upstream files carry no per-file copyright notices; headers credit the project contributors. */
const ATTRIBUTION_TOKEN = 'PI-Desktop contributors'
const PACKAGE_LICENSE = 'LGPL-3.0-only'
const PACKAGE_DIR = 'packages/pi-desktop-reuse'
const LEGAL_FILES = ['LICENSE', 'COPYING', 'NOTICE', 'BUILDING.md', 'sources.json']
const BUILD_TARGETS = ['main', 'preload', 'renderer']
const BUNDLE_SEGMENTS = ['legal', 'pi-desktop-reuse']
const ARCHIVE_FILE = 'corresponding-source.tar.gz'
const ARCHIVE_CHECKSUM_FILE = `${ARCHIVE_FILE}.sha256`
const MANIFEST_FILE = 'source-manifest.json'
const OWNER_MARKER_FILE = '.tuff-legal-owned'
const OWNER_MARKER_CONTENT = 'tuff:pi-desktop-reuse-legal-bundle\n'
const DELIVERED_FILES = [...LEGAL_FILES, MANIFEST_FILE, ARCHIVE_FILE, ARCHIVE_CHECKSUM_FILE]
const BUNDLE_FILES = [...DELIVERED_FILES, OWNER_MARKER_FILE]
const ARCHIVE_ROOT = 'tuff-pi-desktop-reuse-source'
const MANIFEST_SCHEMA_VERSION = 1
const SOURCES_SCHEMA_VERSION = 1
const MAPPING_KINDS = new Set(['copied', 'adapted', 'excerpt', 'subset', 'translated', 'derived'])
const MAX_SOURCE_BYTES = 512 * 1024 * 1024
const TAR_BLOCK = 512
const TAR_MTIME = 0
const GZIP_OS_UNKNOWN = 0xff

/** Explicit build inputs of apps/core-app that no module graph reports. */
const APP_BUILD_CONFIG_FILES = [
  'package.json',
  'electron.vite.config.ts',
  'uno.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.web.json',
  'electron-builder.yml'
]
/** Config-time code whose relative imports are followed (esbuild bundles these for Vite). */
const APP_CONFIG_ENTRY_FILES = ['electron.vite.config.ts', 'uno.config.ts']
/**
 * Read from disk by the tuffex on-demand style plugin when it exists; the plugin falls back to an
 * empty graph otherwise, so the archive mirrors whichever state the build actually saw.
 */
const OPTIONAL_WORKSPACE_BUILD_INPUT_FILES = ['packages/tuffex/dist/es/style-deps.json']
const WORKSPACE_ROOT_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.node-version'
]
const WORKSPACE_LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']

const EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.comet',
  '.trellis',
  '.agents',
  '.omp',
  '.pi',
  '.claude',
  '.codex',
  '.cursor',
  '.vscode',
  '.idea',
  'logs',
  'profiles',
  '.dev-electron',
  '.electron-builder-cache',
  '.vite',
  '.vite-temp',
  '.cache',
  '.pnpm-store'
])
/** Migration assets and the runtime profile root (apps/core-app/tuff) never belong to a build. */
const EXCLUDED_PREFIXES = ['docs/comet/', 'apps/core-app/tuff/']
const EXCLUDED_BASENAMES = [
  /^\.env(?:\..*)?$/,
  /^\.npmrc$/,
  /^\.netrc$/,
  /^\.yarnrc(?:\.yml)?$/,
  /\.log$/,
  /\.(?:p8|p12|pfx|key|keystore|jks|mobileprovision|provisionprofile|kdbx)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/,
  /^credentials(?:\..+)?$/i,
  /^service-account.*\.json$/i,
  /(?:private|secret).*\.pem$/i
]

const RELATIVE_IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]+)\1/g
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json']
const TS_LIKE_EXTENSION = /\.(?:[cm]?tsx?|vue)$/
const RUNTIME_EXPORT_PATTERN = /^export\s+(?!type\b|interface\b|declare\b)/m

function fail(message) {
  throw new Error(`[pi-desktop-reuse-legal] ${message}`)
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function canonical(target) {
  return fs.realpathSync.native(target)
}

function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative))
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function readRegularFile(absolutePath, label) {
  let stat
  try {
    stat = fs.lstatSync(absolutePath)
  } catch {
    fail(`${label} is missing: ${absolutePath}`)
  }
  if (stat.isSymbolicLink()) fail(`${label} must be a regular file, not a symlink: ${absolutePath}`)
  if (!stat.isFile()) fail(`${label} is not a regular file: ${absolutePath}`)
  return fs.readFileSync(absolutePath)
}

function readJson(absolutePath, label) {
  const text = readRegularFile(absolutePath, label).toString('utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    fail(`${label} is not valid JSON (${error.message}): ${absolutePath}`)
  }
}

/** Strips `//` and block comments outside strings plus trailing commas (tsconfig JSONC). */
function parseJsonc(text, label) {
  let output = ''
  let inString = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      output += char
      if (char === '\\') {
        output += next ?? ''
        index += 1
      } else if (char === '"') {
        inString = false
      }
    } else if (char === '"') {
      inString = true
      output += char
    } else if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      output += '\n'
    } else if (char === '/' && next === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 1
    } else {
      output += char
    }
  }
  try {
    return JSON.parse(output.replace(/,(\s*[}\]])/g, '$1'))
  } catch (error) {
    fail(`${label} is not valid JSONC (${error.message})`)
  }
}

function walkRegularFiles(rootDir, { onSymlink }) {
  const files = []
  const visit = (dir) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, dirent.name)
      if (dirent.isSymbolicLink()) {
        onSymlink(absolute)
      } else if (dirent.isDirectory()) {
        visit(absolute)
      } else if (dirent.isFile()) {
        files.push(absolute)
      }
    }
  }
  visit(rootDir)
  return files.sort()
}

function exclusionReason(relativePath) {
  for (const prefix of EXCLUDED_PREFIXES) {
    if (relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix)) {
      return `excluded path ${prefix}`
    }
  }
  const segments = relativePath.split('/')
  for (const segment of segments.slice(0, -1)) {
    if (EXCLUDED_SEGMENTS.has(segment)) return `excluded directory ${segment}/`
    if (/^\.env/.test(segment)) return 'excluded environment directory'
  }
  const basename = segments[segments.length - 1]
  if (EXCLUDED_SEGMENTS.has(basename)) return `excluded name ${basename}`
  for (const pattern of EXCLUDED_BASENAMES) {
    if (pattern.test(basename)) return `excluded secret/runtime file pattern ${pattern}`
  }
  return null
}

function resolveLayout(appRoot) {
  if (!appRoot) fail('appRoot is required')
  const app = canonical(appRoot)
  const workspaceRoot = canonical(path.join(app, '..', '..'))
  const appRelative = toPosix(path.relative(workspaceRoot, app))
  if (appRelative !== 'apps/core-app') {
    fail(`appRoot must be <workspace>/apps/core-app, got ${appRelative}`)
  }
  const outRoot = path.join(app, 'out')
  return {
    appRoot: app,
    appRelative,
    workspaceRoot,
    packageRoot: path.join(workspaceRoot, PACKAGE_DIR),
    outRoot,
    bundleDir: path.join(outRoot, ...BUNDLE_SEGMENTS)
  }
}

// ---------------------------------------------------------------------------------------------
// Package legal metadata
// ---------------------------------------------------------------------------------------------

function assertString(value, label, minLength = 1) {
  if (typeof value !== 'string' || value.trim().length < minLength) fail(`${label} is missing`)
}

function validateUpstreamRef(ref, label) {
  if (!ref || typeof ref !== 'object') fail(`${label} must be an object`)
  assertString(ref.path, `${label}.path`)
  if (ref.path.includes('..') || ref.path.startsWith('/'))
    fail(`${label}.path must be repository-relative`)
  if (!/^[0-9a-f]{40}$/.test(ref.gitBlob ?? ''))
    fail(`${label}.gitBlob must be a 40-hex git blob id`)
  if (!/^[0-9a-f]{64}$/.test(ref.sha256 ?? '')) fail(`${label}.sha256 must be a 64-hex SHA-256`)
  if (ref.lines !== undefined && !/^\d+-\d+$/.test(ref.lines))
    fail(`${label}.lines must be "start-end"`)
}

/**
 * Validates LICENSE/COPYING/NOTICE/BUILDING.md/sources.json against the package source tree.
 * Every file under src/ must be mapped, every mapped file must carry the pinned SPDX/source
 * header naming each upstream path, and NOTICE must list every mapping.
 */
function validatePackage(layout) {
  const { packageRoot } = layout
  const manifest = readJson(path.join(packageRoot, 'package.json'), `${PACKAGE_DIR}/package.json`)
  if (manifest.name !== PACKAGE_NAME)
    fail(`${PACKAGE_DIR}/package.json name must be ${PACKAGE_NAME}`)
  if (manifest.license !== PACKAGE_LICENSE)
    fail(`${PACKAGE_DIR}/package.json license must be ${PACKAGE_LICENSE}`)
  for (const file of LEGAL_FILES) {
    if (!Array.isArray(manifest.files) || !manifest.files.includes(file)) {
      fail(`${PACKAGE_DIR}/package.json "files" must declare ${file}`)
    }
  }

  const legal = {}
  for (const file of LEGAL_FILES) {
    const buffer = readRegularFile(path.join(packageRoot, file), `${PACKAGE_DIR}/${file}`)
    if (buffer.length === 0) fail(`${PACKAGE_DIR}/${file} is empty`)
    // Normalize CRLF to LF so text file hashes match deterministically across platforms
    legal[file] = Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
  }

  const licenseText = legal.LICENSE.toString('utf8')
  if (!/^\s*GNU LESSER GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(licenseText)) {
    fail(`${PACKAGE_DIR}/LICENSE must be the full GNU LGPL v3 text`)
  }
  const copyingText = legal.COPYING.toString('utf8')
  if (!/^\s*GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(copyingText)) {
    fail(`${PACKAGE_DIR}/COPYING must be the full GNU GPL v3 text`)
  }

  let sources
  try {
    sources = JSON.parse(legal['sources.json'].toString('utf8'))
  } catch (error) {
    fail(`${PACKAGE_DIR}/sources.json is not valid JSON (${error.message})`)
  }
  if (sources.schemaVersion !== SOURCES_SCHEMA_VERSION) fail('sources.json schemaVersion must be 1')
  if (sources.package !== PACKAGE_NAME) fail(`sources.json package must be ${PACKAGE_NAME}`)
  if (sources.license !== PACKAGE_LICENSE) fail(`sources.json license must be ${PACKAGE_LICENSE}`)
  const upstream = sources.upstream ?? {}
  if (upstream.commit !== PINNED_COMMIT)
    fail(`sources.json upstream.commit must be ${PINNED_COMMIT}`)
  assertString(upstream.repository, 'sources.json upstream.repository')
  if (!/^https:\/\//.test(upstream.repository))
    fail('sources.json upstream.repository must be an https URL')
  if (typeof upstream.tree !== 'string' || !upstream.tree.includes(PINNED_COMMIT)) {
    fail('sources.json upstream.tree must point at the pinned commit')
  }
  if (upstream.license !== PACKAGE_LICENSE)
    fail(`sources.json upstream.license must be ${PACKAGE_LICENSE}`)
  assertString(upstream.attribution, 'sources.json upstream.attribution')
  if (!upstream.attribution.includes(ATTRIBUTION_TOKEN)) {
    fail(`sources.json upstream.attribution must credit ${ATTRIBUTION_TOKEN}`)
  }
  validateUpstreamRef(upstream.licenseFile, 'sources.json upstream.licenseFile')

  const licenseTexts = sources.licenseTexts ?? {}
  for (const file of ['LICENSE', 'COPYING']) {
    const expected = licenseTexts[file]?.sha256
    if (expected !== sha256(legal[file])) {
      fail(`sources.json licenseTexts.${file}.sha256 does not match ${PACKAGE_DIR}/${file}`)
    }
  }
  if (upstream.licenseFile.sha256 !== licenseTexts.LICENSE.sha256) {
    fail('LICENSE must be the upstream PI-Desktop LICENSE text verbatim')
  }

  if (!Array.isArray(sources.files) || sources.files.length === 0)
    fail('sources.json files is empty')
  const notice = legal.NOTICE.toString('utf8')
  if (!notice.includes(PINNED_COMMIT)) fail('NOTICE must name the pinned upstream commit')
  if (!notice.includes(upstream.attribution)) fail('NOTICE must carry the upstream attribution')
  const building = legal['BUILDING.md'].toString('utf8')
  for (const required of ['LGPL', ARCHIVE_FILE, MANIFEST_FILE]) {
    if (!building.includes(required)) fail(`BUILDING.md must describe ${required}`)
  }

  const mapped = new Map()
  for (const [index, entry] of sources.files.entries()) {
    const label = `sources.json files[${index}]`
    assertString(entry?.path, `${label}.path`)
    if (!/^src\/[A-Za-z0-9._/-]+$/.test(entry.path) || entry.path.includes('..')) {
      fail(`${label}.path must be a src/ path inside the package`)
    }
    if (mapped.has(entry.path)) fail(`${label}.path ${entry.path} is mapped twice`)
    if (!MAPPING_KINDS.has(entry.kind))
      fail(`${label}.kind must be one of ${[...MAPPING_KINDS].join(', ')}`)
    if (typeof entry.typeOnly !== 'boolean') fail(`${label}.typeOnly must be a boolean`)
    assertString(entry.modifications, `${label}.modifications`, 20)
    if (!Array.isArray(entry.upstream) || entry.upstream.length === 0)
      fail(`${label}.upstream is empty`)
    entry.upstream.forEach((ref, refIndex) =>
      validateUpstreamRef(ref, `${label}.upstream[${refIndex}]`)
    )

    const content = readRegularFile(
      path.join(packageRoot, entry.path),
      `${PACKAGE_DIR}/${entry.path}`
    )
    const header = content.toString('utf8').slice(0, 4096)
    const missingInHeader = [
      `SPDX-License-Identifier: ${PACKAGE_LICENSE}`,
      ATTRIBUTION_TOKEN,
      PINNED_COMMIT,
      ...entry.upstream.map((ref) => ref.path)
    ].filter((needle) => !header.includes(needle))
    if (missingInHeader.length > 0) {
      fail(`${PACKAGE_DIR}/${entry.path} header is missing: ${missingInHeader.join(' | ')}`)
    }
    if (entry.typeOnly && RUNTIME_EXPORT_PATTERN.test(content.toString('utf8'))) {
      fail(`${PACKAGE_DIR}/${entry.path} is declared typeOnly but has runtime exports`)
    }
    const missingInNotice = [entry.path, ...entry.upstream.map((ref) => ref.path)].filter(
      (needle) => !notice.includes(needle)
    )
    if (missingInNotice.length > 0) fail(`NOTICE does not list: ${missingInNotice.join(' | ')}`)
    mapped.set(entry.path, { entry, content })
  }

  const srcRoot = path.join(packageRoot, 'src')
  const present = walkRegularFiles(srcRoot, {
    onSymlink: (absolute) => fail(`symlinks are not allowed in ${PACKAGE_DIR}/src: ${absolute}`)
  }).map((absolute) => toPosix(path.relative(packageRoot, absolute)))
  const unmapped = present.filter((file) => !mapped.has(file))
  if (unmapped.length > 0) {
    fail(`files in ${PACKAGE_DIR} have no sources.json mapping: ${unmapped.join(', ')}`)
  }

  return { manifest, legal, sources, mapped }
}

// ---------------------------------------------------------------------------------------------
// Source closure
// ---------------------------------------------------------------------------------------------

function createSourceSet(layout) {
  const entries = new Map()
  const skipped = []

  /**
   * strict: a module graph / explicit input that matches an exclusion or leaves the workspace
   * is an error; walked directories (public assets) just skip excluded names.
   */
  const add = (absolutePath, role, { strict = true, target } = {}) => {
    let real
    try {
      real = canonical(absolutePath)
    } catch {
      fail(`required ${role} source is missing: ${absolutePath}`)
    }
    if (!isInside(layout.workspaceRoot, real)) {
      fail(`${role} source resolves outside the workspace: ${absolutePath} -> ${real}`)
    }
    const relative = toPosix(path.relative(layout.workspaceRoot, real))
    const reason = exclusionReason(relative)
    if (reason) {
      if (strict) fail(`${role} source ${relative} hits ${reason}; refusing to archive it`)
      skipped.push({ path: relative, reason })
      return null
    }
    let record = entries.get(relative)
    if (!record) {
      record = { path: relative, absolute: real, roles: new Set(), targets: new Set() }
      entries.set(relative, record)
    }
    record.roles.add(role)
    if (target) record.targets.add(target)
    return record
  }

  return { entries, skipped, add }
}

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier)
  const candidates = [base, ...RESOLVE_EXTENSIONS.map((extension) => `${base}${extension}`)]
  if (/\.[cm]?js$/.test(base)) candidates.push(base.replace(/\.([cm]?)js$/, '.$1ts'))
  candidates.push(path.join(base, 'index.ts'), path.join(base, 'index.js'))
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
}

/** Relative-import closure of config-time code; bare specifiers come from the lockfile. */
function relativeImportClosure(entryFiles) {
  const seen = new Set()
  const queue = [...entryFiles]
  while (queue.length > 0) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.(?:[cm]?[jt]sx?)$/.test(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(RELATIVE_IMPORT_PATTERN)) {
      // A match the resolver cannot place is prose in a comment; esbuild would have failed
      // the config load on a real unresolvable import long before this runs.
      const resolved = resolveRelativeImport(file, match[2])
      if (resolved && !seen.has(resolved)) queue.push(resolved)
    }
  }
  return [...seen]
}

function tsconfigChain(startFile, workspaceRoot, cache) {
  let dir = path.dirname(startFile)
  while (isInside(workspaceRoot, dir)) {
    if (cache.has(dir)) return cache.get(dir)
    const candidate = path.join(dir, 'tsconfig.json')
    if (fs.existsSync(candidate)) {
      const chain = []
      const visit = (file) => {
        if (chain.includes(file)) return
        chain.push(file)
        const config = parseJsonc(
          fs.readFileSync(file, 'utf8'),
          toPosix(path.relative(workspaceRoot, file))
        )
        const parents = Array.isArray(config.extends)
          ? config.extends
          : config.extends
            ? [config.extends]
            : []
        for (const parent of parents) {
          if (typeof parent !== 'string' || !parent.startsWith('.')) continue
          const resolved = path.resolve(
            path.dirname(file),
            parent.endsWith('.json') ? parent : `${parent}.json`
          )
          if (!fs.existsSync(resolved)) fail(`tsconfig extends target is missing: ${resolved}`)
          visit(resolved)
        }
      }
      visit(candidate)
      cache.set(dir, chain)
      return chain
    }
    if (dir === workspaceRoot) break
    dir = path.dirname(dir)
  }
  return []
}

/** Workspace importers reachable from apps/core-app through `link:` entries in pnpm-lock.yaml. */
function workspaceImporterClosure(layout) {
  const lockText = readRegularFile(
    path.join(layout.workspaceRoot, 'pnpm-lock.yaml'),
    'pnpm-lock.yaml'
  ).toString('utf8')
  const start = lockText.indexOf('\nimporters:\n')
  if (start < 0) fail('pnpm-lock.yaml has no importers section')
  const section = lockText.slice(start + 1)
  const header = 'importers:\n'
  const end = section.slice(header.length).search(/\n(?=[^\s#])/)
  const importersYaml = end < 0 ? section : section.slice(0, header.length + end + 1)
  const { parse } = require('yaml')
  const importers = parse(importersYaml)?.importers
  if (!importers || typeof importers !== 'object')
    fail('pnpm-lock.yaml importers section is unreadable')

  const visited = new Set()
  const queue = [layout.appRelative]
  while (queue.length > 0) {
    const importer = queue.shift()
    if (visited.has(importer)) continue
    const record = importers[importer]
    if (!record) fail(`pnpm-lock.yaml has no importer for ${importer}`)
    visited.add(importer)
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const dependency of Object.values(record[group] ?? {})) {
        const version = typeof dependency === 'string' ? dependency : dependency?.version
        if (typeof version !== 'string' || !version.startsWith('link:')) continue
        const target = path.posix.normalize(
          path.posix.join(importer, version.slice('link:'.length))
        )
        if (target.startsWith('..'))
          fail(`workspace link leaves the repository: ${importer} -> ${version}`)
        queue.push(target)
      }
    }
  }
  return [...visited].sort()
}

function patchedDependencyFiles(layout) {
  const { parse } = require('yaml')
  const workspaceYaml = readRegularFile(
    path.join(layout.workspaceRoot, 'pnpm-workspace.yaml'),
    'pnpm-workspace.yaml'
  )
  const patched = parse(workspaceYaml.toString('utf8'))?.patchedDependencies ?? {}
  return Object.values(patched).map((patchPath) => {
    if (typeof patchPath !== 'string' || patchPath.includes('..'))
      fail(`unsafe patch path ${patchPath}`)
    return path.join(layout.workspaceRoot, patchPath)
  })
}

function normalizeModuleId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.startsWith('\0')) return null
  const clean = id.split('?')[0].split('#')[0]
  return path.isAbsolute(clean) ? clean : null
}

/**
 * Ids @unocss/vite serves from its devtools plugin (`/@unocss/devtools` and friends); in a build
 * they load as empty modules. Only consulted when the UnoCSS plugin is part of the build.
 */
const UNOCSS_DEVTOOLS_IDS = new Set([
  '/@unocss/devtools',
  '/@unocss/mock-classes',
  '/@unocss/devtools.css'
])

/**
 * Asks the UnoCSS plugin of this build which ids it generates. The matcher comes from UnoCSS's own
 * `unocss:api` context (`getVMPRegexes`, honouring `virtualModulePrefix`), so a generated
 * stylesheet such as `<importer dir>/__uno.css` is recognised exactly and every other missing file
 * still fails. Its sources are the Uno config closure and the scanned modules already archived.
 */
async function createVirtualModuleRecognizer(plugins) {
  const unoApi = plugins.find((plugin) => plugin?.name === 'unocss:api')?.api
  if (!unoApi) return () => null
  const context = unoApi.getContext?.()
  if (typeof context?.getVMPRegexes !== 'function') fail('unocss:api does not expose getVMPRegexes')
  const { RESOLVED_ID_WITH_QUERY_RE } = await context.getVMPRegexes()
  return (id) =>
    RESOLVED_ID_WITH_QUERY_RE.test(id) || UNOCSS_DEVTOOLS_IDS.has(id) ? 'unocss' : null
}

/**
 * Classifies a Rollup module id: `null` for `\0` virtual ids and third-party packages (delivered
 * through the lockfile), `{ generator }` for an id a known plugin generates, otherwise
 * `{ file }` with the canonical absolute workspace file. A missing file fails the build.
 */
function classifyModule(layout, id, recognizeVirtual) {
  const clean = normalizeModuleId(id)
  if (!clean) return null
  if (clean.split(/[\\/]/).includes('node_modules')) return null
  if (!fs.existsSync(clean)) {
    const generator = recognizeVirtual(id)
    if (generator) return { generator, id: clean }
    fail(`build module does not exist on disk: ${clean}`)
  }
  const real = canonical(clean)
  if (real.split(path.sep).includes('node_modules')) return null
  if (!isInside(layout.workspaceRoot, real))
    fail(`build module resolves outside the workspace: ${real}`)
  return { file: real }
}

function relativeVirtualId(layout, id) {
  return isInside(layout.workspaceRoot, id) ? toPosix(path.relative(layout.workspaceRoot, id)) : id
}

function collectSources(layout, pkg, build) {
  const { entries, skipped, add } = createSourceSet(layout)
  const workspacePath = (relative) => path.join(layout.workspaceRoot, relative)
  const appPath = (relative) => path.join(layout.appRoot, relative)

  // The Library: legal files, manifest and every mapped source file.
  add(path.join(layout.packageRoot, 'package.json'), 'lgpl-module')
  for (const file of LEGAL_FILES) add(path.join(layout.packageRoot, file), 'lgpl-module')
  for (const file of pkg.mapped.keys()) add(path.join(layout.packageRoot, file), 'lgpl-module')

  // Corresponding Application Code: what the three builds actually loaded.
  for (const [target, files] of build.modules) {
    for (const absolute of files) add(absolute, 'build-module', { target })
  }
  for (const [target, info] of build.targets) {
    if (info.html && fs.existsSync(info.html)) add(info.html, 'build-input', { target })
    if (info.copyPublicDir && info.publicDir && fs.existsSync(info.publicDir)) {
      const publicFiles = walkRegularFiles(info.publicDir, {
        onSymlink: (absolute) =>
          fail(`symlinks are not allowed in the public directory: ${absolute}`)
      })
      for (const file of publicFiles) add(file, 'public-asset', { strict: false, target })
    }
  }

  // Build configuration.
  for (const file of APP_BUILD_CONFIG_FILES) add(appPath(file), 'build-config')
  for (const file of relativeImportClosure(APP_CONFIG_ENTRY_FILES.map(appPath)))
    add(file, 'build-config')
  for (const file of OPTIONAL_WORKSPACE_BUILD_INPUT_FILES) {
    if (fs.existsSync(workspacePath(file))) add(workspacePath(file), 'build-input')
  }
  const tsconfigCache = new Map()
  for (const record of [...entries.values()]) {
    if (!TS_LIKE_EXTENSION.test(record.path)) continue
    for (const config of tsconfigChain(record.absolute, layout.workspaceRoot, tsconfigCache)) {
      add(config, 'build-config')
    }
  }

  // Install inputs: toolchain pins, lockfile, patches and reachable workspace manifests.
  for (const file of WORKSPACE_ROOT_FILES) add(workspacePath(file), 'workspace-manifest')
  for (const file of patchedDependencyFiles(layout)) add(file, 'install-patch')
  add(workspacePath('LICENSE'), 'license')
  for (const importer of workspaceImporterClosure(layout)) {
    add(workspacePath(path.posix.join(importer, 'package.json')), 'workspace-manifest')
    for (const licenseFile of WORKSPACE_LICENSE_FILES) {
      const candidate = workspacePath(path.posix.join(importer, licenseFile))
      if (fs.existsSync(candidate)) add(candidate, 'license')
    }
  }

  return { entries, skipped }
}

function readSourceEntries(entries) {
  let totalBytes = 0
  const records = [...entries.values()]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((record) => {
      const data = readRegularFile(record.absolute, record.path)
      totalBytes += data.length
      if (totalBytes > MAX_SOURCE_BYTES) {
        fail(`source closure exceeds ${MAX_SOURCE_BYTES} bytes; check the exclusion rules`)
      }
      const executable = (fs.statSync(record.absolute).mode & 0o111) !== 0
      return {
        path: record.path,
        data,
        mode: executable ? 0o755 : 0o644,
        sha256: sha256(data),
        roles: [...record.roles].sort(),
        targets: [...record.targets].sort()
      }
    })
  return { records, totalBytes }
}

// ---------------------------------------------------------------------------------------------
// Deterministic tar.gz
// ---------------------------------------------------------------------------------------------

function writeOctal(buffer, value, offset, length) {
  const text = value.toString(8).padStart(length - 1, '0')
  if (text.length > length - 1) fail(`tar field overflow for value ${value}`)
  buffer.write(`${text}\0`, offset, length, 'ascii')
}

function tarHeader(name, size, mode, typeflag) {
  const header = Buffer.alloc(TAR_BLOCK)
  header.write(name, 0, 100, 'utf8')
  writeOctal(header, mode, 100, 8)
  writeOctal(header, 0, 108, 8)
  writeOctal(header, 0, 116, 8)
  writeOctal(header, size, 124, 12)
  writeOctal(header, TAR_MTIME, 136, 12)
  header.fill(0x20, 148, 156)
  header.write(typeflag, 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

function tarPadding(size) {
  const remainder = size % TAR_BLOCK
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(TAR_BLOCK - remainder)
}

function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`
  const bodyLength = Buffer.byteLength(body)
  let total = bodyLength + 1
  while (total !== bodyLength + String(total).length) total = bodyLength + String(total).length
  return `${total}${body}`
}

function createTarGz(records) {
  const chunks = []
  records.forEach((record, index) => {
    const name = `${ARCHIVE_ROOT}/${record.path}`
    let headerName = name
    if (Buffer.byteLength(name) > 100 || /[^\x20-\x7e]/.test(name)) {
      const pax = Buffer.from(paxRecord('path', name), 'utf8')
      chunks.push(
        tarHeader(`PaxHeaders/${index}`, pax.length, 0o644, 'x'),
        pax,
        tarPadding(pax.length)
      )
      headerName = `${ARCHIVE_ROOT}/pax-${index}`
    }
    chunks.push(
      tarHeader(headerName, record.data.length, record.mode, '0'),
      record.data,
      tarPadding(record.data.length)
    )
  })
  chunks.push(Buffer.alloc(TAR_BLOCK * 2))
  const gzip = zlib.gzipSync(Buffer.concat(chunks), { level: 9 })
  gzip[9] = GZIP_OS_UNKNOWN
  return gzip
}

function readCString(buffer, offset, length) {
  const slice = buffer.subarray(offset, offset + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end < 0 ? slice.length : end).toString('utf8')
}

/** Reads the archive back (ustar + pax `path`), validating header checksums. */
function readTarGz(archive) {
  const tar = zlib.gunzipSync(archive)
  const files = new Map()
  let offset = 0
  let paxPath = null
  while (offset + TAR_BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + TAR_BLOCK)
    if (header.every((byte) => byte === 0)) break
    let checksum = 0
    for (let index = 0; index < TAR_BLOCK; index += 1) {
      checksum += index >= 148 && index < 156 ? 0x20 : header[index]
    }
    if (checksum !== Number.parseInt(readCString(header, 148, 8).trim(), 8)) {
      fail(`archive header checksum mismatch at offset ${offset}`)
    }
    const size = Number.parseInt(readCString(header, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156] || 0x30)
    const data = tar.subarray(offset + TAR_BLOCK, offset + TAR_BLOCK + size)
    offset += TAR_BLOCK + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK
    if (type === 'x') {
      for (const line of data.toString('utf8').split('\n')) {
        const match = /^\d+ path=(.*)$/.exec(line)
        if (match) paxPath = match[1]
      }
      continue
    }
    if (type !== '0') fail(`unexpected archive entry type ${type}`)
    const prefix = readCString(header, 345, 155)
    const name =
      paxPath ?? (prefix ? `${prefix}/${readCString(header, 0, 100)}` : readCString(header, 0, 100))
    paxPath = null
    if (files.has(name)) fail(`archive contains ${name} twice`)
    files.set(name, data)
  }
  return files
}

// ---------------------------------------------------------------------------------------------
// Output ownership
// ---------------------------------------------------------------------------------------------

/**
 * Resolves `dir` against its nearest existing ancestor and requires the canonical result to sit
 * inside one of `roots` (and outside the workspace unless under apps/core-app/out) before any
 * directory is created.
 */
function ensureOwnedParent(dir, roots, layout) {
  let ancestor = path.resolve(dir)
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor)
    if (parent === ancestor) fail(`no existing ancestor for ${dir}`)
    ancestor = parent
  }
  const candidate = path.join(canonical(ancestor), path.relative(ancestor, path.resolve(dir)))
  const outRoot = fs.existsSync(layout.outRoot) ? canonical(layout.outRoot) : null
  const insideAllowed = roots.some((root) => isInside(root, candidate))
  const insideWorkspace = isInside(layout.workspaceRoot, candidate)
  if (!insideAllowed || (insideWorkspace && !(outRoot && isInside(outRoot, candidate)))) {
    fail(`output ${dir} is outside the allowed roots (${roots.join(', ')})`)
  }
  fs.mkdirSync(candidate, { recursive: true })
  if (canonical(candidate) !== candidate)
    fail(`output path changed while resolving symlinks: ${candidate}`)
  return candidate
}

function assertOwnedBundleDir(dir) {
  const stat = fs.lstatSync(dir)
  if (stat.isSymbolicLink() || !stat.isDirectory())
    fail(`refusing to use non-directory output ${dir}`)
  const markerPath = path.join(dir, OWNER_MARKER_FILE)
  const marker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8') : null
  if (marker !== OWNER_MARKER_CONTENT)
    fail(`refusing to use ${dir}: it is not an owned legal bundle`)
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!dirent.isFile() || !BUNDLE_FILES.includes(dirent.name)) {
      fail(`refusing to use ${dir}: unexpected entry ${dirent.name}`)
    }
  }
}

function pathEntryExists(target) {
  try {
    fs.lstatSync(target)
    return true
  } catch {
    return false
  }
}

function writeOwnedBundle(targetDir, files, roots, layout) {
  const parent = ensureOwnedParent(path.dirname(targetDir), roots, layout)
  const finalDir = path.join(parent, path.basename(targetDir))
  const replacing = pathEntryExists(finalDir)
  if (replacing) assertOwnedBundleDir(finalDir)

  const staging = fs.mkdtempSync(path.join(parent, `.${path.basename(targetDir)}.staging-`))
  try {
    for (const [name, data] of Object.entries(files)) {
      fs.writeFileSync(path.join(staging, name), data, { flag: 'wx' })
    }
    fs.writeFileSync(path.join(staging, OWNER_MARKER_FILE), OWNER_MARKER_CONTENT, { flag: 'wx' })
    if (replacing) {
      const retired = `${staging}.retired`
      fs.renameSync(finalDir, retired)
      fs.renameSync(staging, finalDir)
      fs.rmSync(retired, { recursive: true })
    } else {
      fs.renameSync(staging, finalDir)
    }
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw error
  }
  return finalDir
}

// ---------------------------------------------------------------------------------------------
// Build outputs
// ---------------------------------------------------------------------------------------------

function digestOutputTree(dir, label) {
  if (!fs.existsSync(dir)) fail(`${label} build output is missing: ${dir}`)
  const files = walkRegularFiles(dir, {
    onSymlink: (absolute) => fail(`unexpected symlink in build output: ${absolute}`)
  })
  if (files.length === 0) fail(`${label} build output is empty: ${dir}`)
  const hash = crypto.createHash('sha256')
  for (const file of files) {
    hash.update(`${toPosix(path.relative(dir, file))}\0${sha256(fs.readFileSync(file))}\n`)
  }
  return { files: files.length, sha256: hash.digest('hex') }
}

function digestOutputs(layout) {
  const outputs = {}
  for (const target of BUILD_TARGETS) {
    outputs[target] = digestOutputTree(path.join(layout.outRoot, target), target)
  }
  return outputs
}

// ---------------------------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------------------------

function buildManifest(layout, pkg, build, records, totalBytes, skipped, archive, outputs) {
  const rootManifest = readJson(path.join(layout.workspaceRoot, 'package.json'), 'package.json')
  const byPath = new Map(records.map((record) => [record.path, record]))
  const reuse = [...pkg.mapped.values()].map(({ entry }) => {
    const relative = `${PACKAGE_DIR}/${entry.path}`
    const record = byPath.get(relative)
    const importers = {}
    for (const target of BUILD_TARGETS) {
      const list = build.importers.get(target)?.get(relative)
      if (list && list.size > 0) importers[target] = [...list].sort()
    }
    return {
      path: relative,
      sha256: record.sha256,
      kind: entry.kind,
      typeOnly: entry.typeOnly,
      upstream: entry.upstream.map((ref) => ref.path),
      bundledInto: record.targets,
      importers
    }
  })

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generator: `${layout.appRelative}/scripts/legal/pi-desktop-reuse-legal.cjs`,
    package: PACKAGE_NAME,
    license: PACKAGE_LICENSE,
    upstream: {
      repository: pkg.sources.upstream.repository,
      commit: PINNED_COMMIT,
      tree: pkg.sources.upstream.tree
    },
    combination: {
      linking: 'inlined into the electron-vite main, preload and renderer bundles',
      lgplSection: '4(d)(0)',
      sharedLibraryMechanism: false
    },
    toolchain: {
      node: rootManifest.engines?.node ?? null,
      packageManager: rootManifest.packageManager ?? null
    },
    archive: {
      file: ARCHIVE_FILE,
      root: ARCHIVE_ROOT,
      sha256: sha256(archive),
      bytes: archive.length,
      entries: records.length,
      sourceBytes: totalBytes
    },
    outputs,
    reuse,
    exclusions: {
      directories: [...EXCLUDED_SEGMENTS].sort(),
      prefixes: EXCLUDED_PREFIXES,
      basenames: EXCLUDED_BASENAMES.map((pattern) => pattern.source)
    },
    virtualModules: Object.fromEntries(
      BUILD_TARGETS.filter((target) => build.virtualModules.get(target)?.length).map((target) => [
        target,
        build.virtualModules.get(target)
      ])
    ),
    skipped,
    entries: records.map((record) => ({
      path: record.path,
      sha256: record.sha256,
      size: record.data.length,
      mode: record.mode.toString(8),
      roles: record.roles,
      ...(record.targets.length > 0 ? { targets: record.targets } : {})
    }))
  }
}

function assertReuseExecutes(pkg, build) {
  const idle = []
  for (const { entry } of pkg.mapped.values()) {
    if (entry.typeOnly) continue
    const relative = `${PACKAGE_DIR}/${entry.path}`
    const bundled = BUILD_TARGETS.some((target) => build.modulePaths.get(target)?.has(relative))
    if (!bundled) idle.push(relative)
  }
  if (idle.length > 0) {
    fail(
      `mapped runtime files are not loaded by any main/preload/renderer build: ${idle.join(', ')}`
    )
  }
}

function produceBundle(layout, build) {
  const pkg = validatePackage(layout)
  assertReuseExecutes(pkg, build)
  const { entries, skipped } = collectSources(layout, pkg, build)
  const { records, totalBytes } = readSourceEntries(entries)
  const archive = createTarGz(records)
  const outputs = digestOutputs(layout)
  const manifest = buildManifest(layout, pkg, build, records, totalBytes, skipped, archive, outputs)
  const archiveSha256 = manifest.archive.sha256

  const outRootStat = fs.lstatSync(layout.outRoot)
  if (outRootStat.isSymbolicLink() || !outRootStat.isDirectory()) {
    fail(`${layout.outRoot} must be a real directory`)
  }
  const bundleDir = writeOwnedBundle(
    layout.bundleDir,
    {
      ...Object.fromEntries(LEGAL_FILES.map((file) => [file, pkg.legal[file]])),
      [MANIFEST_FILE]: `${JSON.stringify(manifest, null, 2)}\n`,
      [ARCHIVE_FILE]: archive,
      [ARCHIVE_CHECKSUM_FILE]: `${archiveSha256}  ${ARCHIVE_FILE}\n`
    },
    [canonical(layout.outRoot)],
    layout
  )
  return { bundleDir, archiveSha256, entries: records.length, sourceBytes: totalBytes }
}

/**
 * One collector per electron-vite config load. Each target gets its own plugin instance; the
 * bundle is produced once main, preload and renderer have all written their output, so the
 * archive always matches the three bundles that were just emitted.
 */
function createPiDesktopReuseLegalCollector({ appRoot }) {
  const state = {
    targets: new Map(),
    modules: new Map(),
    modulePaths: new Map(),
    importers: new Map(),
    virtualModules: new Map(),
    recognizers: new Map(),
    written: new Set(),
    failed: false,
    finalized: false
  }

  function plugin(target) {
    if (!BUILD_TARGETS.includes(target)) fail(`unknown build target ${target}`)
    return {
      name: `tuff:pi-desktop-reuse-legal:${target}`,
      enforce: 'post',
      apply(config, env) {
        return env.command === 'build' && !config.build?.watch
      },
      configResolved(config) {
        state.targets.set(target, {
          html: target === 'renderer' ? path.join(config.root, 'index.html') : null,
          publicDir: config.publicDir || null,
          copyPublicDir: config.build.copyPublicDir !== false
        })
        state.recognizers.set(target, createVirtualModuleRecognizer(config.plugins))
      },
      async buildEnd(error) {
        if (error) {
          state.failed = true
          return
        }
        const layout = resolveLayout(appRoot)
        const recognizeVirtual = await state.recognizers.get(target)
        const files = new Set()
        const paths = new Set()
        const importers = new Map()
        const virtualModules = new Map()
        for (const id of this.getModuleIds()) {
          const classified = classifyModule(layout, id, recognizeVirtual)
          if (!classified) continue
          if (classified.generator) {
            const relative = relativeVirtualId(layout, classified.id)
            virtualModules.set(relative, { id: relative, generator: classified.generator })
            continue
          }
          const absolute = classified.file
          files.add(absolute)
          const relative = toPosix(path.relative(layout.workspaceRoot, absolute))
          paths.add(relative)
          if (!relative.startsWith(`${PACKAGE_DIR}/`)) continue
          const importerSet = importers.get(relative) ?? new Set()
          for (const importerId of this.getModuleInfo(id)?.importers ?? []) {
            const importer = classifyModule(layout, importerId, recognizeVirtual)
            if (importer?.file)
              importerSet.add(toPosix(path.relative(layout.workspaceRoot, importer.file)))
          }
          importers.set(relative, importerSet)
        }
        state.modules.set(target, files)
        state.modulePaths.set(target, paths)
        state.importers.set(target, importers)
        state.virtualModules.set(
          target,
          [...virtualModules.values()].sort((left, right) =>
            left.id < right.id ? -1 : left.id > right.id ? 1 : 0
          )
        )
      },
      writeBundle() {
        state.written.add(target)
      },
      closeBundle() {
        if (state.failed || state.finalized) return
        if (!BUILD_TARGETS.every((name) => state.written.has(name))) return
        state.finalized = true
        const layout = resolveLayout(appRoot)
        const result = produceBundle(layout, state)
        console.log(
          `[pi-desktop-reuse-legal] ${result.entries} source files -> ${toPosix(
            path.relative(layout.appRoot, result.bundleDir)
          )}/${ARCHIVE_FILE} (sha256 ${result.archiveSha256})`
        )
      }
    }
  }

  return { plugin }
}

// ---------------------------------------------------------------------------------------------
// Verification gates
// ---------------------------------------------------------------------------------------------

function readBundleManifest(bundleDir) {
  const manifest = readJson(path.join(bundleDir, MANIFEST_FILE), `${MANIFEST_FILE} in ${bundleDir}`)
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION)
    fail(`${MANIFEST_FILE} schemaVersion must be 1`)
  if (manifest.package !== PACKAGE_NAME || manifest.upstream?.commit !== PINNED_COMMIT) {
    fail(`${MANIFEST_FILE} does not describe ${PACKAGE_NAME} @ ${PINNED_COMMIT}`)
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0)
    fail(`${MANIFEST_FILE} has no entries`)
  return manifest
}

function verifyArchiveAgainstManifest(archive, manifest) {
  if (sha256(archive) !== manifest.archive?.sha256)
    fail(`${ARCHIVE_FILE} does not match ${MANIFEST_FILE}`)
  const files = readTarGz(archive)
  if (files.size !== manifest.entries.length) {
    fail(
      `${ARCHIVE_FILE} holds ${files.size} files, ${MANIFEST_FILE} lists ${manifest.entries.length}`
    )
  }
  for (const entry of manifest.entries) {
    const data = files.get(`${ARCHIVE_ROOT}/${entry.path}`)
    if (!data) fail(`${ARCHIVE_FILE} is missing ${entry.path}`)
    if (sha256(data) !== entry.sha256)
      fail(`${ARCHIVE_FILE} entry ${entry.path} does not match its manifest hash`)
    if (exclusionReason(entry.path)) fail(`${ARCHIVE_FILE} contains excluded path ${entry.path}`)
  }
}

/**
 * electron-builder beforePack gate: the bundle must exist, belong to the current out/ build,
 * match the current package legal files and mappings, and its archive must hold exactly the
 * manifest's files. A direct `electron-builder` run without a fresh electron-vite build fails.
 */
function verifyBundle({ appRoot, bundleDir }) {
  const layout = resolveLayout(appRoot)
  const dir = bundleDir ? path.resolve(bundleDir) : layout.bundleDir
  if (!pathEntryExists(dir)) {
    fail(
      `legal bundle is missing: ${dir}. Run \`electron-vite build\` in ${layout.appRelative} first.`
    )
  }
  assertOwnedBundleDir(dir)
  for (const file of DELIVERED_FILES) readRegularFile(path.join(dir, file), `legal bundle ${file}`)

  const pkg = validatePackage(layout)
  for (const file of LEGAL_FILES) {
    if (!fs.readFileSync(path.join(dir, file)).equals(pkg.legal[file])) {
      fail(`legal bundle ${file} differs from ${PACKAGE_DIR}/${file}; rerun electron-vite build`)
    }
  }

  const manifest = readBundleManifest(dir)
  const archive = fs.readFileSync(path.join(dir, ARCHIVE_FILE))
  const checksumLine = fs.readFileSync(path.join(dir, ARCHIVE_CHECKSUM_FILE), 'utf8')
  if (checksumLine !== `${manifest.archive?.sha256}  ${ARCHIVE_FILE}\n`) {
    fail(`${ARCHIVE_CHECKSUM_FILE} does not match ${MANIFEST_FILE}`)
  }
  verifyArchiveAgainstManifest(archive, manifest)

  const outputs = digestOutputs(layout)
  for (const target of BUILD_TARGETS) {
    if (outputs[target].sha256 !== manifest.outputs?.[target]?.sha256) {
      fail(
        `out/${target} is not the build this legal bundle was produced for; rerun electron-vite build`
      )
    }
  }

  const archived = new Map(manifest.entries.map((entry) => [entry.path, entry.sha256]))
  for (const [file, { content }] of pkg.mapped) {
    const relative = `${PACKAGE_DIR}/${file}`
    if (archived.get(relative) !== sha256(content)) {
      fail(`${relative} changed after the legal bundle was produced; rerun electron-vite build`)
    }
  }

  return {
    bundleDir: dir,
    archiveSha256: manifest.archive.sha256,
    entries: manifest.entries.length
  }
}

/** afterPack gate: extraResources delivered the exact bundle into <Resources>/legal/pi-desktop-reuse. */
function verifyPackagedBundle({ appRoot, resourcesDir }) {
  const layout = resolveLayout(appRoot)
  if (!resourcesDir) fail('packaged resources directory is required')
  const packagedDir = path.join(resourcesDir, ...BUNDLE_SEGMENTS)
  for (const file of DELIVERED_FILES) {
    const packaged = readRegularFile(path.join(packagedDir, file), `packaged ${file}`)
    const source = readRegularFile(path.join(layout.bundleDir, file), `legal bundle ${file}`)
    if (!packaged.equals(source)) fail(`packaged ${file} differs from ${layout.bundleDir}/${file}`)
  }
  const manifest = readBundleManifest(packagedDir)
  return { packagedDir, archiveSha256: manifest.archive.sha256 }
}

/**
 * Rebuilds the archive from the current tree using a produced manifest and writes a copy of the
 * bundle to an owned directory under the OS temp dir, /tmp or apps/core-app/out. Every file
 * must still hash to its manifest value and the rebuilt archive must be byte-identical.
 */
function reproduceBundle({ appRoot, bundleDir, outDir }) {
  const layout = resolveLayout(appRoot)
  if (!outDir) fail('--out <dir> is required')
  const sourceBundle = bundleDir ? path.resolve(bundleDir) : layout.bundleDir
  if (!pathEntryExists(sourceBundle)) fail(`legal bundle is missing: ${sourceBundle}`)
  assertOwnedBundleDir(sourceBundle)
  const manifest = readBundleManifest(sourceBundle)
  verifyArchiveAgainstManifest(fs.readFileSync(path.join(sourceBundle, ARCHIVE_FILE)), manifest)
  const records = manifest.entries.map((entry) => {
    if (exclusionReason(entry.path)) fail(`manifest lists excluded path ${entry.path}`)
    const absolute = path.join(layout.workspaceRoot, entry.path)
    const real = canonical(absolute)
    if (!isInside(layout.workspaceRoot, real)) fail(`${entry.path} resolves outside the workspace`)
    const data = readRegularFile(real, entry.path)
    if (sha256(data) !== entry.sha256) fail(`${entry.path} changed since the bundle was produced`)
    return { path: entry.path, data, mode: Number.parseInt(entry.mode, 8) }
  })
  const archive = createTarGz(records)
  if (sha256(archive) !== manifest.archive.sha256) {
    fail(`reproduced archive ${sha256(archive)} differs from ${manifest.archive.sha256}`)
  }
  const roots = [os.tmpdir(), '/tmp']
    .filter((root) => fs.existsSync(root))
    .map((root) => canonical(root))
  if (fs.existsSync(layout.outRoot)) roots.push(canonical(layout.outRoot))
  const files = {}
  for (const file of DELIVERED_FILES) {
    files[file] = file === ARCHIVE_FILE ? archive : fs.readFileSync(path.join(sourceBundle, file))
  }
  const written = writeOwnedBundle(path.resolve(outDir), files, roots, layout)
  return { bundleDir: written, archiveSha256: manifest.archive.sha256, entries: records.length }
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--bundle' || arg === '--out') {
      const value = rest[index + 1]
      if (!value) fail(`${arg} needs a value`)
      options[arg.slice(2)] = value
      index += 1
    } else {
      fail(`unknown argument ${arg}`)
    }
  }
  return { command, options }
}

function runCli(argv) {
  const appRoot = path.resolve(__dirname, '..', '..')
  const { command, options } = parseArgs(argv)
  let result
  if (command === 'check') {
    const pkg = validatePackage(resolveLayout(appRoot))
    result = { package: PACKAGE_NAME, commit: PINNED_COMMIT, mapped: [...pkg.mapped.keys()] }
  } else if (command === 'verify') {
    result = verifyBundle({ appRoot, bundleDir: options.bundle })
  } else if (command === 'reproduce') {
    result = reproduceBundle({ appRoot, bundleDir: options.bundle, outDir: options.out })
  } else {
    fail(
      'usage: pi-desktop-reuse-legal.cjs check | verify [--bundle <dir>] | reproduce --out <dir> [--bundle <dir>]'
    )
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

module.exports = {
  ARCHIVE_FILE,
  MANIFEST_FILE,
  PINNED_COMMIT,
  createPiDesktopReuseLegalCollector,
  reproduceBundle,
  validatePackage: (appRoot) => validatePackage(resolveLayout(appRoot)),
  verifyBundle,
  verifyPackagedBundle
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
