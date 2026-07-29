import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const AI_DOC_CHECKS = Object.freeze([
  {
    file: 'docs/plan-prd/03-features/ai-2.5.0-plan-prd.md',
    needles: ['Stable 只承诺 **CoreBox 文本 + OCR + provider routing + 明确失败路径**', 'CoreBox AI Ask', '默认 Nexus AI provider', '--requireCurrentVersion'],
  },
  { file: 'docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md', needles: ['SQLite / FTS5 / metadata', 'Context Builder', '不把 embeddings 或向量数据库作为第一优先级'] },
  { file: 'docs/plan-prd/03-features/ai-2.5.4-context-hygiene-memory-prd.md', needles: ['Session / Checkpoint / Memory / Compression / ContextPackage', '默认轻上下文', '旧 session 原文不默认注入 prompt'] },
  { file: 'docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md', needles: ['不强依赖 Ollama', '内置 GGUF runtime', '模型权重按需下载'] },
  { file: 'docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md', needles: ['whisper.cpp', 'local-only', '不做 TTS'] },
  { file: 'docs/plan-prd/TODO.md', needles: ['R2 AI Stable', 'historical 13/13 / current recapture open', '--requireCurrentVersion', 'R9.2 ContextHygiene', 'R8-F CatalogService MVP'] },
  { file: 'docs/plan-prd/04-implementation/AI-2.5x-Execution-Plan-2026-06-16.md', needles: ['2.5.0 可见体验证据', '2.5.3 Context Builder 基座', '2.5.4 ContextHygiene', '2.5.5 / 2.5.8 非当前抢占范围', '验证门禁', '后续切片'] },
])

const CURRENT_PROMOTION = /(?:current|当前)[\s\S]{0,80}?(?:CoreApp\s*)?(\d+\.\d+\.\d+(?:-[\w.]+)?)[\s\S]{0,100}?(?:passed|complete|完成|已闭合)/i
const CURRENT_PROMOTION_NEGATION = /fail-closed|不再称为|not\s+(?:passed|complete)|(?:current|当前)[\s\S]{0,80}?(?:open|未完成|未通过)/i
const CURRENT_COMPLETION_WITHOUT_VERSION = /(?:current|当前)[\s\S]{0,80}?(?:strict visible gate|packaged evidence|体验证据)[\s\S]{0,80}?(?:passed|complete|完成|已闭合)/i
const HISTORICAL_PROMOTION = /historical[\s\S]{0,80}?(?:proves?|shows?)[\s\S]{0,80}?(?:current|当前)[\s\S]{0,80}?(?:packaged evidence|recapture|completed?)/i

function readRepoFile(repoRoot, file) {
  try {
    return readFileSync(new URL(file, repoRoot), 'utf8')
  }
  catch (error) {
    if (error?.code === 'ENOENT')
      return null
    throw error
  }
}

function currentCoreAppVersion(repoRoot) {
  const content = readRepoFile(repoRoot, 'apps/core-app/package.json')
  if (content === null)
    return null
  const version = JSON.parse(content).version
  return typeof version === 'string' ? version : null
}

function promotionFailures(file, content, currentVersion) {
  const failures = new Map()
  const clauses = content.split(/(?<=[.!?。！？])(?:\s+|$)|\n+/).filter(Boolean)
  for (const clause of clauses) {
    if (CURRENT_PROMOTION_NEGATION.test(clause))
      continue
    if (HISTORICAL_PROMOTION.test(clause)) {
      const message = `historical evidence cannot prove current CoreApp ${currentVersion} packaged evidence`
      failures.set(message, { file, message })
      continue
    }
    const match = CURRENT_PROMOTION.exec(clause)
    if (match && match[1] !== currentVersion) {
      const message = `current evidence promotion names ${match[1]}, not CoreApp ${currentVersion}`
      failures.set(message, { file, message })
    }
    else if (CURRENT_COMPLETION_WITHOUT_VERSION.test(clause)) {
      const message = `current evidence completion must name exact CoreApp ${currentVersion}`
      failures.set(message, { file, message })
    }
  }
  return [...failures.values()]
}

export function verifyAiDocs(repoRoot = new URL('../../', import.meta.url)) {
  const root = typeof repoRoot === 'string'
    ? new URL(`file://${repoRoot.endsWith('/') ? repoRoot : `${repoRoot}/`}`)
    : repoRoot
  const currentVersion = currentCoreAppVersion(root)
  const failures = []
  if (!currentVersion)
    failures.push({ file: 'apps/core-app/package.json', message: 'CoreApp version is missing' })
  for (const check of AI_DOC_CHECKS) {
    const content = readRepoFile(root, check.file)
    if (content === null) {
      failures.push({ file: check.file, message: 'file is missing' })
      continue
    }
    for (const needle of check.needles) {
      if (!content.includes(needle))
        failures.push({ file: check.file, message: `missing ${JSON.stringify(needle)}` })
    }
    if (currentVersion && (check.file.includes('ai-2.5.0') || check.file.includes('AI-2.5x-Execution-Plan'))) {
      failures.push(...promotionFailures(check.file, content, currentVersion))
    }
  }
  return failures
}

export function renderAiDocsFailures(failures) {
  return failures.map(failure => `${failure.file}: ${failure.message}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = verifyAiDocs(new URL('../../', import.meta.url))
  if (failures.length) {
    console.error('AI docs verification failed:')
    for (const failure of renderAiDocsFailures(failures))
      console.error(`- ${failure}`)
    process.exitCode = 1
  }
  else {
    console.log('AI docs verification passed')
    for (const check of AI_DOC_CHECKS)
      console.log(`- ${check.file}`)
  }
}
