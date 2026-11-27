import { constants } from 'node:fs'
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

export const RECOMMENDED_SKILLS = [
  {
    id: 'openai-docs',
    name: 'OpenAI Docs',
    description: 'Answer OpenAI product and API questions from official docs.',
    mode: 'core',
    capabilities: ['docs.openai.search', 'docs.openai.answer'],
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Run browser QA, inspect local pages, and capture screenshots.',
    mode: 'core',
    capabilities: ['browser.qa.run', 'browser.screenshot.capture'],
  },
  {
    id: 'screenshot',
    name: 'Screenshot',
    description: 'Capture desktop or application screenshots for visual verification.',
    mode: 'core',
    capabilities: ['desktop.screenshot.capture'],
  },
  {
    id: 'pdf',
    name: 'PDF',
    description: 'Read, create, and verify PDF files with rendered-page checks.',
    mode: 'core',
    capabilities: ['document.pdf.read', 'document.pdf.create'],
  },
  {
    id: 'doc',
    name: 'DOCX',
    description: 'Create, edit, and verify Word documents.',
    mode: 'core',
    capabilities: ['document.docx.read', 'document.docx.create'],
  },
  {
    id: 'frontend-skill',
    name: 'Frontend Skill',
    description: 'Build and review polished frontend prototypes and UI changes.',
    mode: 'core',
    capabilities: ['frontend.design.review', 'frontend.prototype.build'],
  },
  {
    id: 'gh-fix-ci',
    name: 'GitHub CI',
    description: 'Inspect GitHub Actions failures and prepare focused fix plans.',
    mode: 'gated',
    capabilities: ['github.ci.inspect', 'github.ci.fix-plan'],
  },
  {
    id: 'gh-address-comments',
    name: 'GitHub PR Comments',
    description: 'Address GitHub pull request review comments.',
    mode: 'gated',
    capabilities: ['github.pr.comments.address'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Inspect recent production errors from Sentry.',
    mode: 'gated',
    capabilities: ['observability.sentry.inspect'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Read and manage Linear issues and project workflows.',
    mode: 'gated',
    capabilities: ['project.linear.manage'],
  },
  {
    id: 'cloudflare-deploy',
    name: 'Cloudflare Deploy',
    description: 'Plan and run Cloudflare Workers or Pages deployments.',
    mode: 'gated',
    capabilities: ['deploy.cloudflare.plan'],
  },
  {
    id: 'netlify-deploy',
    name: 'Netlify Deploy',
    description: 'Plan and run Netlify preview or production deployments.',
    mode: 'gated',
    capabilities: ['deploy.netlify.plan'],
  },
] as const

export type RecommendedSkillId = (typeof RECOMMENDED_SKILLS)[number]['id']
export type RecommendedSkillMode = (typeof RECOMMENDED_SKILLS)[number]['mode']

export type LocalToolId = 'codex' | 'claude' | 'omp' | 'pi' | 'herdr'

export interface LocalToolSummary {
  id: LocalToolId
  name: string
  installed: boolean
  executablePath?: string
  configRoots: string[]
}

export interface LocalConfigFileSummary {
  tool: LocalToolId
  path: string
  exists: boolean
  kind: 'config' | 'instructions' | 'codex-project' | 'claude-project'
  keyPaths: string[]
  sensitiveKeyPaths: string[]
  updatedAt?: number
}

export interface LocalExecutableLookup {
  command: string
  fallbackCommands?: readonly string[]
  envOverride?: string
  extraDirs?: readonly string[]
}

export interface LocalCapabilityEnvironmentOptions {
  homeDir?: string
  envPath?: string
  env?: NodeJS.ProcessEnv
  codexHome?: string
  platform?: NodeJS.Platform
}

export interface LocalSkillSummary {
  id: string
  name: string
  description: string
  installed: boolean
  mode: RecommendedSkillMode | 'external'
  riskLevel: 'low' | 'high'
  capabilities: string[]
  path: string
  manifestPath: string
  updatedAt?: number
}

export interface LocalCapabilityEnvironment {
  scannedAt: number
  cwd: string
  skillsRoot: string
  tools: LocalToolSummary[]
  configFiles: LocalConfigFileSummary[]
  skillProviders: LocalSkillSummary[]
}

export interface SkillInstallPlanItem {
  id: RecommendedSkillId
  name: string
  mode: RecommendedSkillMode
  targetDir: string
  manifestPath: string
  status: 'create' | 'overwrite' | 'skip'
  reason?: 'already-installed'
}

export interface SkillInstallPlan {
  targetRoot: string
  items: SkillInstallPlanItem[]
}

export interface SkillInstallOptions {
  targetRoot?: string
  includeGated?: boolean
  overwrite?: boolean
}

export interface SkillInstallResult {
  written: SkillInstallPlanItem[]
  skipped: SkillInstallPlanItem[]
}

interface RuntimePaths {
  cwd: string
  homeDir: string
  envPath: string
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  codexHome?: string
}

interface VersionManagerRoot {
  root: string
  bin: string
}

const VERSION_DIRECTORY = /^v?(\d+)\.(\d+)\.(\d+)$/

function resolveCodexHome(homeDir = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_HOME || join(homeDir, '.codex')
}

function resolveClaudeHome(homeDir = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR || join(homeDir, '.claude')
}

function resolveOmpAgentDir(homeDir = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  return env.OMP_AGENT_DIR || join(homeDir, '.omp', 'agent')
}

function resolvePiAgentDir(homeDir = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  return env.PI_CODING_AGENT_DIR || join(homeDir, '.pi', 'agent')
}

export function resolveDefaultSkillsRoot(homeDir = homedir()): string {
  return join(resolveCodexHome(homeDir), 'skills')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  }
  catch {
    return false
  }
}

async function isExecutableFile(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  try {
    if (!(await stat(filePath)).isFile()) {
      return false
    }
    await access(filePath, platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  }
  catch {
    return false
  }
}

async function getMtime(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs
  }
  catch {
    return undefined
  }
}

function withPlatformExtensions(
  command: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  if (platform !== 'win32') {
    return [command]
  }
  const extensions = (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
  return extensions.map(ext => `${command}${ext}`)
}

function fnmDirectories(
  homeDir: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  const fnmDir = env.FNM_DIR?.trim()
  const xdgDataHome = env.XDG_DATA_HOME?.trim()
  return [
    ...(fnmDir && isAbsolute(fnmDir) ? [fnmDir] : []),
    join(homeDir, '.fnm'),
    ...(platform === 'darwin' ? [join(homeDir, 'Library', 'Application Support', 'fnm')] : []),
    xdgDataHome && isAbsolute(xdgDataHome)
      ? join(xdgDataHome, 'fnm')
      : join(homeDir, '.local', 'share', 'fnm'),
  ]
}

function versionManagerRoots(
  homeDir: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): VersionManagerRoot[] {
  return [
    { root: join(homeDir, '.local', 'share', 'mise', 'installs', 'node'), bin: 'bin' },
    { root: join(homeDir, '.volta', 'tools', 'image', 'node'), bin: 'bin' },
    { root: join(homeDir, '.nvm', 'versions', 'node'), bin: 'bin' },
    ...fnmDirectories(homeDir, platform, env).map(directory => ({
      root: join(directory, 'node-versions'),
      bin: join('installation', 'bin'),
    })),
  ]
}

function directBinRoots(homeDir: string, platform: NodeJS.Platform): string[] {
  const roots = [
    join(homeDir, '.local', 'bin'),
    join(homeDir, '.bun', 'bin'),
    join(homeDir, '.deno', 'bin'),
    join(homeDir, '.npm-global', 'bin'),
  ]
  if (platform !== 'win32') {
    roots.push('/opt/homebrew/bin', '/usr/local/bin')
  }
  return roots
}

function parseVersionDirectory(name: string): number[] | null {
  const match = VERSION_DIRECTORY.exec(name)
  return match ? match.slice(1, 4).map(Number) : null
}

function compareVersionsDescending(left: number[], right: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0)
    if (difference !== 0) {
      return difference
    }
  }
  return 0
}

async function expandVersionedBinDirs({ root, bin }: VersionManagerRoot): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
      .flatMap((entry) => {
        const version = parseVersionDirectory(entry.name)
        return version ? [{ name: entry.name, version }] : []
      })
      .sort((left, right) => compareVersionsDescending(left.version, right.version))
      .map(entry => join(root, entry.name, bin))
  }
  catch {
    return []
  }
}

async function resolveFallbackBinDirs(
  homeDir: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Promise<string[]> {
  const versioned = await Promise.all(
    versionManagerRoots(homeDir, platform, env).map(expandVersionedBinDirs),
  )
  return [...versioned.flat(), ...directBinRoots(homeDir, platform)]
}

async function findInDirectories(
  command: string,
  directories: readonly string[],
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const names = withPlatformExtensions(command, platform, env)
  for (const directory of directories) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (await isExecutableFile(candidate, platform)) {
        return candidate
      }
    }
  }
  return undefined
}

/**
 * Discovers a local CLI executable across env overrides, PATH, version-manager Node installs
 * (mise, volta, nvm, fnm — newest SemVer first), and fixed user/system bin directories.
 */
export async function findLocalExecutable(
  lookup: LocalExecutableLookup,
  options: LocalCapabilityEnvironmentOptions = {},
): Promise<string | undefined> {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const homeDir = options.homeDir ?? homedir()
  const envPath = options.envPath ?? env.PATH ?? ''

  if (lookup.envOverride) {
    const override = env[lookup.envOverride]?.trim()
    if (override) {
      return (await isExecutableFile(override, platform)) ? override : undefined
    }
  }

  const pathDirs = envPath.split(delimiter).filter(Boolean)
  let fallbackDirs: string[] | undefined

  for (const command of [lookup.command, ...(lookup.fallbackCommands ?? [])]) {
    const onPath = await findInDirectories(command, pathDirs, platform, env)
    if (onPath) {
      return onPath
    }
    fallbackDirs ??= await resolveFallbackBinDirs(homeDir, platform, env)
    const searchDirs = lookup.extraDirs?.length
      ? [...fallbackDirs, ...lookup.extraDirs]
      : fallbackDirs
    const inFallback = await findInDirectories(command, searchDirs, platform, env)
    if (inFallback) {
      return inFallback
    }
  }

  return undefined
}

const SENSITIVE_LEAF_PATTERNS = [
  /(?:^|[_.-])(?:api[_-]?key|secret|password|passwd|credential|bearer|access[_-]?token|refresh[_-]?token|auth[_-]?token|id[_-]?token|client[_-]?secret|private[_-]?key)(?:$|[_.-])/i,
  /(?:^|[_.-])(?:apikey|token|key)(?:$|[_.-])/i,
]
const NON_SENSITIVE_LEAF_PATTERN = /max[_-]?(?:output[_-]?)?tokens?|token[_-]?usage|token[_-]?budget|context[_-]?tokens?|reserve[_-]?tokens?|keep[_-]?recent[_-]?tokens?|keybindings?|hotkey|shortcut|auth[_-]?header|co[_-]?authored/i

function isSensitiveKeyPath(keyPath: string): boolean {
  const leaf = keyPath.split('.').pop() ?? keyPath
  if (NON_SENSITIVE_LEAF_PATTERN.test(leaf)) {
    return false
  }
  return SENSITIVE_LEAF_PATTERNS.some(pattern => pattern.test(leaf))
}

function parseTomlKeyPath(line: string, section: string | null): string | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) {
    return null
  }

  const match = /^("[^"]+"|[\w.-]+)\s*=/.exec(trimmed)
  if (!match) {
    return null
  }

  const key = match[1]!.replace(/^"|"$/g, '')
  return section ? `${section}.${key}` : key
}

async function readTomlMetadata(path: string): Promise<{
  keyPaths: string[]
  sensitiveKeyPaths: string[]
}> {
  if (!(await pathExists(path))) {
    return { keyPaths: [], sensitiveKeyPaths: [] }
  }

  const content = await readFile(path, 'utf8')
  const keyPaths: string[] = []
  const sensitiveKeyPaths: string[] = []
  let section: string | null = null

  for (const line of content.split(/\r?\n/)) {
    const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (sectionMatch) {
      section = sectionMatch[1]!.trim()
      continue
    }

    const keyPath = parseTomlKeyPath(line, section)
    if (!keyPath) {
      continue
    }

    if (isSensitiveKeyPath(keyPath)) {
      sensitiveKeyPaths.push(keyPath)
    }
    else {
      keyPaths.push(keyPath)
    }
  }

  return {
    keyPaths: Array.from(new Set(keyPaths)).sort(),
    sensitiveKeyPaths: Array.from(new Set(sensitiveKeyPaths)).sort(),
  }
}

async function readJsonMetadata(path: string): Promise<{
  keyPaths: string[]
  sensitiveKeyPaths: string[]
}> {
  if (!(await pathExists(path))) {
    return { keyPaths: [], sensitiveKeyPaths: [] }
  }

  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    const keyPaths: string[] = []
    const sensitiveKeyPaths: string[] = []
    const visit = (node: unknown, prefix: string, depth: number): void => {
      if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 3) {
        return
      }
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const keyPath = prefix ? `${prefix}.${key}` : key
        if (isSensitiveKeyPath(keyPath)) {
          sensitiveKeyPaths.push(keyPath)
          continue
        }
        keyPaths.push(keyPath)
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          visit(value, keyPath, depth + 1)
        }
      }
    }
    visit(parsed, '', 0)
    return {
      keyPaths: Array.from(new Set(keyPaths)).sort(),
      sensitiveKeyPaths: Array.from(new Set(sensitiveKeyPaths)).sort(),
    }
  }
  catch {
    return { keyPaths: [], sensitiveKeyPaths: [] }
  }
}

async function readYamlTopLevelMetadata(path: string): Promise<{
  keyPaths: string[]
  sensitiveKeyPaths: string[]
}> {
  if (!(await pathExists(path))) {
    return { keyPaths: [], sensitiveKeyPaths: [] }
  }

  try {
    const content = await readFile(path, 'utf8')
    const keyPaths: string[] = []
    const sensitiveKeyPaths: string[] = []
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) {
        continue
      }
      const match = /^([\w.-]+)\s*:/.exec(trimmed)
      if (!match) {
        continue
      }
      const key = match[1]!
      if (isSensitiveKeyPath(key)) {
        sensitiveKeyPaths.push(key)
      }
      else if (!line.startsWith(' ') && !line.startsWith('\t')) {
        keyPaths.push(key)
      }
    }
    return {
      keyPaths: Array.from(new Set(keyPaths)).sort(),
      sensitiveKeyPaths: Array.from(new Set(sensitiveKeyPaths)).sort(),
    }
  }
  catch {
    return { keyPaths: [], sensitiveKeyPaths: [] }
  }
}

function parseSkillFrontmatter(content: string): {
  name?: string
  description?: string
} {
  if (!content.startsWith('---')) {
    return {}
  }

  const end = content.indexOf('\n---', 3)
  if (end < 0) {
    return {}
  }

  const frontmatter = content.slice(3, end)
  const result: { name?: string, description?: string } = {}

  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim()
    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '')
    if (key === 'name') {
      result.name = value
    }
    if (key === 'description') {
      result.description = value
    }
  }

  return result
}

async function listSkillDirectories(skillsRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsRoot, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  }
  catch {
    return []
  }
}

function getRecommendedSkill(skillId: string) {
  return RECOMMENDED_SKILLS.find(skill => skill.id === skillId)
}

async function resolveSkillSummary(skillId: string, skillsRoot: string): Promise<LocalSkillSummary> {
  const recommended = getRecommendedSkill(skillId)
  const skillPath = join(skillsRoot, skillId)
  const manifestPath = join(skillPath, 'SKILL.md')
  const installed = await pathExists(manifestPath)
  const manifest = installed ? parseSkillFrontmatter(await readFile(manifestPath, 'utf8')) : {}
  const mode = recommended?.mode ?? 'external'

  return {
    id: skillId,
    name: manifest.name || recommended?.name || skillId,
    description: manifest.description || recommended?.description || '',
    installed,
    mode,
    riskLevel: mode === 'gated' ? 'high' : 'low',
    capabilities: recommended?.capabilities ? [...recommended.capabilities] : [],
    path: skillPath,
    manifestPath,
    updatedAt: await getMtime(manifestPath),
  }
}

async function resolveSkillProviders(paths: RuntimePaths): Promise<LocalSkillSummary[]> {
  const skillsRoot = join(paths.codexHome || resolveCodexHome(paths.homeDir), 'skills')
  const localSkillIds = await listSkillDirectories(skillsRoot)
  const recommendedSkillIds = new Set<string>(RECOMMENDED_SKILLS.map(skill => skill.id))
  const externalSkillIds = []
  for (const skillId of localSkillIds) {
    if (recommendedSkillIds.has(skillId)) {
      continue
    }
    if (await pathExists(join(skillsRoot, skillId, 'SKILL.md'))) {
      externalSkillIds.push(skillId)
    }
  }
  const skillIds = Array.from(new Set([...recommendedSkillIds, ...externalSkillIds])).sort()

  return await Promise.all(skillIds.map(skillId => resolveSkillSummary(skillId, skillsRoot)))
}

function buildDocCandidatePaths(paths: RuntimePaths) {
  return [
    join(paths.cwd, 'AGENTS.md'),
    join(paths.cwd, 'CLAUDE.md'),
    join(paths.cwd, '.codex'),
    join(paths.cwd, '.claude'),
  ]
}

async function resolveConfigFiles(paths: RuntimePaths): Promise<LocalConfigFileSummary[]> {
  const codexHome = paths.codexHome || resolveCodexHome(paths.homeDir, paths.env)
  const claudeHome = resolveClaudeHome(paths.homeDir, paths.env)
  const ompAgentDir = resolveOmpAgentDir(paths.homeDir, paths.env)
  const piAgentDir = resolvePiAgentDir(paths.homeDir, paths.env)

  const codexConfigPath = join(codexHome, 'config.toml')
  const claudeSettingsPath = join(claudeHome, 'settings.json')
  const ompModelsPath = join(ompAgentDir, 'models.yml')
  const ompConfigPath = join(ompAgentDir, 'config.yml')
  const piModelsPath = join(piAgentDir, 'models.json')
  const piSettingsPath = join(piAgentDir, 'settings.json')

  const [codexConfig, claudeSettings, ompModels, ompConfig, piModels, piSettings] = await Promise.all([
    readTomlMetadata(codexConfigPath),
    readJsonMetadata(claudeSettingsPath),
    readYamlTopLevelMetadata(ompModelsPath),
    readYamlTopLevelMetadata(ompConfigPath),
    readJsonMetadata(piModelsPath),
    readJsonMetadata(piSettingsPath),
  ])

  const extraConfigs: LocalConfigFileSummary[] = []
  const optionalConfigs: Array<{
    tool: LocalToolId
    path: string
    meta: { keyPaths: string[], sensitiveKeyPaths: string[] }
  }> = [
    { tool: 'claude', path: claudeSettingsPath, meta: claudeSettings },
    { tool: 'omp', path: ompModelsPath, meta: ompModels },
    { tool: 'omp', path: ompConfigPath, meta: ompConfig },
    { tool: 'pi', path: piModelsPath, meta: piModels },
    { tool: 'pi', path: piSettingsPath, meta: piSettings },
  ]
  for (const item of optionalConfigs) {
    if (await pathExists(item.path)) {
      extraConfigs.push({
        tool: item.tool,
        path: item.path,
        exists: true,
        kind: 'config',
        keyPaths: item.meta.keyPaths,
        sensitiveKeyPaths: item.meta.sensitiveKeyPaths,
        updatedAt: await getMtime(item.path),
      })
    }
  }

  const docs: Array<Pick<LocalConfigFileSummary, 'path' | 'kind' | 'updatedAt'>> = []

  for (const candidate of buildDocCandidatePaths(paths)) {
    if (await pathExists(candidate)) {
      docs.push({
        path: candidate,
        kind: candidate.endsWith('.md')
          ? 'instructions'
          : candidate.includes('.codex')
            ? 'codex-project'
            : 'claude-project',
        updatedAt: await getMtime(candidate),
      })
    }
  }

  return [
    {
      tool: 'codex',
      path: codexConfigPath,
      exists: await pathExists(codexConfigPath),
      kind: 'config',
      keyPaths: codexConfig.keyPaths,
      sensitiveKeyPaths: codexConfig.sensitiveKeyPaths,
      updatedAt: await getMtime(codexConfigPath),
    },
    ...extraConfigs,
    ...docs.map(doc => ({
      tool:
        doc.path.endsWith('CLAUDE.md') || doc.path.includes('.claude')
          ? ('claude' as const)
          : ('codex' as const),
      path: doc.path,
      exists: true,
      kind: doc.kind,
      keyPaths: [],
      sensitiveKeyPaths: [],
      updatedAt: doc.updatedAt,
    })),
  ]
}

export async function getLocalCapabilityEnvironment(
  cwd = process.cwd(),
  options: LocalCapabilityEnvironmentOptions = {},
): Promise<LocalCapabilityEnvironment> {
  const env = options.env ?? process.env
  const homeDir = options.homeDir ?? homedir()
  const platform = options.platform ?? process.platform
  const envPath = options.envPath ?? env.PATH ?? ''
  const codexHome = options.codexHome ?? env.CODEX_HOME

  const paths: RuntimePaths = {
    cwd,
    homeDir,
    envPath,
    env,
    platform,
    codexHome,
  }
  const resolvedCodexHome = paths.codexHome || resolveCodexHome(paths.homeDir, paths.env)
  const resolvedClaudeHome = resolveClaudeHome(paths.homeDir, paths.env)
  const resolvedOmpAgentDir = resolveOmpAgentDir(paths.homeDir, paths.env)
  const resolvedPiAgentDir = resolvePiAgentDir(paths.homeDir, paths.env)
  const herdrStateDir = join(paths.homeDir, '.local', 'state', 'herdr-core')
  const herdrExtraDirs = platform === 'darwin'
    ? [join(paths.homeDir, '.local', 'share', 'herdr-core', 'active', 'Herdr Core.app', 'Contents', 'MacOS')]
    : []
  const skillsRoot = join(resolvedCodexHome, 'skills')
  const discoveryOptions: LocalCapabilityEnvironmentOptions = {
    homeDir,
    envPath,
    env,
    platform,
  }

  const [codexPath, claudePath, ompPath, piPath, herdrPath, configFiles, skillProviders] = await Promise.all([
    findLocalExecutable({ command: 'codex', envOverride: 'TUFF_CODEX_CLI_PATH' }, discoveryOptions),
    findLocalExecutable({ command: 'claude', envOverride: 'TUFF_CLAUDE_CLI_PATH' }, discoveryOptions),
    findLocalExecutable({ command: 'omp', envOverride: 'TUFF_OMP_CLI_PATH' }, discoveryOptions),
    findLocalExecutable({ command: 'pi', fallbackCommands: ['pie'], envOverride: 'TUFF_PI_CLI_PATH' }, discoveryOptions),
    findLocalExecutable(
      { command: 'herdr-core', envOverride: 'TUFF_HERDR_CORE_PATH', extraDirs: herdrExtraDirs },
      discoveryOptions,
    ),
    resolveConfigFiles(paths),
    resolveSkillProviders(paths),
  ])

  return {
    scannedAt: Date.now(),
    cwd: resolve(cwd),
    skillsRoot,
    tools: [
      {
        id: 'codex',
        name: 'Codex',
        installed: Boolean(codexPath),
        executablePath: codexPath,
        configRoots: [resolvedCodexHome],
      },
      {
        id: 'claude',
        name: 'Claude',
        installed: Boolean(claudePath),
        executablePath: claudePath,
        configRoots: [resolvedClaudeHome, paths.cwd],
      },
      {
        id: 'omp',
        name: 'OMP',
        installed: Boolean(ompPath),
        executablePath: ompPath,
        configRoots: [resolvedOmpAgentDir],
      },
      {
        id: 'pi',
        name: 'Pi',
        installed: Boolean(piPath),
        executablePath: piPath,
        configRoots: [resolvedPiAgentDir],
      },
      {
        id: 'herdr',
        name: 'Herdr Core',
        installed: Boolean(herdrPath),
        executablePath: herdrPath,
        configRoots: [herdrStateDir],
      },
    ],
    configFiles,
    skillProviders,
  }
}

export function createSkillInstallPlan(options: SkillInstallOptions = {}): SkillInstallPlan {
  const targetRoot = resolve(options.targetRoot || resolveDefaultSkillsRoot())
  const includeGated = options.includeGated ?? false
  const skills = RECOMMENDED_SKILLS.filter(skill => includeGated || skill.mode === 'core')
  const items = skills.map<SkillInstallPlanItem>((skill) => {
    const targetDir = join(targetRoot, skill.id)
    return {
      id: skill.id,
      name: skill.name,
      mode: skill.mode,
      targetDir,
      manifestPath: join(targetDir, 'SKILL.md'),
      status: 'create',
    }
  })

  return { targetRoot, items }
}

export async function resolveSkillInstallPlan(
  options: SkillInstallOptions = {},
): Promise<SkillInstallPlan> {
  const plan = createSkillInstallPlan(options)
  const items: SkillInstallPlanItem[] = []

  for (const item of plan.items) {
    const exists = await pathExists(item.manifestPath)
    items.push({
      ...item,
      status: exists ? (options.overwrite ? 'overwrite' : 'skip') : 'create',
      reason: exists && !options.overwrite ? 'already-installed' : undefined,
    })
  }

  return {
    ...plan,
    items,
  }
}

function renderSkillManifest(skillId: RecommendedSkillId): string {
  const skill = RECOMMENDED_SKILLS.find(item => item.id === skillId)
  if (!skill) {
    throw new Error(`Unknown skill: ${skillId}`)
  }

  const capabilities = skill.capabilities.map(capability => `- ${capability}`).join('\n')
  const riskNote
    = skill.mode === 'gated'
      ? 'This skill may require user approval or external credentials before actions run.'
      : 'This skill is intended for local, low-risk assistant workflows.'

  return `---
name: ${skill.id}
description: ${skill.description}
---

# ${skill.name}

${skill.description}

## Capabilities

${capabilities}

## Gate

Mode: ${skill.mode}

${riskNote}

## Usage

Use this skill when the request clearly matches the capability list above. Keep actions explicit, inspect local context first, and ask for confirmation before changing external state or writing sensitive configuration.
`
}

export async function installRecommendedSkills(
  plan: SkillInstallPlan,
): Promise<SkillInstallResult> {
  const written: SkillInstallPlanItem[] = []
  const skipped: SkillInstallPlanItem[] = []

  for (const item of plan.items) {
    if (item.status === 'skip') {
      skipped.push(item)
      continue
    }

    await mkdir(item.targetDir, { recursive: true })
    await writeFile(item.manifestPath, renderSkillManifest(item.id), 'utf8')
    written.push(item)
  }

  return { written, skipped }
}
