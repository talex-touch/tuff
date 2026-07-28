import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'

const LOCALE_CONTRACTS = {
  zh: {
    title: version => `Tuff v${version} 更新说明`,
    headings: {
      摘要: 'summary',
      新增内容: 'whatsNew',
      变更内容: 'whatsChanged',
      破坏性变更: 'breakingChanges',
      已知限制: 'knownLimitations',
    },
  },
  en: {
    title: version => `Tuff v${version} Release Notes`,
    headings: {
      'Summary Notes': 'summary',
      'What\'s New': 'whatsNew',
      'What\'s Changed': 'whatsChanged',
      'Breaking Changes': 'breakingChanges',
      'Known Limitations': 'knownLimitations',
    },
  },
}

const SECTION_KEYS = ['summary', 'whatsNew', 'whatsChanged', 'breakingChanges', 'knownLimitations']

const REQUIRED_SECTIONS = ['summary', 'whatsChanged']
const OPTIONAL_SECTIONS = ['whatsNew', 'breakingChanges', 'knownLimitations']
const PLACEHOLDER_PATTERN = /^(?:none|n\/?a|not applicable|tbd|todo|无|暂无|无新功能|不适用|待定)(?:\s*[:：-]\s*(?:\S.*)?)?$/i

function normalizeMarkdown(markdown) {
  return String(markdown ?? '')
    .replace(/\r/g, '')
    .trim()
}

function normalizeHeading(text) {
  return String(text ?? '')
    .replace(/&#39;/g, '\'')
    .trim()
}

function normalizeItemText(text) {
  return String(text ?? '')
    .replace(/<!--.*?-->/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function issue(code, message, details = {}) {
  return { code, message, ...details }
}

function emptySections() {
  return Object.fromEntries(SECTION_KEYS.map(key => [key, []]))
}

function parseDocument({ version, locale, markdown }) {
  const contract = LOCALE_CONTRACTS[locale]
  const errors = []
  const normalized = normalizeMarkdown(markdown)
  const sections = emptySections()
  const presentSections = new Set()

  if (!normalized) {
    errors.push(issue('missing-language', `Release notes for ${locale} are missing or empty.`, { locale }))
    return { document: null, errors, presentSections }
  }

  const tokens = marked.lexer(normalized)
  const firstToken = tokens.find(token => token.type !== 'space')
  const expectedTitle = contract.title(version)

  if (firstToken?.type !== 'heading' || firstToken.depth !== 1 || normalizeHeading(firstToken.text) !== expectedTitle) {
    errors.push(issue('title-mismatch', `Expected H1 "${expectedTitle}".`, { locale }))
  }

  let activeSection = null

  for (const token of tokens) {
    if (token === firstToken || token.type === 'space')
      continue

    if (token.type === 'heading' && token.depth === 2) {
      const heading = normalizeHeading(token.text)
      const section = contract.headings[heading]
      if (!section) {
        errors.push(issue('unknown-section', `Unsupported H2 "${heading}".`, { locale, heading }))
        activeSection = null
        continue
      }
      if (presentSections.has(section)) {
        errors.push(
          issue('duplicate-section', `Section "${heading}" appears more than once.`, {
            locale,
            section,
          }),
        )
      }
      presentSections.add(section)
      activeSection = section
      continue
    }

    if (token.type === 'heading') {
      errors.push(
        issue('invalid-heading-depth', 'Release notes only support one H1 and H2 sections.', {
          locale,
        }),
      )
      continue
    }

    if (!activeSection) {
      errors.push(
        issue('content-outside-section', 'Content must be placed under a supported H2 section.', {
          locale,
        }),
      )
      continue
    }

    if (token.type !== 'list' || token.ordered) {
      errors.push(
        issue('invalid-section-content', 'Sections must contain unordered list items only.', {
          locale,
          section: activeSection,
        }),
      )
      continue
    }

    for (const item of token.items ?? []) {
      const text = normalizeItemText(item.text)
      if (!text) {
        errors.push(
          issue('empty-item', 'Release note list items must not be empty.', {
            locale,
            section: activeSection,
          }),
        )
        continue
      }
      if (PLACEHOLDER_PATTERN.test(text)) {
        errors.push(
          issue('placeholder-content', `Placeholder content "${text}" is not allowed.`, {
            locale,
            section: activeSection,
          }),
        )
      }
      sections[activeSection].push(text)
    }
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!presentSections.has(section) || sections[section].length === 0) {
      errors.push(
        issue('missing-required-section', `Required section "${section}" is missing or empty.`, {
          locale,
          section,
        }),
      )
    }
  }

  if (sections.summary.length < 3 || sections.summary.length > 6) {
    errors.push(
      issue('summary-count', 'Summary Notes must contain between 3 and 6 items.', {
        locale,
        section: 'summary',
        count: sections.summary.length,
      }),
    )
  }

  return {
    document: {
      version,
      locale,
      markdown: `${normalized}\n`,
      ...sections,
    },
    errors,
    presentSections,
  }
}

export function validateReleaseNotesPair({ version, zhMarkdown, enMarkdown }) {
  const zh = parseDocument({ version, locale: 'zh', markdown: zhMarkdown })
  const en = parseDocument({ version, locale: 'en', markdown: enMarkdown })
  const errors = [...zh.errors, ...en.errors]

  if (zh.document && en.document) {
    const mismatchedPresence = OPTIONAL_SECTIONS.filter(
      section => zh.presentSections.has(section) !== en.presentSections.has(section),
    )
    if (mismatchedPresence.length > 0) {
      errors.push(
        issue('section-set-mismatch', `Bilingual optional sections differ: ${mismatchedPresence.join(', ')}.`, {
          sections: mismatchedPresence,
        }),
      )
    }

    for (const section of SECTION_KEYS) {
      const zhCount = zh.document[section].length
      const enCount = en.document[section].length
      if (zhCount !== enCount) {
        errors.push(
          issue(
            'section-item-count-mismatch',
            `Bilingual section "${section}" has ${zhCount} zh item(s) and ${enCount} en item(s).`,
            { section, zhCount, enCount },
          ),
        )
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    documents: zh.document && en.document ? { zh: zh.document, en: en.document } : null,
  }
}

export function inferReleaseNotesChannel(version) {
  const normalized = String(version ?? '').toLowerCase()
  if (normalized.includes('snapshot'))
    return 'SNAPSHOT'
  if (normalized.includes('beta') || normalized.includes('alpha'))
    return 'BETA'
  return 'RELEASE'
}

export function compareReleaseNotesVersions(left, right) {
  const parsedLeft = parseComparableVersion(left)
  const parsedRight = parseComparableVersion(right)

  for (const key of ['major', 'minor', 'patch']) {
    if (parsedLeft[key] !== parsedRight[key]) {
      return parsedLeft[key] < parsedRight[key] ? -1 : 1
    }
  }

  if (parsedLeft.prerelease.length === 0 && parsedRight.prerelease.length > 0)
    return 1
  if (parsedLeft.prerelease.length > 0 && parsedRight.prerelease.length === 0)
    return -1

  const length = Math.max(parsedLeft.prerelease.length, parsedRight.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = parsedLeft.prerelease[index]
    const rightPart = parsedRight.prerelease[index]
    if (leftPart === undefined)
      return -1
    if (rightPart === undefined)
      return 1
    if (leftPart === rightPart)
      continue
    if (typeof leftPart === 'number' && typeof rightPart === 'string')
      return -1
    if (typeof leftPart === 'string' && typeof rightPart === 'number')
      return 1
    return leftPart < rightPart ? -1 : 1
  }

  return 0
}

export function loadReleaseNotesContractConfig(repoRoot) {
  const configPath = path.join(repoRoot, 'notes', 'release-notes.config.json')
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (
    parsed?.schemaVersion !== 1
    || typeof parsed?.legacyThrough?.RELEASE !== 'string'
    || typeof parsed?.legacyThrough?.BETA !== 'string'
  ) {
    throw new Error(`Invalid release notes contract config: ${configPath}`)
  }
  return parsed
}

export function resolveReleaseNotesEnforcement({ version, config }) {
  const channel = inferReleaseNotesChannel(version)
  if (channel === 'SNAPSHOT') {
    return { channel, enforced: false, reason: 'snapshot-exempt' }
  }

  const legacyThrough = config.legacyThrough[channel]
  const enforced = compareReleaseNotesVersions(version, legacyThrough) > 0
  return {
    channel,
    enforced,
    reason: enforced ? 'strict-contract' : 'legacy-version',
    legacyThrough,
  }
}

export function validateReleaseNotesAtRepo({ repoRoot, version }) {
  const config = loadReleaseNotesContractConfig(repoRoot)
  const enforcement = resolveReleaseNotesEnforcement({ version, config })
  const base = path.join(repoRoot, 'notes', `update_${version}`)
  const paths = {
    shared: `${base}.md`,
    zh: `${base}.zh.md`,
    en: `${base}.en.md`,
  }

  if (!enforcement.enforced) {
    return { enforcement, paths, validation: null }
  }

  const readOptional = filePath => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null)

  return {
    enforcement,
    paths,
    validation: validateReleaseNotesPair({
      version,
      zhMarkdown: readOptional(paths.zh),
      enMarkdown: readOptional(paths.en),
    }),
  }
}

function parseComparableVersion(version) {
  const match = String(version ?? '')
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) {
    throw new Error(`Invalid release notes version: ${version}`)
  }

  const prerelease = match[4]
    ? match[4].split('.').map((part) => {
        if (/^\d+$/.test(part))
          return Number.parseInt(part, 10)
        return part.toLowerCase()
      })
    : []

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease,
  }
}
