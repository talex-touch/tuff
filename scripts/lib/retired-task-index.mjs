/**
 * The retired task registry: the one identity source for historical task references once the old
 * task tree is gone.
 *
 * Two gates read it -- `docs:verify` (registry shape and surviving handoffs) and
 * `check-audit-report-claims` (which `MM-DD-slug` names a report may cite) -- and they have to agree
 * on what a valid registry is, so the parse and every rule live here once.
 *
 * It fails closed. `tasks` is returned only for a registry with no issues at all: a consumer that
 * could read the valid half of a broken registry would accept a citation the broken half was
 * supposed to vouch for, and an empty registry would vouch for nothing while looking like a pass.
 *
 * `sourcePath` is provenance, not a dependency. It records where the task lived at the baseline
 * commit and is checked for shape only -- the directory it names is removed at cutover, and a rule
 * that required it to exist would either fail forever or force the retired tree to stay.
 */

export const RETIRED_TASK_INDEX_PATH = 'docs/engineering/workflow/retired-task-index.json'

const ROOT_KEYS = new Set(['schemaVersion', 'baselineCommit', 'tasks'])
const REQUIRED_ENTRY_KEYS = ['slug', 'id', 'title', 'status', 'disposition', 'sourcePath']
const ENTRY_KEYS = new Set([...REQUIRED_ENTRY_KEYS, 'handoff'])
const DISPOSITIONS = new Set(['frozen', 'historical'])
const COMMIT = /^[0-9a-f]{40}$/
const HANDOFF_ROOT = 'docs/engineering/workflow/handoffs/'

// The three roots the old tree used. An active task sat exactly one directory below `tasks/`; the
// archive nested by month and, in a few historical cases, nested a task inside its own directory, so
// the archive roots accept any depth and take the task's name from the last directory.
const ACTIVE_SOURCE = /^\.trellis\/tasks\/([^/]+)\/task\.json$/
const ARCHIVE_SOURCE = /^\.trellis\/(?:tasks\/archive|archive)\/(?:[^/]+\/)*([^/]+)\/task\.json$/

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function issue(code, pointer, text) {
  return { code, pointer, message: pointer ? `${pointer}: ${text}` : text }
}

/** POSIX, repository-relative, and unable to name anything outside the path it spells. */
function safeRelativePath(value) {
  if (!nonBlank(value) || value.includes('\\') || value.startsWith('/'))
    return false
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * Where a task lived, and therefore what it is now: an active task is frozen, never completed,
 * abandoned or silently adopted by the new workflow; an archived one is history. Null for a path
 * that is not under a retired task root at all.
 */
function sourceLocation(sourcePath) {
  if (!safeRelativePath(sourcePath))
    return null
  const active = ACTIVE_SOURCE.exec(sourcePath)
  if (active && active[1] !== 'archive')
    return { directory: active[1], disposition: 'frozen' }
  const archived = ARCHIVE_SOURCE.exec(sourcePath)
  return archived ? { directory: archived[1], disposition: 'historical' } : null
}

/**
 * A handoff is any surviving Markdown file -- a task's own handoff directory or a living report its
 * document became. Two things it cannot be: a path inside the retired tree, which does not survive
 * cutover, and another task's handoff directory, which would let one task borrow another's evidence.
 * Whether the file exists is a repository question, answered by docs:verify.
 */
function handoffIssue(handoff, slug) {
  if (!nonBlank(handoff))
    return 'must be a non-empty string when present; omit the key for a task without a handoff'
  if (!safeRelativePath(handoff) || /[#?]/.test(handoff) || !handoff.endsWith('.md') || handoff.length < 4)
    return 'must be a repository-relative Markdown file path without a fragment or query'
  if (handoff.startsWith('.trellis/'))
    return 'must not point into the retired task tree, which is removed at cutover'
  if (handoff.startsWith(HANDOFF_ROOT)) {
    const prefix = `${HANDOFF_ROOT}${nonBlank(slug) ? slug : '<slug>'}/`
    if (!nonBlank(slug) || !handoff.startsWith(prefix) || handoff.length < prefix.length + 4)
      return `must stay inside the task's own handoff directory ${prefix}`
  }
  return null
}

function entryIssues(entry, index, firstIndexBySource) {
  const at = `tasks[${index}]`
  if (!plainObject(entry))
    return [issue('shape', at, 'must be an object')]

  const issues = []
  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.has(key))
      issues.push(issue('shape', `${at}.${key}`, 'is not a registry entry field'))
  }
  for (const key of REQUIRED_ENTRY_KEYS) {
    if (!nonBlank(entry[key]))
      issues.push(issue('shape', `${at}.${key}`, 'must be a non-empty string'))
  }
  if (nonBlank(entry.disposition) && !DISPOSITIONS.has(entry.disposition))
    issues.push(issue('shape', `${at}.disposition`, `must be one of ${[...DISPOSITIONS].join(', ')}`))

  if (nonBlank(entry.sourcePath)) {
    const location = sourceLocation(entry.sourcePath)
    if (!location) {
      issues.push(issue('shape', `${at}.sourcePath`, 'must be a repository-relative .../task.json path under .trellis/tasks/<slug>/, .trellis/tasks/archive/ or .trellis/archive/'))
    }
    else {
      if (nonBlank(entry.slug) && entry.slug !== location.directory)
        issues.push(issue('shape', `${at}.slug`, `must equal the task directory name ${location.directory} in sourcePath`))
      if (DISPOSITIONS.has(entry.disposition) && entry.disposition !== location.disposition) {
        issues.push(issue('shape', `${at}.disposition`, location.disposition === 'frozen'
          ? 'must be frozen: the source is an active task, which is frozen rather than completed, abandoned or claimed'
          : 'must be historical: the source is an archived task'))
      }
    }
    if (firstIndexBySource.has(entry.sourcePath))
      issues.push(issue('duplicate', `${at}.sourcePath`, `repeats tasks[${firstIndexBySource.get(entry.sourcePath)}].sourcePath ${entry.sourcePath}`))
    else firstIndexBySource.set(entry.sourcePath, index)
  }

  if (Object.hasOwn(entry, 'handoff')) {
    const problem = handoffIssue(entry.handoff, entry.slug)
    if (problem)
      issues.push(issue('shape', `${at}.handoff`, problem))
  }
  return issues
}

function registryIssues(value) {
  if (!plainObject(value))
    return [issue('shape', '', 'registry root must be a JSON object')]

  const issues = []
  for (const key of Object.keys(value)) {
    if (!ROOT_KEYS.has(key))
      issues.push(issue('shape', key, 'is not a registry field'))
  }
  if (value.schemaVersion !== 1)
    issues.push(issue('shape', 'schemaVersion', 'must be 1'))
  if (typeof value.baselineCommit !== 'string' || !COMMIT.test(value.baselineCommit))
    issues.push(issue('shape', 'baselineCommit', 'must be a 40-character lowercase hexadecimal commit id'))
  if (!Array.isArray(value.tasks)) {
    issues.push(issue('shape', 'tasks', 'must be an array'))
    return issues
  }
  if (value.tasks.length === 0)
    issues.push(issue('shape', 'tasks', 'is empty; a registry that lists nothing vouches for nothing'))

  const firstIndexBySource = new Map()
  value.tasks.forEach((entry, index) => issues.push(...entryIssues(entry, index, firstIndexBySource)))
  return issues
}

/**
 * Parse and validate registry text. Pure: no filesystem, so both gates and their self-tests feed it
 * whatever they read.
 *
 * @param {string} text
 * @returns {{ tasks: Array<{slug: string, id: string, title: string, status: string, disposition: 'frozen'|'historical', sourcePath: string, handoff?: string}>, issues: Array<{code: 'json'|'shape'|'duplicate', pointer: string, message: string}> }}
 *   `tasks` is empty whenever `issues` is not.
 */
export function parseRetiredTaskIndex(text) {
  let value
  try {
    value = JSON.parse(text)
  }
  catch (error) {
    return { tasks: [], issues: [issue('json', '', `registry is not valid JSON (${error.message})`)] }
  }
  const issues = registryIssues(value)
  return { tasks: issues.length === 0 ? value.tasks : [], issues }
}
