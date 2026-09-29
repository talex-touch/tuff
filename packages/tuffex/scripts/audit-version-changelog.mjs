/**
 * TuffEx Version & Component Lifecycle Audit Gate
 *
 * Enforces that every new version bump:
 * 1. Adds a dedicated version chapter in CHANGELOG.md and lifecycle metadata.
 * 2. Explicitly specifies which components were added or updated in that release.
 * 3. Enforces that every exported component has a valid `since: X.Y.Z` version (<= current package version).
 * 4. Ensures the user-facing changelog page on Nexus (changelog.{zh,en}.mdc) stays in lockstep.
 *
 * Supports `--self-test` to guard against drift and verify rejection of invalid states.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(root, '../..')

export function parseChangelogVersions(changelogText) {
  const versionHeaderRegex = /^##\s+\[?v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)(?:\]|\s+-|\s*$)/gm
  const matches = [...changelogText.matchAll(versionHeaderRegex)]
  const versions = []

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const version = current[1]
    const startIndex = current.index
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : changelogText.length
    const body = changelogText.slice(startIndex, endIndex)
    versions.push({ version, body })
  }

  return versions
}

export function auditVersionChangelog({
  currentVersion,
  exportedSlugs,
  lifecycleData,
  changelogText,
  nexusZhChangelogText,
  nexusEnChangelogText,
  docFrontmatters,
}) {
  const problems = []
  const exportedSet = new Set(exportedSlugs)

  // 1. Current version section gate in CHANGELOG.md
  const changelogVersions = parseChangelogVersions(changelogText)
  const changelogVersionMap = new Map(changelogVersions.map(v => [v.version, v.body]))

  if (!changelogVersionMap.has(currentVersion)) {
    problems.push(
      `CHANGELOG.md is missing a chapter for current package version [${currentVersion}]. Every release must add a version chapter.`
    )
  }

  // 2. Lifecycle metadata must contain current version entry
  const lifecycleVersions = lifecycleData.versions || []
  const lifecycleVerEntry = lifecycleVersions.find(v => v.version === currentVersion)
  if (!lifecycleVerEntry) {
    problems.push(
      `components-lifecycle.json is missing a version entry for current package version [${currentVersion}].`
    )
  } else {
    // 3. Must declare which components were added or updated
    const newComps = lifecycleVerEntry.newComponents || []
    const updatedComps = lifecycleVerEntry.updatedComponents || []
    const totalImpacted = newComps.length + updatedComps.length

    if (totalImpacted === 0) {
      problems.push(
        `Version [${currentVersion}] chapter must explicitly specify which components were added or updated (newComponents or updatedComponents). Found 0.`
      )
    }

    // Verify declared components exist in exported slugs
    for (const comp of [...newComps, ...updatedComps]) {
      if (!exportedSet.has(comp)) {
        problems.push(
          `Version [${currentVersion}] refers to unknown component "${comp}". It must exist in components.ts.`
        )
      }
    }
  }

  // 4. Component Since Version integrity
  const componentMap = lifecycleData.components || {}
  const semverRegex = /^\d+\.\d+\.\d+$/

  for (const slug of exportedSlugs) {
    const compRecord = componentMap[slug]
    if (!compRecord || !compRecord.since) {
      problems.push(`Exported component "${slug}" is missing a "since" version declaration.`)
      continue
    }

    const sinceVer = compRecord.since.trim()
    if (!semverRegex.test(sinceVer)) {
      problems.push(
        `Component "${slug}" has invalid since version "${sinceVer}". Must be SemVer (e.g. 0.6.0).`
      )
    }

    // Compare with currentVersion (since cannot be future or wild version like 1.0.0 or 2.4.7)
    if (compareSemver(sinceVer, currentVersion) > 0) {
      problems.push(
        `Component "${slug}" claims since "${sinceVer}", which is greater than current version "${currentVersion}".`
      )
    }
  }

  // Check that new components in current version have since === currentVersion
  if (lifecycleVerEntry) {
    for (const comp of lifecycleVerEntry.newComponents || []) {
      const rec = componentMap[comp]
      if (rec && rec.since !== currentVersion) {
        problems.push(
          `Component "${comp}" is declared as new in version [${currentVersion}], but its since version is "${rec.since}".`
        )
      }
    }
  }

  // 5. Doc frontmatter since checks (if provided)
  if (docFrontmatters) {
    for (const [slug, meta] of Object.entries(docFrontmatters)) {
      const rec = componentMap[slug]
      if (!rec) continue

      if (meta.zhSince && meta.zhSince !== rec.since) {
        problems.push(
          `Docs for ${slug}.zh.mdc has frontmatter since "${meta.zhSince}", expected "${rec.since}".`
        )
      }
      if (meta.enSince && meta.enSince !== rec.since) {
        problems.push(
          `Docs for ${slug}.en.mdc has frontmatter since "${meta.enSince}", expected "${rec.since}".`
        )
      }
    }
  }

  // 6. User-facing Nexus changelog synchronization (the new place for users to know!)
  if (nexusZhChangelogText !== undefined) {
    if (!nexusZhChangelogText.includes(currentVersion)) {
      problems.push(
        `Nexus Chinese changelog (changelog.zh.mdc) is missing current version [${currentVersion}] chapter.`
      )
    }
  }
  if (nexusEnChangelogText !== undefined) {
    if (!nexusEnChangelogText.includes(currentVersion)) {
      problems.push(
        `Nexus English changelog (changelog.en.mdc) is missing current version [${currentVersion}] chapter.`
      )
    }
  }

  return problems
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

function selfTest() {
  let failures = 0
  const baseExported = ['button', 'text-morph', 'card']
  const baseLifecycle = {
    currentVersion: '0.6.0',
    versions: [
      {
        version: '0.6.0',
        newComponents: ['text-morph'],
        updatedComponents: ['button'],
      },
    ],
    components: {
      button: { slug: 'button', since: '0.3.4' },
      'text-morph': { slug: 'text-morph', since: '0.6.0' },
      card: { slug: 'card', since: '0.3.4' },
    },
  }
  const baseChangelog = `
## [0.6.0] - 2026-09-12
### ✨ 组件增强
- 新增 \`TxTextMorph\`
`
  const baseNexus = `## 0.6.0`

  // 1. Missing current version in CHANGELOG
  const p1 = auditVersionChangelog({
    currentVersion: '0.7.0',
    exportedSlugs: baseExported,
    lifecycleData: baseLifecycle,
    changelogText: baseChangelog,
    nexusZhChangelogText: baseNexus,
    nexusEnChangelogText: baseNexus,
  })
  if (!p1.some(p => p.includes('CHANGELOG.md is missing a chapter for current package version [0.7.0]'))) {
    console.error('self-test failed: did not catch missing current version in CHANGELOG.md')
    failures++
  }

  // 2. Version without updated/new components
  const emptyVerLifecycle = JSON.parse(JSON.stringify(baseLifecycle))
  emptyVerLifecycle.versions[0].newComponents = []
  emptyVerLifecycle.versions[0].updatedComponents = []
  const p2 = auditVersionChangelog({
    currentVersion: '0.6.0',
    exportedSlugs: baseExported,
    lifecycleData: emptyVerLifecycle,
    changelogText: baseChangelog,
    nexusZhChangelogText: baseNexus,
    nexusEnChangelogText: baseNexus,
  })
  if (!p2.some(p => p.includes('must explicitly specify which components were added or updated'))) {
    console.error('self-test failed: did not catch empty components impact')
    failures++
  }

  // 3. Unknown component named
  const unknownCompLifecycle = JSON.parse(JSON.stringify(baseLifecycle))
  unknownCompLifecycle.versions[0].newComponents = ['non-existent-comp']
  const p3 = auditVersionChangelog({
    currentVersion: '0.6.0',
    exportedSlugs: baseExported,
    lifecycleData: unknownCompLifecycle,
    changelogText: baseChangelog,
    nexusZhChangelogText: baseNexus,
    nexusEnChangelogText: baseNexus,
  })
  if (!p3.some(p => p.includes('refers to unknown component "non-existent-comp"'))) {
    console.error('self-test failed: did not catch unknown component')
    failures++
  }

  // 4. Since version greater than current (e.g. 1.0.0 when current is 0.6.0)
  const invalidSinceLifecycle = JSON.parse(JSON.stringify(baseLifecycle))
  invalidSinceLifecycle.components.card.since = '1.0.0'
  const p4 = auditVersionChangelog({
    currentVersion: '0.6.0',
    exportedSlugs: baseExported,
    lifecycleData: invalidSinceLifecycle,
    changelogText: baseChangelog,
    nexusZhChangelogText: baseNexus,
    nexusEnChangelogText: baseNexus,
  })
  if (!p4.some(p => p.includes('which is greater than current version'))) {
    console.error('self-test failed: did not catch since > currentVersion')
    failures++
  }

  // 5. Valid case passes with 0 problems
  const pValid = auditVersionChangelog({
    currentVersion: '0.6.0',
    exportedSlugs: baseExported,
    lifecycleData: baseLifecycle,
    changelogText: baseChangelog,
    nexusZhChangelogText: baseNexus,
    nexusEnChangelogText: baseNexus,
  })
  if (pValid.length > 0) {
    console.error('self-test failed: valid case was rejected with problems:', pValid)
    failures++
  }

  if (failures === 0) {
    console.log('audit-version-changelog self-test passed (5/5 cases).')
  }
  return failures
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

// Main execution
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const currentVersion = pkg.version

const compSource = readFileSync(resolve(root, 'packages/components/src/components.ts'), 'utf8')
const exportedSlugs = [...compSource.matchAll(/^export \* from '\.\/([^/]+)\/index'/gm)].map(m => m[1])

const lifecyclePath = resolve(root, 'components-lifecycle.json')
if (!existsSync(lifecyclePath)) {
  console.error(`Error: ${lifecyclePath} does not exist. Run migration or create lifecycle metadata.`)
  process.exit(1)
}
const lifecycleData = JSON.parse(readFileSync(lifecyclePath, 'utf8'))

const changelogPath = resolve(root, 'CHANGELOG.md')
const changelogText = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : ''

// Optional doc check if nexus exists
const nexusComponentsDir = resolve(repoRoot, 'apps/nexus/content/docs/dev/components')
const docFrontmatters = {}
let nexusZhChangelogText = ''
let nexusEnChangelogText = ''

if (existsSync(nexusComponentsDir)) {
  const zhChangelogPath = resolve(nexusComponentsDir, 'changelog.zh.mdc')
  const enChangelogPath = resolve(nexusComponentsDir, 'changelog.en.mdc')
  if (existsSync(zhChangelogPath)) {
    nexusZhChangelogText = readFileSync(zhChangelogPath, 'utf8')
  }
  if (existsSync(enChangelogPath)) {
    nexusEnChangelogText = readFileSync(enChangelogPath, 'utf8')
  }

  for (const slug of exportedSlugs) {
    const zhDoc = resolve(nexusComponentsDir, `${slug}.zh.mdc`)
    const enDoc = resolve(nexusComponentsDir, `${slug}.en.mdc`)
    let zhSince
    let enSince
    if (existsSync(zhDoc)) {
      const match = readFileSync(zhDoc, 'utf8').match(/^since:\s*(.+)$/m)
      if (match) zhSince = match[1].trim()
    }
    if (existsSync(enDoc)) {
      const match = readFileSync(enDoc, 'utf8').match(/^since:\s*(.+)$/m)
      if (match) enSince = match[1].trim()
    }
    docFrontmatters[slug] = { zhSince, enSince }
  }
}

const problems = auditVersionChangelog({
  currentVersion,
  exportedSlugs,
  lifecycleData,
  changelogText,
  nexusZhChangelogText: nexusZhChangelogText || undefined,
  nexusEnChangelogText: nexusEnChangelogText || undefined,
  docFrontmatters: Object.keys(docFrontmatters).length ? docFrontmatters : undefined,
})

if (problems.length) {
  console.error(`\x1b[31m[audit:changelog] Found ${problems.length} problem(s):\x1b[0m`)
  for (const p of problems) {
    console.error(`  - ${p}`)
  }
  process.exit(1)
}

console.log(
  `[audit:changelog] TuffEx version ${currentVersion} changelog and component lifecycle verified (${exportedSlugs.length} components).`
)
