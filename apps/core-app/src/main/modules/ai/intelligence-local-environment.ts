import type {
  IntelligenceLocalConfigFileSummary,
  IntelligenceLocalEnvironmentSummary,
  IntelligenceLocalSkillProviderSummary
} from '@talex-touch/tuff-intelligence'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { homedir } from 'node:os'

const SENSITIVE_KEY_PATTERN = /(token|key|secret|password|credential|auth)/i
const INTERNAL_SKILL_IDS = [
  'openai-docs',
  'playwright',
  'screenshot',
  'pdf',
  'doc',
  'frontend-skill',
  'gh-fix-ci',
  'gh-address-comments',
  'sentry',
  'linear',
  'cloudflare-deploy',
  'netlify-deploy'
] as const

const CORE_SKILL_IDS = new Set<string>([
  'openai-docs',
  'playwright',
  'screenshot',
  'pdf',
  'doc',
  'frontend-skill'
])

const GATED_SKILL_IDS = new Set<string>([
  'gh-fix-ci',
  'gh-address-comments',
  'sentry',
  'linear',
  'cloudflare-deploy',
  'netlify-deploy'
])

const CAPABILITY_BY_SKILL: Record<string, string[]> = {
  'openai-docs': ['docs.openai.search', 'docs.openai.answer'],
  playwright: ['browser.qa.run', 'browser.screenshot.capture'],
  screenshot: ['desktop.screenshot.capture'],
  pdf: ['document.pdf.read', 'document.pdf.create'],
  doc: ['document.docx.read', 'document.docx.create'],
  'frontend-skill': ['frontend.design.review', 'frontend.prototype.build'],
  'gh-fix-ci': ['github.ci.inspect', 'github.ci.fix-plan'],
  'gh-address-comments': ['github.pr.comments.address'],
  sentry: ['observability.sentry.inspect'],
  linear: ['project.linear.manage'],
  'cloudflare-deploy': ['deploy.cloudflare.plan'],
  'netlify-deploy': ['deploy.netlify.plan']
}

interface RuntimePaths {
  cwd: string
  homeDir: string
  envPath: string
  codexHome?: string
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function getMtime(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return undefined
  }
}

function resolveExecutableCandidates(command: string, envPath: string): string[] {
  const extensions =
    process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : ['']
  return envPath
    .split(delimiter)
    .filter(Boolean)
    .flatMap((entry) => extensions.map((ext) => join(entry, `${command}${ext}`)))
}

async function findExecutable(command: string, envPath: string): Promise<string | undefined> {
  for (const candidate of resolveExecutableCandidates(command, envPath)) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }
  return undefined
}

function parseTomlKeyPath(line: string, section: string | null): string | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }
  if (trimmed.startsWith('[')) {
    return null
  }

  const match = /^("[^"]+"|[A-Za-z0-9_.-]+)\s*=/.exec(trimmed)
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

    if (SENSITIVE_KEY_PATTERN.test(keyPath)) {
      sensitiveKeyPaths.push(keyPath)
    } else {
      keyPaths.push(keyPath)
    }
  }

  return {
    keyPaths: Array.from(new Set(keyPaths)).sort(),
    sensitiveKeyPaths: Array.from(new Set(sensitiveKeyPaths)).sort()
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
  const result: { name?: string; description?: string } = {}

  for (const line of frontmatter.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(line.trim())
    if (!match) {
      continue
    }

    const key = match[1]
    const value = match[2]!.trim().replace(/^["']|["']$/g, '')
    if (key === 'name') {
      result.name = value
    }
    if (key === 'description') {
      result.description = value
    }
  }

  return result
}

async function readSkillManifest(
  skillId: string,
  skillPath: string
): Promise<IntelligenceLocalSkillProviderSummary | null> {
  const manifestPath = join(skillPath, 'SKILL.md')
  if (!(await pathExists(manifestPath))) {
    return null
  }

  const content = await readFile(manifestPath, 'utf8')
  const frontmatter = parseSkillFrontmatter(content)
  const mode: IntelligenceLocalSkillProviderSummary['mode'] = CORE_SKILL_IDS.has(skillId)
    ? 'core'
    : GATED_SKILL_IDS.has(skillId)
      ? 'gated'
      : 'external'

  return {
    id: skillId,
    name: frontmatter.name || skillId,
    description: frontmatter.description || '',
    source: 'codex-local' as const,
    installed: true,
    enabled: mode === 'core',
    mode,
    riskLevel: mode === 'gated' ? ('high' as const) : ('low' as const),
    capabilities: CAPABILITY_BY_SKILL[skillId] ?? [],
    path: skillPath,
    manifestPath,
    updatedAt: await getMtime(manifestPath)
  }
}

async function listCodexSkillDirectories(skillsRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

async function resolveSkillProviders(
  paths: RuntimePaths
): Promise<IntelligenceLocalSkillProviderSummary[]> {
  const codexHome = paths.codexHome || join(paths.homeDir, '.codex')
  const skillsRoot = join(codexHome, 'skills')
  const localSkillIds = new Set(await listCodexSkillDirectories(skillsRoot))
  const skillIds = Array.from(new Set([...INTERNAL_SKILL_IDS, ...localSkillIds])).sort()
  const providers: IntelligenceLocalSkillProviderSummary[] = []

  for (const skillId of skillIds) {
    const skillPath = join(skillsRoot, skillId)
    const manifest = await readSkillManifest(skillId, skillPath)
    if (manifest) {
      providers.push(manifest)
      continue
    }

    if ((INTERNAL_SKILL_IDS as readonly string[]).includes(skillId)) {
      const mode: IntelligenceLocalSkillProviderSummary['mode'] = CORE_SKILL_IDS.has(skillId)
        ? 'core'
        : 'gated'
      providers.push({
        id: skillId,
        name: skillId,
        description: '',
        source: 'codex-local' as const,
        installed: false,
        enabled: false,
        mode,
        riskLevel: mode === 'gated' ? ('high' as const) : ('low' as const),
        capabilities: CAPABILITY_BY_SKILL[skillId] ?? [],
        path: skillPath,
        manifestPath: join(skillPath, 'SKILL.md')
      })
    }
  }

  return providers
}

function buildDocCandidatePaths(paths: RuntimePaths) {
  return [
    join(paths.cwd, 'AGENTS.md'),
    join(paths.cwd, 'CLAUDE.md'),
    join(paths.cwd, '.codex'),
    join(paths.cwd, '.claude'),
    join(paths.cwd, 'apps/core-app/AGENTS.md'),
    join(paths.cwd, 'apps/core-app/.codex')
  ]
}

async function resolveConfigFiles(
  paths: RuntimePaths
): Promise<IntelligenceLocalConfigFileSummary[]> {
  const codexHome = paths.codexHome || join(paths.homeDir, '.codex')
  const codexConfigPath = join(codexHome, 'config.toml')
  const codexConfig = await readTomlMetadata(codexConfigPath)
  const docs: Array<Pick<IntelligenceLocalConfigFileSummary, 'path' | 'kind' | 'updatedAt'>> = []

  for (const candidate of buildDocCandidatePaths(paths)) {
    if (await pathExists(candidate)) {
      docs.push({
        path: candidate,
        kind: candidate.endsWith('.md')
          ? ('instructions' as const)
          : candidate.includes('.codex')
            ? ('codex-project' as const)
            : ('claude-project' as const),
        updatedAt: await getMtime(candidate)
      })
    }
  }

  return [
    {
      tool: 'codex' as const,
      path: codexConfigPath,
      exists: await pathExists(codexConfigPath),
      kind: 'config' as const,
      keyPaths: codexConfig.keyPaths,
      sensitiveKeyPaths: codexConfig.sensitiveKeyPaths,
      updatedAt: await getMtime(codexConfigPath)
    },
    ...docs.map((doc) => ({
      tool:
        doc.path.endsWith('CLAUDE.md') || doc.path.includes('.claude')
          ? ('claude' as const)
          : ('codex' as const),
      path: doc.path,
      exists: true,
      kind: doc.kind,
      keyPaths: [],
      sensitiveKeyPaths: [],
      updatedAt: doc.updatedAt
    }))
  ]
}

export async function getIntelligenceLocalEnvironment(
  cwd = process.cwd()
): Promise<IntelligenceLocalEnvironmentSummary> {
  const paths: RuntimePaths = {
    cwd,
    homeDir: homedir(),
    envPath: process.env.PATH || '',
    codexHome: process.env.CODEX_HOME
  }

  const [codexPath, claudePath, configFiles, skillProviders] = await Promise.all([
    findExecutable('codex', paths.envPath),
    findExecutable('claude', paths.envPath),
    resolveConfigFiles(paths),
    resolveSkillProviders(paths)
  ])

  return {
    scannedAt: Date.now(),
    cwd: resolve(cwd),
    tools: [
      {
        id: 'codex',
        name: 'Codex',
        installed: Boolean(codexPath),
        executablePath: codexPath,
        configRoots: [paths.codexHome || join(paths.homeDir, '.codex')]
      },
      {
        id: 'claude',
        name: 'Claude',
        installed: Boolean(claudePath),
        executablePath: claudePath,
        configRoots: [join(paths.homeDir, '.claude'), paths.cwd]
      }
    ],
    configFiles,
    skillProviders
  }
}
