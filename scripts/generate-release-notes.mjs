#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import process, { env, exit } from 'node:process'
import { pathToFileURL } from 'node:url'
import { getArgValue, hasFlag } from './lib/argv-utils.mjs'

// Fallback @-handle used when a PR's real author can't be resolved (no token,
// a non-PR commit, or a GitHub API miss). Mentioning the maintainer is correct
// and actionable; a literal `@unknown` pings a bogus/unrelated account.
const FALLBACK_AUTHOR_LOGIN = 'TalexDreamSoul'

const CATEGORY_DEFINITIONS = [
  {
    key: 'features',
    zh: '新功能与增强',
    en: 'Features and Enhancements',
    labels: ['feature', 'enhancement', 'feat'],
  },
  {
    key: 'fixes',
    zh: '修复',
    en: 'Fixes',
    labels: ['bug', 'fix', 'bugfix'],
  },
  {
    key: 'docs',
    zh: '文档',
    en: 'Documentation',
    labels: ['documentation', 'docs'],
  },
  {
    key: 'maintenance',
    zh: '维护',
    en: 'Maintenance',
    labels: ['chore', 'refactor', 'build', 'ci', 'test', 'tests'],
  },
  {
    key: 'other',
    zh: '其他',
    en: 'Other',
    labels: [],
  },
]

const RELEASE_NOTE_PLACEHOLDER_PATTERNS = [
  /provide a concise summary/i,
  /可直接用于生成 release notes/i,
  /发布说明/,
]

const DOWNLOAD_MATRIX_ROWS = [
  {
    os: 'Android',
    downloads: ['APK ARMv8', 'APK ARMv7', 'APK x64'],
    availability: 'planned',
  },
  {
    os: 'iOS',
    downloads: ['IPA Unsigned'],
    availability: 'planned',
  },
  {
    os: 'macOS',
    downloads: ['[ZIP Apple Silicon](https://tuff.tagzxia.com/updates)'],
    availability: 'available',
  },
  {
    os: 'Windows',
    downloads: ['[Setup x64](https://tuff.tagzxia.com/updates)'],
    availability: 'available',
  },
  {
    os: 'Linux',
    downloads: [
      '[AppImage x64](https://tuff.tagzxia.com/updates)',
      '[DEB x64](https://github.com/talex-touch/tuff/releases)',
    ],
    availability: 'available',
  },
]

function runGit(args, { fallback = '' } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }
  catch (error) {
    if (fallback !== undefined) {
      return fallback
    }
    throw error
  }
}

function sanitizeMarkdown(input) {
  return (input ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\t ]*[-*]\s*[☐☑]\s*/gm, '- ')
    .replace(/\r/g, '')
    .trim()
}

function normalizeLabel(label) {
  if (typeof label === 'string') {
    return label.toLowerCase()
  }

  return String(label?.name ?? '').toLowerCase()
}

function detectLanguage(text) {
  const chineseCount = (text.match(/[\u4E00-\u9FFF]/g) ?? []).length
  const latinCount = (text.match(/[A-Z]/gi) ?? []).length

  if (chineseCount === 0 && latinCount === 0) {
    return 'unknown'
  }

  if (chineseCount > latinCount * 0.7) {
    return 'zh'
  }

  return 'en'
}

export function inferReleaseChannel(tag) {
  const lower = String(tag ?? '').toLowerCase()
  if (lower.includes('snapshot')) {
    return 'SNAPSHOT'
  }
  if (lower.includes('beta')) {
    return 'BETA'
  }
  return 'RELEASE'
}

export function getVersionFromTag(tag) {
  return String(tag ?? '').replace(/^v/, '')
}

export function findPreviousSameChannelTag(tags, currentTag) {
  const channel = inferReleaseChannel(currentTag)
  return tags.find(tag => tag !== currentTag && inferReleaseChannel(tag) === channel) ?? ''
}

export function extractPrNumbersFromCommits(commits) {
  const seen = new Set()
  const numbers = []

  for (const commit of commits) {
    const text = [commit.subject, commit.body].filter(Boolean).join('\n')
    const patterns = [
      /Merge pull request #(\d+)/gi,
      /\(#(\d+)\)/g,
      /pull\/(\d+)/gi,
      /PR\s*#(\d+)/gi,
    ]

    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const number = Number.parseInt(match[1], 10)
        if (!seen.has(number)) {
          seen.add(number)
          numbers.push(number)
        }
      }
    }
  }

  return numbers
}

export function extractLocalizedReleaseNotes(body) {
  const sanitized = sanitizeMarkdown(body)
  if (!sanitized) {
    return { zh: '', en: '' }
  }

  const lines = sanitized.split('\n')
  const startIndex = lines.findIndex(line =>
    /^#{2,4}\s*(?:Release Notes|发布说明|更新说明|版本说明)/i.test(line.trim()),
  )

  if (startIndex === -1) {
    return { zh: '', en: '' }
  }

  const collected = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^#{2,4}\s+/.test(line)) {
      break
    }
    collected.push(line)
  }

  const section = sanitizeMarkdown(collected.join('\n'))
  if (!section || RELEASE_NOTE_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(section))) {
    return { zh: '', en: '' }
  }

  const localizedNotes = parseLocalizedNoteMarkers(section)

  if (localizedNotes.zh || localizedNotes.en) {
    return localizedNotes
  }

  const language = detectLanguage(section)
  if (language === 'zh') {
    return { zh: section, en: '' }
  }

  return { zh: '', en: section }
}

function parseLocalizedNoteMarkers(section) {
  const result = { zh: '', en: '' }
  let currentLocale = null

  for (const line of section.split('\n')) {
    const delimiterIndex = findLocaleMarkerDelimiter(line)
    const markerKeyRaw = delimiterIndex > 0 ? line.slice(0, delimiterIndex).trim() : ''
    const markerKey = markerKeyRaw.toLowerCase()
    const hasLocaleMarker = ['zh', '中文', 'chinese', 'en', '英文', 'english'].includes(markerKey)

    const marker = hasLocaleMarker
      ? {
          key: markerKey,
          value: line.slice(delimiterIndex + 1).trim(),
        }
      : null

    if (marker) {
      currentLocale = ['zh', '中文', 'chinese'].includes(marker.key) ? 'zh' : 'en'
      result[currentLocale] = [result[currentLocale], marker.value].filter(Boolean).join('\n')
      continue
    }

    if (currentLocale) {
      result[currentLocale] = [result[currentLocale], line].filter(Boolean).join('\n')
    }
  }

  return {
    zh: sanitizeMarkdown(result.zh),
    en: sanitizeMarkdown(result.en),
  }
}

function findLocaleMarkerDelimiter(line) {
  const colonIndex = line.indexOf(':')
  const fullColonIndex = line.indexOf('：')

  if (colonIndex === -1) {
    return fullColonIndex
  }

  if (fullColonIndex === -1) {
    return colonIndex
  }

  return Math.min(colonIndex, fullColonIndex)
}

export function categorizePullRequest(pr) {
  const labels = new Set((pr.labels ?? []).map(normalizeLabel))
  for (const category of CATEGORY_DEFINITIONS) {
    if (category.labels.some(label => labels.has(label))) {
      return category.key
    }
  }

  return 'other'
}

export function shouldSkipPullRequest(pr) {
  return (pr.labels ?? []).map(normalizeLabel).includes('skip-changelog')
}

function getCommitRange(currentTag, previousTag, targetRef = currentTag) {
  if (previousTag) {
    return `${previousTag}..${targetRef}`
  }

  const target = runGit(['rev-parse', '--verify', targetRef], { fallback: '' })
  if (target) {
    return targetRef
  }

  const previousHead = runGit(['rev-parse', '--verify', 'HEAD~1'], { fallback: '' })
  return previousHead ? 'HEAD~1..HEAD' : 'HEAD'
}

function getReachableTags(targetRef) {
  const mergedTags = runGit(['tag', '--merged', targetRef, '--sort=-creatordate'], { fallback: '' })
  const raw = mergedTags || runGit(['tag', '--sort=-creatordate'], { fallback: '' })
  return raw.split('\n').map(tag => tag.trim()).filter(Boolean)
}

function getCommitsForRange(range) {
  const raw = runGit(['log', '--format=%H%x1F%s%x1F%b%x1E', range], { fallback: '' })
  if (!raw) {
    return []
  }

  return raw.split('\x1E')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject = '', body = ''] = entry.split('\x1F')
      return { hash, subject, body }
    })
}

async function requestGitHubJson(endpoint, token, headers = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'tuff-release-notes-generator',
      ...headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API request failed (${response.status}): ${body}`)
  }

  return response.json()
}

async function fetchPullRequest(repo, number, token) {
  if (!repo || !token) {
    return {
      number,
      title: `Pull request #${number}`,
      body: '',
      user: { login: FALLBACK_AUTHOR_LOGIN },
      labels: [],
      html_url: `https://github.com/${repo || 'unknown/repo'}/pull/${number}`,
    }
  }

  const [pull, issue] = await Promise.all([
    requestGitHubJson(`/repos/${repo}/pulls/${number}`, token),
    requestGitHubJson(`/repos/${repo}/issues/${number}`, token),
  ])

  return {
    number,
    title: pull.title ?? issue.title ?? `Pull request #${number}`,
    body: pull.body ?? issue.body ?? '',
    user: pull.user ?? issue.user ?? { login: FALLBACK_AUTHOR_LOGIN },
    labels: issue.labels ?? pull.labels ?? [],
    html_url: pull.html_url ?? issue.html_url,
    merged_at: pull.merged_at,
    merge_commit_sha: pull.merge_commit_sha,
  }
}

function resolvePrDisplayText(pr, locale) {
  const notes = extractLocalizedReleaseNotes(pr.body ?? '')
  const explicit = notes[locale]
  if (explicit) {
    return explicit
  }

  const fallback = notes.zh || notes.en || pr.title || `Pull request #${pr.number}`
  return sanitizeMarkdown(fallback)
}

function groupPullRequests(prs) {
  const groups = new Map(CATEGORY_DEFINITIONS.map(category => [category.key, []]))
  for (const pr of prs) {
    groups.get(categorizePullRequest(pr))?.push(pr)
  }
  return groups
}

function formatPrLine(pr, locale) {
  const text = resolvePrDisplayText(pr, locale)
  const author = pr.user?.login ? `@${pr.user.login}` : `@${FALLBACK_AUTHOR_LOGIN}`
  return `- ${text} ([#${pr.number}](${pr.html_url}) by ${author})`
}

function formatGroupedPrList(prs, locale) {
  const groups = groupPullRequests(prs)
  const lines = []

  for (const category of CATEGORY_DEFINITIONS) {
    const rows = groups.get(category.key) ?? []
    if (rows.length === 0) {
      continue
    }

    lines.push(`### ${category[locale]}`)
    lines.push('')
    lines.push(...rows.map(pr => formatPrLine(pr, locale)))
    lines.push('')
  }

  if (lines.length === 0) {
    lines.push(locale === 'zh'
      ? '- 本次发版区间未检测到可展示的 merged PR。'
      : '- No merged pull requests were detected for this release range.')
    lines.push('')
  }

  return lines.join('\n').trim()
}

function selectHighlights(prs, locale, maxHighlights = 8) {
  const preferred = prs.filter(pr => categorizePullRequest(pr) !== 'maintenance')
  const source = preferred.length > 0 ? preferred : prs
  return source.slice(0, maxHighlights).map(pr => formatPrLine(pr, locale))
}

export function buildReleaseDownloadMatrix(locale = 'en') {
  const isZh = locale === 'zh'
  const lines = [
    isZh ? '## 按设备下载' : '## Download Based on Your Device',
    '',
    `| ${isZh ? '系统' : 'OS'} | ${isZh ? '下载' : 'Download'} |`,
    '| --- | --- |',
  ]

  for (const row of DOWNLOAD_MATRIX_ROWS) {
    const suffix = row.availability === 'planned'
      ? (isZh ? '（计划中）' : ' (planned)')
      : ''
    lines.push(`| ${row.os} | ${row.downloads.join('<br>')}${suffix} |`)
  }

  lines.push('')
  lines.push(isZh
    ? '> 桌面端以当前 GitHub Release / Nexus Updates 页面实际资产为准；移动端包会在对应构建链路上线后开放。'
    : '> Desktop downloads follow the actual GitHub Release / Nexus Updates assets; mobile packages will open after their build pipelines are shipped.')

  return `${lines.join('\n').trimEnd()}\n`
}

function stripReleaseDownloadMatrix(markdown) {
  const candidates = [
    '\n## 按设备下载',
    '\n## Download Based on Your Device',
  ]
  const index = candidates
    .map(heading => markdown.indexOf(heading))
    .filter(position => position >= 0)
    .sort((a, b) => a - b)[0]

  if (index === undefined) {
    return markdown
  }

  return `${markdown.slice(0, index).trimEnd()}\n`
}

async function readOptionalFile(filePath) {
  if (!existsSync(filePath)) {
    return ''
  }

  return readFile(filePath, 'utf8')
}

async function readManualNotes({ notesSourceDir, version }) {
  if (!notesSourceDir) {
    return { zh: '', en: '', shared: '' }
  }

  const base = join(notesSourceDir, `update_${version}`)
  const [zh, en, shared] = await Promise.all([
    readOptionalFile(`${base}.zh.md`),
    readOptionalFile(`${base}.en.md`),
    readOptionalFile(`${base}.md`),
  ])

  return {
    zh: sanitizeMarkdown(zh || shared),
    en: sanitizeMarkdown(en || shared),
    shared: sanitizeMarkdown(shared),
  }
}

function buildGeneratedNotes({ tag, previousTag, prs, manualNotes, locale }) {
  const isZh = locale === 'zh'
  const title = isZh ? `# Tuff ${tag} 更新说明` : `# Tuff ${tag} Release Notes`
  const manual = sanitizeMarkdown(manualNotes[locale])
  const highlights = selectHighlights(prs, locale)
  const mergedPrs = formatGroupedPrList(prs, locale)

  const lines = [title, '']

  if (manual) {
    lines.push(manual.replace(/^# .+\n?/, '').trim())
    lines.push('')
  }
  else {
    lines.push(isZh ? '## 本次更新' : '## Highlights')
    lines.push('')
    if (highlights.length > 0) {
      lines.push(...highlights)
    }
    else {
      lines.push(isZh
        ? `- ${tag} 聚合了 ${previousTag || '初始版本'} 之后的发版区间变更。`
        : `- ${tag} aggregates release changes since ${previousTag || 'the initial release range'}.`)
    }
    lines.push('')
  }

  lines.push(isZh ? '## 已合并 PR' : '## Merged Pull Requests')
  lines.push('')
  lines.push(mergedPrs)
  lines.push('')
  lines.push(isZh ? '## 已验证' : '## Validation')
  lines.push('')
  lines.push(isZh
    ? '- GitHub Actions Build and Release 矩阵构建成功后才会创建该 Release。'
    : '- GitHub Actions creates this release only after the Build and Release matrix succeeds.')
  lines.push(isZh
    ? '- Nexus release sync 会消费同一份中英文 notes payload。'
    : '- Nexus release sync consumes the same bilingual notes payload.')
  lines.push('')
  lines.push(isZh ? '## 已知限制' : '## Known Limitations')
  lines.push('')
  lines.push(isZh
    ? '- 具体平台验证、签名和发布证据仍以当前版本的 Release Evidence 与发布清单为准。'
    : '- Platform validation, signing status, and release evidence remain governed by the release evidence and asset checklist for this version.')
  lines.push('')
  lines.push(buildReleaseDownloadMatrix(locale).trimEnd())

  return `${lines.join('\n').trimEnd()}\n`
}

function buildGitHubBody({ tag, previousTag, prs, zhNotes, enNotes }) {
  const zhHighlights = selectHighlights(prs, 'zh')
  const enHighlights = selectHighlights(prs, 'en')
  const mergedPrs = formatGroupedPrList(prs, 'en')
  const rangeLabel = previousTag ? `${previousTag}...${tag}` : tag

  const lines = [
    `# Tuff ${tag}`,
    '',
    '## 中文摘要',
    '',
  ]

  if (zhHighlights.length > 0) {
    lines.push(...zhHighlights)
  }
  else {
    lines.push('- 本次发版未检测到可展示的 merged PR；请查看下方资产与 Nexus 发布记录。')
  }

  lines.push('')
  lines.push('## English Summary')
  lines.push('')

  if (enHighlights.length > 0) {
    lines.push(...enHighlights)
  }
  else {
    lines.push('- No displayable merged pull requests were detected for this release; see assets and Nexus release records below.')
  }

  lines.push('')
  lines.push('## Merged Pull Requests')
  lines.push('')
  lines.push(`<details><summary>${prs.length} PR(s), range ${rangeLabel}</summary>`)
  lines.push('')
  lines.push(mergedPrs)
  lines.push('')
  lines.push('</details>')
  lines.push('')
  lines.push('## Release Notes')
  lines.push('')
  lines.push('- Full bilingual notes are synced to Nexus through `notes` / `notesHtml`.')
  lines.push(`- Generated source files: \`update_${getVersionFromTag(tag)}.zh.md\`, \`update_${getVersionFromTag(tag)}.en.md\`.`)

  if (zhNotes || enNotes) {
    lines.push('')
    lines.push('## Notes Preview')
    lines.push('')
    lines.push('<details><summary>中文 / English</summary>')
    lines.push('')
    if (zhNotes) {
      lines.push('### 中文')
      lines.push('')
      lines.push(stripReleaseDownloadMatrix(zhNotes).replace(/^# .+\n?/, '').trim())
      lines.push('')
    }
    if (enNotes) {
      lines.push('### English')
      lines.push('')
      lines.push(stripReleaseDownloadMatrix(enNotes).replace(/^# .+\n?/, '').trim())
      lines.push('')
    }
    lines.push('</details>')
  }

  lines.push('')
  lines.push(buildReleaseDownloadMatrix('en').trimEnd())

  return `${lines.join('\n').trimEnd()}\n`
}

export async function buildReleaseNotesPayload({
  tag,
  previousTag = '',
  pullRequests = [],
  notesSourceDir = 'notes',
}) {
  const version = getVersionFromTag(tag)
  const manualNotes = await readManualNotes({ notesSourceDir, version })
  const prs = pullRequests.filter(pr => !shouldSkipPullRequest(pr))

  const zhNotes = buildGeneratedNotes({
    tag,
    previousTag,
    prs,
    manualNotes,
    locale: 'zh',
  })
  const enNotes = buildGeneratedNotes({
    tag,
    previousTag,
    prs,
    manualNotes,
    locale: 'en',
  })

  return {
    version,
    tag,
    previousTag,
    prs,
    zhNotes,
    enNotes,
    githubBody: buildGitHubBody({
      tag,
      previousTag,
      prs,
      zhNotes,
      enNotes,
    }),
  }
}

async function fetchPullRequestsForCommit(repo, hash, token) {
  if (!repo || !token || !hash) {
    return []
  }

  try {
    return await requestGitHubJson(`/repos/${repo}/commits/${hash}/pulls`, token, {
      Accept: 'application/vnd.github.groot-preview+json',
    })
  }
  catch (error) {
    console.warn(`Failed to resolve PRs for commit ${hash}: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

async function resolvePullRequests({ repo, token, tag, previousTag, targetRef }) {
  const range = getCommitRange(tag, previousTag, targetRef)
  const commits = getCommitsForRange(range)
  const seenNumbers = new Set()
  const prNumbers = []

  for (const number of extractPrNumbersFromCommits(commits)) {
    seenNumbers.add(number)
    prNumbers.push(number)
  }

  if (repo && token) {
    for (const commit of commits) {
      const commitPulls = await fetchPullRequestsForCommit(repo, commit.hash, token)
      for (const pr of commitPulls) {
        const number = Number.parseInt(pr.number, 10)
        if (Number.isFinite(number) && !seenNumbers.has(number)) {
          seenNumbers.add(number)
          prNumbers.push(number)
        }
      }
    }
  }

  const prs = []

  for (const number of prNumbers) {
    try {
      prs.push(await fetchPullRequest(repo, number, token))
    }
    catch (error) {
      console.warn(`Failed to resolve PR #${number}: ${error instanceof Error ? error.message : String(error)}`)
      prs.push({
        number,
        title: `Pull request #${number}`,
        body: '',
        user: { login: FALLBACK_AUTHOR_LOGIN },
        labels: [],
        html_url: `https://github.com/${repo}/pull/${number}`,
      })
    }
  }

  return prs
}

async function writePayload(payload, outputDir) {
  await mkdir(outputDir, { recursive: true })

  const zhPath = join(outputDir, `update_${payload.version}.zh.md`)
  const enPath = join(outputDir, `update_${payload.version}.en.md`)
  const githubPath = join(outputDir, 'release-notes.github.md')
  const prsPath = join(outputDir, 'release-prs.json')

  await Promise.all([
    writeFile(zhPath, payload.zhNotes, 'utf8'),
    writeFile(enPath, payload.enNotes, 'utf8'),
    writeFile(githubPath, payload.githubBody, 'utf8'),
    writeFile(prsPath, JSON.stringify({
      tag: payload.tag,
      previousTag: payload.previousTag,
      prs: payload.prs.map(pr => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? FALLBACK_AUTHOR_LOGIN,
        labels: (pr.labels ?? []).map(normalizeLabel),
        url: pr.html_url,
        category: categorizePullRequest(pr),
      })),
    }, null, 2), 'utf8'),
  ])

  return { zhPath, enPath, githubPath, prsPath }
}

async function main() {
  const argv = process.argv.slice(2)
  const tag = getArgValue(argv, '--tag', env.GITHUB_REF_NAME)
  const repo = getArgValue(argv, '--repo', env.GITHUB_REPOSITORY)
  const targetRef = getArgValue(argv, '--target-ref', tag)
  const outputDir = getArgValue(argv, '--output-dir', 'generated-release-notes')
  const notesSourceDir = getArgValue(argv, '--notes-source-dir', 'notes')
  const token = getArgValue(argv, '--github-token', env.GITHUB_TOKEN)
  const explicitPreviousTag = getArgValue(argv, '--previous-tag', '')

  if (!tag) {
    console.error('Usage: node scripts/generate-release-notes.mjs --tag <tag> --repo <owner/repo> [--output-dir <dir>]')
    exit(1)
  }

  const tags = getReachableTags(targetRef)
  const previousTag = explicitPreviousTag || findPreviousSameChannelTag(tags, tag)
  const pullRequests = await resolvePullRequests({ repo, token, tag, previousTag, targetRef })
  const payload = await buildReleaseNotesPayload({
    tag,
    previousTag,
    pullRequests,
    notesSourceDir,
  })

  const written = await writePayload(payload, outputDir)

  if (!hasFlag(argv, '--quiet')) {
    console.log(`Release notes generated for ${tag}`)
    console.log(`Previous same-channel tag: ${previousTag || '(none)'}`)
    console.log(`Merged PRs: ${payload.prs.length}`)
    for (const [key, value] of Object.entries(written)) {
      console.log(`${key}: ${value}`)
    }
  }
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entryPath && basename(process.argv[1]) === 'generate-release-notes.mjs' && import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    exit(1)
  })
}
