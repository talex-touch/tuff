import { constants } from 'node:fs'
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import process from 'node:process'

const SENSITIVE_KEYWORDS = ['token', 'key', 'secret', 'password', 'credential', 'auth']

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

export interface LocalToolSummary {
  id: 'codex' | 'claude'
  name: string
  installed: boolean
  executablePath?: string
  configRoots: string[]
}

export interface LocalConfigFileSummary {
  tool: 'codex' | 'claude'
  path: string
  exists: boolean
  kind: 'config' | 'instructions' | 'codex-project' | 'claude-project'
  keyPaths: string[]
  sensitiveKeyPaths: string[]
  updatedAt?: number
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
  codexHome?: string
}

function resolveCodexHome(homeDir = homedir()): string {
  return process.env.CODEX_HOME || join(homeDir, '.codex')
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

async function getMtime(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs
  }
  catch {
    return undefined
  }
}

function resolveExecutableCandidates(command: string, envPath: string): string[] {
  const extensions
    = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : ['']
  return envPath
    .split(delimiter)
    .filter(Boolean)
    .flatMap(entry => extensions.map(ext => join(entry, `${command}${ext}`)))
}

async function findExecutable(command: string, envPath: string): Promise<string | undefined> {
  for (const candidate of resolveExecutableCandidates(command, envPath)) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }
  return undefined
}

function isSensitiveKeyPath(keyPath: string): boolean {
  const normalized = keyPath.toLowerCase()
  return SENSITIVE_KEYWORDS.some(keyword => normalized.includes(keyword))
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
  const recommendedSkillIds = new Set(RECOMMENDED_SKILLS.map(skill => skill.id))
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
  const codexHome = paths.codexHome || resolveCodexHome(paths.homeDir)
  const codexConfigPath = join(codexHome, 'config.toml')
  const codexConfig = await readTomlMetadata(codexConfigPath)
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
): Promise<LocalCapabilityEnvironment> {
  const paths: RuntimePaths = {
    cwd,
    homeDir: homedir(),
    envPath: process.env.PATH || '',
    codexHome: process.env.CODEX_HOME,
  }
  const skillsRoot = join(paths.codexHome || resolveCodexHome(paths.homeDir), 'skills')

  const [codexPath, claudePath, configFiles, skillProviders] = await Promise.all([
    findExecutable('codex', paths.envPath),
    findExecutable('claude', paths.envPath),
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
        configRoots: [paths.codexHome || resolveCodexHome(paths.homeDir)],
      },
      {
        id: 'claude',
        name: 'Claude',
        installed: Boolean(claudePath),
        executablePath: claudePath,
        configRoots: [join(paths.homeDir, '.claude'), paths.cwd],
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
