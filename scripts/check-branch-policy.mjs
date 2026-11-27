#!/usr/bin/env node
/**
 * Branch and tag policy guard -- the mechanical half of
 * `docs/engineering/specs/guides/branch-and-release.md`.
 *
 * Two branches are long-lived. `master` is the production line, `stage` is the beta channel, and
 * every other human branch is `task/<type>/<slug>`, deleted on merge. Automated Dependabot PRs
 * (`dependabot/<ecosystem>/<slug...>` opened by `dependabot[bot]` targeting `master`) are admitted
 * as a narrow, fail-closed exception without weakening human branch hygiene or beta-channel gates.
 *
 * One sentence is load-bearing: **a beta is cut from a `stage` that already contains `master`**.
 * `stage` is what testers are handed, so a stage trailing master publishes a beta that is missing
 * work already on master -- usually the fix the beta was cut to test. Nothing errors; the gap only
 * surfaces as a tester reporting a stale bug against a build labelled new. The direction of the
 * check is the opposite of ibuki-main's ADR-0007 guard (`main ⊇ stage` there): here the beta channel
 * is the one that has to contain production.
 *
 * Why it is judged only when a beta is published. `master` is the integration branch -- pull
 * requests land on it, so it runs ahead of `stage` for most of the time between betas. Failing every
 * one of those runs would be noise, and a guard people learn to ignore is worse than no guard. So
 * the containment is a FAIL in exactly the two moments a beta is published (a push to `stage`, and a
 * `-beta.` tag), and a warning everywhere else: a PR run, a push to `master`, a stable tag, a local
 * run on a feature branch. Warnings never move the exit code, so none of those become red builds.
 *
 *   node scripts/check-branch-policy.mjs                  # current branch, plus every decidable invariant
 *   node scripts/check-branch-policy.mjs --tag v2.4.15    # release time: also check the tag's landing branch
 *   node scripts/check-branch-policy.mjs --branch task/fix/x --offline
 *   node scripts/check-branch-policy.mjs --branch dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21 --base master --pr-author 'dependabot[bot]' --offline
 *
 * CI needs no arguments: the script reads GITHUB_EVENT_NAME / GITHUB_HEAD_REF / GITHUB_BASE_REF /
 * GITHUB_REF_NAME / GITHUB_REF_TYPE / GITHUB_PR_AUTHOR (with GITHUB_EVENT_PATH fallback), and falls
 * back to HEAD locally. Ancestry needs full history, so a CI job must check out with `fetch-depth: 0`;
 * a shallow clone it cannot repair is a FAIL, never a silent pass.
 *
 * Exit 0 pass (warnings allowed) / 1 failure / 2 usage.
 */
import { execFileSync } from 'node:child_process'
import fs, { realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The only branches that are allowed to outlive a task. */
export const LONG_LIVED = ['master', 'stage']
/** Orphan deployment branch; it shares no history with either long-lived branch, so it is exempt. */
export const EXEMPT_BRANCHES = ['gh-pages']
/**
 * `task/<type>` types. Kept a subset of `commitlint.config.cts`'s type-enum on purpose -- a branch
 * and its commits should not be able to disagree about what kind of change this is, and a second
 * list would drift. `--self-test` asserts the subset relation against the real config.
 *
 * There is no `hotfix` type: a fix that must reach production still goes through `stage` (the beta
 * window is minutes) because the alternative -- committing to `master` first -- is exactly the hole
 * described above.
 */
export const TASK_TYPES = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'ref', 'sec', 'test']

/**
 * Automated Dependabot PR policy constants.
 *
 * Dependabot cannot follow `task/<type>/<slug>` because GitHub generates its branches as
 * `dependabot/<ecosystem>/<path-or-package>-<version>` (with nested segments for scoped npm
 * packages, Cargo subdirectories, and GitHub Action owner/repo pairs). To admit genuine
 * Dependabot PRs without weakening human `task/<type>/<slug>` hygiene or beta-channel guards:
 *   1. The branch name must match `dependabot/<ecosystem>/<segment>(/<segment>)*` where
 *      `<ecosystem>` is configured in `.github/dependabot.yml` (verified by `--self-test`).
 *   2. The run must be a `pull_request` targeting `master` (never `stage`, never a direct push).
 *   3. The PR creator (`pull_request.user.login`) must be `dependabot[bot]` (never `GITHUB_ACTOR`,
 *      so maintainer re-runs or lockfile fixups on a Dependabot PR stay green while human-opened
 *      PRs cannot bypass `task/<type>/<slug>` by naming a branch `dependabot/*`).
 */
export const DEPENDABOT_LOGIN = 'dependabot[bot]'
export const DEPENDABOT_BASE_BRANCH = 'master'
export const DEPENDABOT_ECOSYSTEMS = ['cargo', 'github_actions', 'npm_and_yarn']
export const DEPENDABOT_CONFIG_ECOSYSTEM_MAP = {
  'cargo': 'cargo',
  'github-actions': 'github_actions',
  'npm': 'npm_and_yarn',
}

/** Lowercase ASCII only: a case-insensitive APFS checkout cannot hold `dev/X` and `dev/x` at once. */
const SLUG = /^[a-z0-9][a-z0-9._-]{0,39}$/
/**
 * Dependabot path/package segments after `dependabot/<ecosystem>/`.
 *
 * Uppercase ASCII is permitted here (and ONLY here -- never on `task/<type>/<slug>` or
 * `<ecosystem>`) because Dependabot preserves upstream GitHub Action owner casing in branch names
 * (e.g. `dependabot/github_actions/Swatinem/rust-cache-2.9.3` in this repo's workflows).
 */
const DEPENDABOT_SEGMENT = /^[a-z0-9][\w.-]{0,127}$/i
const DEPENDABOT_MAX_LENGTH = 200
/** `v1.2.3` or `v1.2.3-beta.4` / `v1.2.3-snapshot.20260925-120000`. */
const VERSION_TAG = /^v\d+\.\d+\.\d+(?:-([a-z]+)\..+)?$/

const DEPENDABOT_HINT
  = `allowed for ${DEPENDABOT_LOGIN} PRs -> ${DEPENDABOT_BASE_BRANCH}: dependabot/<ecosystem>/<slug...>`
    + ` (ecosystem ∈ ${DEPENDABOT_ECOSYSTEMS.join('|')})`

const WHITELIST_HINT
  = 'allowed: master | stage | task/<type>/<slug> | gh-pages'
    + ` (type ∈ ${TASK_TYPES.join('|')}, slug = lowercase [a-z0-9._-], ≤40);`
    + ` ${DEPENDABOT_LOGIN} PRs -> ${DEPENDABOT_BASE_BRANCH} also allow dependabot/<ecosystem>/<slug...>`

/**
 * Validate Dependabot's `dependabot/<ecosystem>/<slug...>` branch shape (name only; PR target and
 * authorship are enforced by `classifyBranch`).
 *
 * @param {string} name
 * @returns {{ok: true, ecosystem: string} | {ok: false, reason: string}} `ok: false` carries a printable rejection reason.
 */
export function validateDependabotBranchName(name) {
  if (typeof name !== 'string' || !name)
    return { ok: false, reason: 'empty branch name' }
  if (name.length > DEPENDABOT_MAX_LENGTH)
    return { ok: false, reason: `dependabot/ branch name exceeds ${DEPENDABOT_MAX_LENGTH} characters. ${DEPENDABOT_HINT}` }

  const segments = name.split('/')
  if (segments[0] !== 'dependabot')
    return { ok: false, reason: `branch does not start with dependabot/. ${DEPENDABOT_HINT}` }
  if (segments.length < 3) {
    return { ok: false, reason: `dependabot/ takes <ecosystem>/<slug...>, got ${segments.length - 1} segment(s). ${DEPENDABOT_HINT}` }
  }

  const [, ecosystem, ...rest] = segments
  if (!DEPENDABOT_ECOSYSTEMS.includes(ecosystem)) {
    return { ok: false, reason: `"${ecosystem}" is not a configured Dependabot ecosystem. ${DEPENDABOT_HINT}` }
  }

  for (const segment of rest) {
    if (!DEPENDABOT_SEGMENT.test(segment) || segment.includes('..') || segment.endsWith('.') || segment.endsWith('.lock')) {
      return { ok: false, reason: `"${segment}" is not a valid Dependabot branch segment. ${DEPENDABOT_HINT}` }
    }
  }

  return { ok: true, ecosystem }
}

/**
 * Is this a branch name the policy allows, and which class is it?
 *
 * `dependabot/*` is context-sensitive and fails closed: without a `pull_request` context targeting
 * `master` authored by `dependabot[bot]` (or `remoteAudit: true` for W1's non-blocking remote
 * inventory), `dependabot/*` is rejected so direct pushes, local branches, `stage`-targeted PRs,
 * and human PRs cannot bypass `task/<type>/<slug>`.
 *
 * @param {string} name
 * @param {object} [context]
 * @param {string} [context.eventName]
 * @param {string} [context.baseBranch]
 * @param {string} [context.prAuthor]
 * @param {boolean} [context.remoteAudit]
 * @returns {{ok: true, kind: 'long-lived'|'task'|'exempt'|'detached'|'dependabot'} | {ok: false, reason: string}} `ok: false` carries the reason a name is rejected, ready to print.
 */
export function classifyBranch(name, context = {}) {
  if (!name || name === 'HEAD')
    return { ok: true, kind: 'detached' }
  if (LONG_LIVED.includes(name))
    return { ok: true, kind: 'long-lived' }
  if (EXEMPT_BRANCHES.includes(name))
    return { ok: true, kind: 'exempt' }

  const segments = name.split('/')
  if (segments[0] === 'dependabot') {
    const shape = validateDependabotBranchName(name)
    if (!shape.ok)
      return shape
    if (context.remoteAudit)
      return { ok: true, kind: 'dependabot' }
    if (context.eventName !== 'pull_request') {
      const got = context.eventName ? `event "${context.eventName}"` : 'non-PR run'
      return {
        ok: false,
        reason: `dependabot/* is only allowed on pull_request runs targeting ${DEPENDABOT_BASE_BRANCH} by ${DEPENDABOT_LOGIN} (got ${got}). ${WHITELIST_HINT}`,
      }
    }
    if (context.baseBranch !== DEPENDABOT_BASE_BRANCH) {
      const got = context.baseBranch ? `"${context.baseBranch}"` : '<unknown>'
      return {
        ok: false,
        reason: `dependabot/* pull requests must target ${DEPENDABOT_BASE_BRANCH}, got base branch ${got}. ${DEPENDABOT_HINT}`,
      }
    }
    if (context.prAuthor !== DEPENDABOT_LOGIN) {
      const got = context.prAuthor ? `"${context.prAuthor}"` : '<unknown>'
      return {
        ok: false,
        reason: `dependabot/* is reserved for ${DEPENDABOT_LOGIN} pull requests targeting ${DEPENDABOT_BASE_BRANCH}, got PR author ${got}. ${WHITELIST_HINT}`,
      }
    }
    return { ok: true, kind: 'dependabot' }
  }

  if (segments[0] !== 'task')
    return { ok: false, reason: `not in the whitelist. ${WHITELIST_HINT}` }
  if (segments.length !== 3) {
    return { ok: false, reason: `task/ takes exactly <type>/<slug>, got ${segments.length - 1} segment(s). ${WHITELIST_HINT}` }
  }
  const [, type, slug] = segments
  if (!TASK_TYPES.includes(type)) {
    return { ok: false, reason: `"${type}" is not a task type -- reuse the commitlint enum, do not invent one. ${WHITELIST_HINT}` }
  }
  if (!SLUG.test(slug))
    return { ok: false, reason: `"${slug}" is not a slug. ${WHITELIST_HINT}` }
  return { ok: true, kind: 'task' }
}

/**
 * Where a tag is allowed to live. `stable` is a production release (`master`), `beta` is the test
 * channel (`stage`), `other` is a manual snapshot/rc build with no landing-branch rule, `unknown`
 * is not a release tag at all.
 *
 * @returns {{kind: 'stable'|'beta'|'other'|'unknown', label: string}} `label` is the prerelease identifier, '' for a stable tag.
 */
export function classifyTag(name) {
  const match = VERSION_TAG.exec(name ?? '')
  if (!match)
    return { kind: 'unknown', label: '' }
  const label = match[1] ?? ''
  if (!label)
    return { kind: 'stable', label }
  return { kind: label === 'beta' ? 'beta' : 'other', label }
}

const entry = (level, id, text) => ({ level, id, text })

/**
 * The whole policy as a pure function of observed graph facts, so `--self-test` can exercise every
 * branch of it without a repository.
 *
 * @param {object} state
 * @param {string} state.branch                     branch under test ('' when detached)
 * @param {string} state.tag                        tag under test ('' when this run is not a release)
 * @param {string} [state.eventName]                workflow event name (e.g. 'pull_request', 'push', '')
 * @param {string} [state.baseBranch]               PR target branch ('' when not a PR)
 * @param {string} [state.prAuthor]                 PR creator login (`pull_request.user.login`, '' when unknown)
 * @param {string[]} state.remoteBranches           `origin` heads, [] when unknown
 * @param {boolean} state.masterPresent             origin/master resolves
 * @param {boolean} state.stagePresent              origin/stage resolves
 * @param {boolean} state.historyComplete           ancestry answers are trustworthy
 * @param {boolean|null} state.masterContainedInStage  false = master has commits stage lacks
 * @param {Array<{name: string, kind: string, onMaster: boolean|null, onStage: boolean|null}>} state.tags
 * @param {boolean} state.tagRelativeToMaster       tag reachable from origin/master (false/null otherwise)
 * @param {boolean} state.tagRelativeToStage        tag reachable from origin/stage
 */
export function evaluate(state) {
  const out = []

  // I0 -- history integrity, on its own line so no SKIP path can hide it. Every ancestry answer below
  // is meaningless without it: a shallow clone answers "not an ancestor" for everything, so a
  // truncated graph produces confident verdicts about a repository state that does not exist. This
  // is the "absence of evidence must not read as a pass" rule from the guard thinking guide, applied
  // to the one input every other check depends on.
  if (state.historyComplete)
    out.push(entry('OK', 'I0', 'history: complete'))
  else out.push(entry('FAIL', 'I0', 'history: shallow clone -- every ancestry answer would be a false negative (CI: give the job fetch-depth: 0; locally: git fetch --unshallow)'))

  // I3 -- the branch under test. A detached HEAD is a local tag/commit inspection, not a branch.
  const branchContext = {
    eventName: state.eventName ?? '',
    baseBranch: state.baseBranch ?? '',
    prAuthor: state.prAuthor ?? '',
  }
  const branch = classifyBranch(state.branch, branchContext)
  if (branch.ok && branch.kind === 'detached')
    out.push(entry('SKIP', 'I3', `branch name: detached HEAD (inspecting a tag or commit)`))
  else if (branch.ok && branch.kind === 'dependabot')
    out.push(entry('OK', 'I3', `branch name ${state.branch} (dependabot PR -> ${DEPENDABOT_BASE_BRANCH} by ${DEPENDABOT_LOGIN})`))
  else if (branch.ok)
    out.push(entry('OK', 'I3', `branch name ${state.branch} (${branch.kind})`))
  else out.push(entry('FAIL', 'I3', `branch name ${state.branch}: ${branch.reason}`))

  // I1 -- stage ⊇ master, judged hard only when a beta is published: a push to the beta channel
  // (`stage`) or a `-beta.` tag. Everywhere else -- a PR run, a push to master, a stable tag, a local
  // run -- master leading stage is the integration branch doing its job, so the gap is reported and
  // never blocks. A guard that fails routine work is a guard people route around.
  const current = classifyTag(state.tag)
  const publishesBeta = state.branch === 'stage' || current.kind === 'beta'
  const i1Level = publishesBeta ? 'FAIL' : 'WARN'
  if (!state.masterPresent) {
    out.push(entry(i1Level, 'I1', 'stage ⊇ master: cannot resolve origin/master (no origin, or offline)'))
  }
  else if (!state.stagePresent) {
    out.push(entry('SKIP', 'I1', 'stage ⊇ master: no origin/stage yet (the beta channel is not enabled)'))
  }
  else if (!state.historyComplete) {
    out.push(entry('SKIP', 'I1', 'stage ⊇ master: not judged -- see I0'))
  }
  else if (state.masterContainedInStage === true) {
    out.push(entry('OK', 'I1', 'stage ⊇ master'))
  }
  else if (state.masterContainedInStage === null) {
    out.push(entry(i1Level, 'I1', 'stage ⊇ master: undecidable -- origin/master or origin/stage object is missing'))
  }
  else if (publishesBeta) {
    const why = state.branch === 'stage' ? 'this run pushes to stage' : `this run publishes ${state.tag}`
    out.push(entry('FAIL', 'I1', `stage ⊇ master: master has commits stage does not, and ${why}. Fast-forward the beta channel first `
    + '(`git switch stage && git merge --ff-only origin/master`) -- a beta cut from a stage that trails master is missing '
    + 'work testers are being asked to validate'))
  }
  else {
    out.push(entry('WARN', 'I1', 'stage ⊇ master: master has commits stage does not. Routine while master is the integration branch; '
    + '`git switch stage && git merge --ff-only origin/master` closes it, and it must be closed before the next beta'))
  }

  // I2 -- the landing branch of the tag this run is about. Judged before anything else about the
  // tag: on a shallow clone `merge-base --is-ancestor` answers "no" for a tag that is on the branch,
  // so the verdict would be a false failure dressed as a real one.
  if (!state.tag) {
    out.push(entry('SKIP', 'I2', 'tag landing branch: no tag in this run (pass --tag <tag> before a release)'))
  }
  else if (state.tagRefMismatch) {
    // `git fetch --tags` never moves an existing tag ref, so a local tag that was re-pushed elsewhere
    // is judged at its old commit -- and passes while the tag that would deploy is somewhere else.
    out.push(entry('FAIL', 'I2', `tag ${state.tag}: your refs/tags/${state.tag} is ${state.tagRefMismatch.local.slice(0, 8)} but origin has ${state.tagRefMismatch.remote.slice(0, 8)} -- a stale local tag would be judged instead of the real one. \`git fetch --tags --force\` and re-run`))
  }
  else if (!state.historyComplete) {
    out.push(entry('SKIP', 'I2', `tag ${state.tag}: not judged -- see I0`))
  }
  else if (current.kind === 'unknown') {
    out.push(entry('FAIL', 'I2', `tag ${state.tag}: release tags are v<MAJOR.MINOR.PATCH>[-<label>.<n>]`))
  }
  else if (current.kind === 'other') {
    out.push(entry('SKIP', 'I2', `tag ${state.tag}: manual ${current.label} build, no landing-branch rule`))
  }
  else if (current.kind === 'stable') {
    if (!state.masterPresent)
      out.push(entry('FAIL', 'I2', `tag ${state.tag}: cannot resolve origin/master`))
    else if (state.tagRelativeToMaster === true)
      out.push(entry('OK', 'I2', `${state.tag} is on master`))
    else out.push(entry('FAIL', 'I2', `${state.tag} is not reachable from master. A production tag is taken on master after stage has been fast-forwarded into it, and pushed last -- if it does not exist yet, create it on master and re-run`))
  }
  else {
    if (!state.stagePresent)
      out.push(entry('FAIL', 'I2', `tag ${state.tag}: beta tags are taken on stage, and origin/stage does not exist`))
    else if (state.tagRelativeToStage === true)
      out.push(entry('OK', 'I2', `${state.tag} is on stage`))
    else out.push(entry('FAIL', 'I2', `${state.tag} is not on stage -- the beta channel is stage, so a beta tag cannot be taken anywhere else`))
  }

  // W1 -- repository-wide drift. Existing branches are reported, never blocked: a branch this run
  // does not touch must not be able to fail anyone's build (the same reason ibuki-main's guard only
  // warns for stray tags). I3 is what stops *new* off-policy branches.
  if (state.remoteBranches.length === 0) {
    out.push(entry('SKIP', 'W1', 'remote branch audit: no origin refs read (no origin remote, or nothing fetched yet)'))
  }
  else {
    // Open Dependabot PR branches live on origin until merged/closed; W1 has no per-branch PR
    // metadata, so well-formed `dependabot/<ecosystem>/<slug...>` refs are not flagged as drift,
    // while malformed `dependabot/*` names still warn and I3 enforces target + author on active PRs.
    const offenders = state.remoteBranches.filter(name => !classifyBranch(name, { remoteAudit: true }).ok)
    if (offenders.length === 0) {
      out.push(entry('OK', 'W1', `remote branch audit: all ${state.remoteBranches.length} branch(es) are in the whitelist`))
    }
    else {
      const shown = offenders.slice(0, 5).join(', ')
      out.push(entry('WARN', 'W1', `remote branch audit: ${offenders.length} branch(es) not in the whitelist (${shown}${offenders.length > 5 ? ', …' : ''}). `
      + 'Rename the ones still in flight (`git branch -m task/fix/<slug>` + `git push origin :<old>`); delete the rest'))
    }
  }

  // W2 -- tag audit. Same reasoning as W1, and the reason a historical stray tag must not fail here:
  // the tag that actually deploys is the one I2 judged.
  if (state.tags.length === 0) {
    out.push(entry('SKIP', 'W2', 'tag audit: no tags read (no origin remote, or nothing fetched yet)'))
  }
  // `--merged` on a truncated graph reports a tag as "nowhere", which is a warning about a repository
  // state that does not exist. I1 already fails loudly for the shallow clone itself.
  else if (!state.historyComplete) {
    out.push(entry('SKIP', 'W2', 'tag audit: not judged -- see I0 (`--merged` on a truncated graph reports correct tags as stray)'))
  }
  else {
    const unknown = state.tags.filter(t => t.kind !== 'unknown' && t.onMaster === null && t.onStage === null)
    const strayStable = state.tags.filter(t => t.kind === 'stable' && t.onMaster === false)
    const strayBeta = state.tags.filter(t => t.kind === 'beta' && t.onStage === false && state.stagePresent)
    if (strayStable.length === 0 && strayBeta.length === 0 && unknown.length === 0) {
      out.push(entry('OK', 'W2', `tag audit: all ${state.tags.length} tag(s) sit on their landing branch`))
    }
    for (const [what, list] of [['production', strayStable], ['beta', strayBeta]]) {
      if (list.length === 0)
        continue
      const names = list.slice(0, 3).map(t => t.name).join(', ')
      out.push(entry('WARN', 'W2', `tag audit: ${list.length} ${what} tag(s) off their landing branch (${names}${list.length > 3 ? ', …' : ''}) -- delete or move them; they are not part of any release line`))
    }
    if (unknown.length > 0)
      out.push(entry('WARN', 'W2', `tag audit: ${unknown.length} tag(s) whose commit object could not be read, not judged`))
  }

  return out
}

/** git with captured output; empty string on failure when `optional`. */
function git(args, { optional = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  }
  catch (error) {
    if (optional)
      return ''
    throw new Error(`git ${args.join(' ')} failed: ${error.stderr?.toString().trim() || error.message}`)
  }
}

/** true / false, or null when the answer cannot be computed (missing object, shallow history). */
function isAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: ROOT, stdio: 'ignore' })
    return true
  }
  catch (error) {
    return error.status === 1 ? false : null
  }
}

const resolve = ref => git(['rev-parse', '--verify', '--quiet', ref], { optional: true })

export function parseArgs(argv) {
  const args = { branch: '', tag: '', base: '', event: '', prAuthor: '', fetch: true }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--branch')
      args.branch = argv[++index] ?? ''
    else if (arg === '--tag')
      args.tag = argv[++index] ?? ''
    else if (arg === '--base')
      args.base = argv[++index] ?? ''
    else if (arg === '--event')
      args.event = argv[++index] ?? ''
    else if (arg === '--pr-author')
      args.prAuthor = argv[++index] ?? ''
    else if (arg === '--offline')
      args.fetch = false
    else throw new Error(`unknown argument ${arg}`)
  }
  return args
}

/**
 * `refs/remotes/origin/*` -> branch names, dropping the symbolic `origin/HEAD`.
 *
 * Full ref names, not `%(refname:short)`: the short name of `refs/remotes/origin/HEAD` is `origin`,
 * so filtering for `HEAD` there never matched and the symbolic ref was audited as a branch named
 * `origin` that no whitelist accepts -- a permanent false warning on every offline run.
 */
export function originHeadsFromRefs(refs) {
  return refs.map(ref => ref.replace(/^refs\/remotes\/origin\//, '')).filter(name => name && name !== 'HEAD')
}

/**
 * Branch names, from the authoritative source when we are allowed to talk to the remote and from
 * the remote-tracking refs otherwise. The offline list is complete as of the last fetch, which is
 * all a pre-push hook can afford -- and it must never fetch, because the network in a push path
 * turns a slow mirror into a push that looks hung.
 */
function originHeads({ fetch }) {
  if (fetch) {
    return git(['ls-remote', '--heads', 'origin'], { optional: true })
      .split('\n')
      .map(line => (line.split('\t')[1] ?? '').replace(/^refs\/heads\//, ''))
      .filter(Boolean)
  }
  const refs = git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin'], { optional: true }).split('\n')
  return originHeadsFromRefs(refs.filter(Boolean))
}

/** name -> commit oid for every remote tag; the peeled (`^{}`) line wins over the tag object. */
function lsRemoteTagCommits() {
  const map = new Map()
  for (const line of git(['ls-remote', '--tags', 'origin'], { optional: true }).split('\n')) {
    const [oid, ref] = line.split('\t')
    if (!oid || !ref)
      continue
    const name = ref.replace(/^refs\/tags\//, '')
    if (name.endsWith('^{}'))
      map.set(name.slice(0, -3), oid)
    else if (!map.has(name))
      map.set(name, oid)
  }
  return map
}

/**
 * Tags, same trade: `ls-remote` is authoritative, the local tag refs are last-fetch truth.
 */
function originTags({ fetch }) {
  const names = fetch
    ? git(['ls-remote', '--tags', 'origin'], { optional: true })
        .split('\n')
        .map(line => (line.split('\t')[1] ?? '').replace(/^refs\/tags\//, ''))
    : git(['for-each-ref', '--format=%(refname:short)', 'refs/tags'], { optional: true }).split('\n')
  return [...new Set(names.filter(Boolean).map(name => name.replace(/\^\{\}$/, '')))]
}

function readGithubEvent(eventPath) {
  if (!eventPath)
    return null
  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  }
  catch {
    return null
  }
}

/**
 * Resolve branch, tag, and PR context from CLI flags, GitHub Actions env, and local HEAD.
 *
 * `GITHUB_ACTOR` is intentionally NOT used for `prAuthor`: a maintainer clicking "Re-run jobs" or
 * pushing a fixup commit onto a Dependabot PR changes `GITHUB_ACTOR` while `pull_request.user.login`
 * stays `dependabot[bot]`. Only `GITHUB_PR_AUTHOR` (set from `github.event.pull_request.user.login`
 * in workflow `env:`) or `GITHUB_EVENT_PATH`'s `pull_request.user.login` identifies the PR creator.
 */
export function fromEnvironment(args, env = process.env, readEvent = readGithubEvent) {
  const rawEventName = args.event || env.GITHUB_EVENT_NAME || ''
  const eventName = rawEventName || (args.base || env.GITHUB_BASE_REF ? 'pull_request' : '')
  const isPullRequest = eventName === 'pull_request'
  const needsEventPayload = isPullRequest && ((!args.base && !env.GITHUB_BASE_REF) || (!args.prAuthor && !env.GITHUB_PR_AUTHOR))
  const eventPayload = needsEventPayload ? readEvent(env.GITHUB_EVENT_PATH) : null

  const branch = args.branch
    || env.GITHUB_HEAD_REF
    || (env.GITHUB_REF_TYPE === 'tag' ? '' : env.GITHUB_REF_NAME)
    || git(['rev-parse', '--abbrev-ref', 'HEAD'], { optional: true })
  const tag = args.tag || (env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME ?? '' : '')
  const baseBranch = args.base
    || env.GITHUB_BASE_REF
    || (isPullRequest ? eventPayload?.pull_request?.base?.ref ?? '' : '')
  const prAuthor = args.prAuthor
    || env.GITHUB_PR_AUTHOR
    || (isPullRequest ? eventPayload?.pull_request?.user?.login ?? '' : '')
  return { branch, tag, eventName, baseBranch, prAuthor }
}

function main(argv) {
  const args = parseArgs(argv)
  const { branch, tag, eventName, baseBranch, prAuthor } = fromEnvironment(args)

  const shallow = git(['rev-parse', '--is-shallow-repository'], { optional: true }) === 'true'
  if (shallow && args.fetch) {
    try {
      git(['fetch', '--unshallow', 'origin'])
    }
    catch { /* offline or no origin: historyComplete below decides what that costs us */ }
  }
  const historyComplete = git(['rev-parse', '--is-shallow-repository'], { optional: true }) !== 'true'

  if (args.fetch) {
    // 206-odd tags and the objects behind them: one fetch is cheaper than one per unresolvable name.
    try {
      git(['fetch', '--no-write-fetch-head', '-q', 'origin', '--tags'])
    }
    catch { /* read what we already have; unresolvable tags become WARN */ }
  }

  const masterPresent = resolve('refs/remotes/origin/master') !== ''
  const stagePresent = resolve('refs/remotes/origin/stage') !== ''

  // One call per branch beats one call per tag: `--merged` answers the whole tag list at once.
  const mergedInto = ref => new Set(
    git(['for-each-ref', `--merged=${ref}`, '--format=%(refname:short)', 'refs/tags'], { optional: true })
      .split('\n')
      .filter(Boolean),
  )
  const onMasterSet = masterPresent ? mergedInto('refs/remotes/origin/master') : new Set()
  const onStageSet = stagePresent ? mergedInto('refs/remotes/origin/stage') : new Set()

  const remoteTags = originTags(args)

  const tagCommit = name => `refs/tags/${name}^{commit}`
  const tags = remoteTags.map((name) => {
    const hasObject = resolve(tagCommit(name)) !== ''
    return {
      name,
      kind: classifyTag(name).kind,
      onMaster: hasObject ? onMasterSet.has(name) : null,
      onStage: hasObject ? onStageSet.has(name) : null,
    }
  })

  // The tag under test may be too new to be in the list above, or absent from a partial fetch.
  if (tag && !tags.some(t => t.name === tag) && args.fetch) {
    try {
      git(['fetch', '--no-write-fetch-head', '-q', 'origin', `refs/tags/${tag}:refs/tags/${tag}`])
    }
    catch { /* leave it unresolvable; I2 reports it */ }
  }

  // A local tag ref is judged at its own commit, and `git fetch --tags` does not move an existing
  // tag ref. So a tag that was re-pushed elsewhere would be judged at the stale local commit and
  // pass. Compare what origin actually has before believing the local ref.
  let tagRefMismatch = null
  if (tag && args.fetch) {
    const remoteOid = lsRemoteTagCommits().get(tag)
    const localOid = resolve(tagCommit(tag))
    if (remoteOid && localOid && remoteOid !== localOid)
      tagRefMismatch = { local: localOid, remote: remoteOid }
  }

  const state = {
    branch,
    tag,
    eventName,
    baseBranch,
    prAuthor,
    tagRefMismatch,
    remoteBranches: originHeads(args),
    masterPresent,
    stagePresent,
    historyComplete,
    masterContainedInStage: masterPresent && stagePresent && historyComplete
      ? isAncestor('refs/remotes/origin/master', 'refs/remotes/origin/stage')
      : null,
    tags,
    tagRelativeToMaster: tag && masterPresent ? isAncestor(tagCommit(tag), 'refs/remotes/origin/master') : false,
    tagRelativeToStage: tag && stagePresent ? isAncestor(tagCommit(tag), 'refs/remotes/origin/stage') : false,
  }

  const results = evaluate(state)
  const prSummary = eventName === 'pull_request'
    ? ` base=${baseBranch || '<unknown>'}${prAuthor ? ` author=${prAuthor}` : ''}`
    : ''
  console.log(`== branch/tag policy  branch=${branch || '<detached>'}${prSummary} tag=${tag || '<none>'}${args.fetch ? '' : ' (offline: refs as of the last fetch)'}`)
  for (const result of results) console.log(`   ${result.level.padEnd(4)} ${result.id}  ${result.text}`)

  const failed = results.filter(r => r.level === 'FAIL').length
  const warned = results.filter(r => r.level === 'WARN').length
  // Printed on a pass too, not only on a failure: an offline run judges the refs this clone last
  // fetched, so its "OK" is a statement about a snapshot, and a stale snapshot reads as green.
  if (!args.fetch)
    console.log('   note: offline run -- judged against the refs this clone last fetched. `git fetch` for the authoritative answer (the CI job does this itself).')
  console.log(
    failed === 0
      ? `== result: pass${warned > 0 ? ` (${warned} warning(s) -- warnings never block)` : ''}`
      : `== result: ${failed} failure(s) -- see docs/engineering/specs/guides/branch-and-release.md`,
  )
  return failed === 0 ? 0 : 1
}

function selfTest() {
  const cases = []
  const check = (name, actual, expected) => cases.push({ name, actual, expected })
  const nameCase = (branch, expected, context) => check(`branch ${branch || '<empty>'}`, classifyBranch(branch, context).ok, expected)
  const dependabotPrToMaster = {
    eventName: 'pull_request',
    baseBranch: 'master',
    prAuthor: DEPENDABOT_LOGIN,
  }
  const dependabotPrToStage = {
    eventName: 'pull_request',
    baseBranch: 'stage',
    prAuthor: DEPENDABOT_LOGIN,
  }
  const humanPrToMaster = {
    eventName: 'pull_request',
    baseBranch: 'master',
    prAuthor: 'octocat',
  }

  // I3 -- names.
  nameCase('master', true)
  nameCase('stage', true)
  nameCase('gh-pages', true)
  nameCase('task/fix/corebox-freeze', true)
  nameCase('task/feat/branch-policy', true)
  nameCase('task/ref/search-fallthrough', true)
  nameCase('', true) // detached
  nameCase('HEAD', true) // detached
  nameCase('develop', false)
  nameCase('main', false) // one role, one name: `main` would be a second production branch
  nameCase('dev/talexdreamsoul', false) // dev/ was retired: task/* already carries "my work"
  nameCase('release/v2.4.15-beta.1', false) // release/ was retired: task/release/<version>
  nameCase('fix/corebox-freeze', false) // the old bare-area shape
  nameCase('sync/master-20260925', false)
  nameCase('task/fix', false) // missing slug
  nameCase('task/fix/a/b', false) // 4 segments: slug does not nest
  nameCase('task/hotfix/corebox', false) // no hotfix type: reuse fix and go through stage
  nameCase('task/Feature/x', false) // uppercase
  nameCase('task/feat/CoreBox', false) // uppercase
  nameCase('task/feat/..', false)
  nameCase('task/feat/-leading', false)
  nameCase(`task/feat/${'x'.repeat(41)}`, false) // slug cap
  nameCase(`task/feat/${'x'.repeat(40)}`, true)

  // I3 -- Dependabot PRs targeting master (allowed) and mirror rejections.
  check('dependabot npm_and_yarn PR -> master ok', classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21', dependabotPrToMaster).ok, true)
  check('dependabot scoped npm_and_yarn PR -> master ok', classifyBranch('dependabot/npm_and_yarn/anthropic-ai/claude-agent-sdk-0.3.330', dependabotPrToMaster).ok, true)
  check('dependabot cargo nested path PR -> master ok', classifyBranch('dependabot/cargo/packages/tuff-native/cc-1.11.3', dependabotPrToMaster).ok, true)
  check('dependabot github_actions PR -> master ok', classifyBranch('dependabot/github_actions/jdx/mise-action-5.3.0', dependabotPrToMaster).ok, true)
  check('dependabot github_actions preserves upstream owner casing -> master ok', classifyBranch('dependabot/github_actions/Swatinem/rust-cache-2.9.3', dependabotPrToMaster).ok, true)
  check('dependabot kind is dependabot', classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21', dependabotPrToMaster).kind, 'dependabot')
  check('dependabot PR -> stage rejected', classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21', dependabotPrToStage).ok, false)
  check('dependabot PR -> other base rejected', classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21', { ...dependabotPrToMaster, baseBranch: 'task/feat/other' }).ok, false)
  check('dependabot PR by human author rejected', classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21', humanPrToMaster).ok, false)
  check('dependabot PR with missing author fails closed', classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21', { eventName: 'pull_request', baseBranch: 'master', prAuthor: '' }).ok, false)
  check('dependabot direct push rejected', classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21', { eventName: 'push', baseBranch: '', prAuthor: '' }).ok, false)
  check('dependabot without PR context fails closed', classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21').ok, false)
  check('dependabot bare prefix rejected', classifyBranch('dependabot', dependabotPrToMaster).ok, false)
  check('dependabot trailing slash only rejected', classifyBranch('dependabot/', dependabotPrToMaster).ok, false)
  check('dependabot missing slug rejected', classifyBranch('dependabot/npm_and_yarn', dependabotPrToMaster).ok, false)
  check('dependabot empty slug rejected', classifyBranch('dependabot/npm_and_yarn/', dependabotPrToMaster).ok, false)
  check('dependabot double slash rejected', classifyBranch('dependabot/npm_and_yarn//vitepress-2.0.0', dependabotPrToMaster).ok, false)
  check('dependabot unknown ecosystem rejected', classifyBranch('dependabot/feat/sneaky-pr', dependabotPrToMaster).ok, false)
  check('dependabot uppercase ecosystem rejected', classifyBranch('dependabot/NPM_AND_YARN/vitepress-2.0.0', dependabotPrToMaster).ok, false)
  check('dependabot uppercase prefix rejected', classifyBranch('Dependabot/npm_and_yarn/vitepress-2.0.0', dependabotPrToMaster).ok, false)
  check('dependabot traversal segment rejected', classifyBranch('dependabot/npm_and_yarn/../escape', dependabotPrToMaster).ok, false)
  check('dependabot embedded .. rejected', classifyBranch('dependabot/npm_and_yarn/pkg..ver', dependabotPrToMaster).ok, false)
  check('dependabot leading dot segment rejected', classifyBranch('dependabot/npm_and_yarn/.hidden', dependabotPrToMaster).ok, false)
  check('dependabot leading dash segment rejected', classifyBranch('dependabot/npm_and_yarn/-leading', dependabotPrToMaster).ok, false)
  check('dependabot trailing dot rejected', classifyBranch('dependabot/npm_and_yarn/pkg.', dependabotPrToMaster).ok, false)
  check('dependabot .lock suffix rejected', classifyBranch('dependabot/npm_and_yarn/pkg.lock', dependabotPrToMaster).ok, false)
  check('dependabot invalid @ char rejected', classifyBranch('dependabot/npm_and_yarn/@scope/pkg-1.0.0', dependabotPrToMaster).ok, false)
  check('human feature branch still rejected on PR -> master', classifyBranch('feature/no-task-prefix', humanPrToMaster).ok, false)
  check('human task branch still passes on PR -> master', classifyBranch('task/fix/human-work', humanPrToMaster).ok, true)

  // I2 -- tag classification.
  check('tag v2.4.15', classifyTag('v2.4.15').kind, 'stable')
  check('tag v2.4.15-beta.3', classifyTag('v2.4.15-beta.3').kind, 'beta')
  check('tag v2.4.15-snapshot.20260925-120000', classifyTag('v2.4.15-snapshot.20260925-120000').kind, 'other')
  check('tag v2.4.15-rc.1', classifyTag('v2.4.15-rc.1').kind, 'other')
  check('tag v2.4.15-beta.3 label', classifyTag('v2.4.15-beta.3').label, 'beta')
  check('tag beta.3 (no v)', classifyTag('beta.3').kind, 'unknown')
  check('tag 2.4.15 (no v)', classifyTag('2.4.15').kind, 'unknown')
  check('tag v2.4 (short)', classifyTag('v2.4').kind, 'unknown')
  check('tag empty', classifyTag('').kind, 'unknown')

  const base = {
    branch: 'task/fix/x',
    tag: '',
    remoteBranches: ['master', 'stage', 'gh-pages'],
    masterPresent: true,
    stagePresent: true,
    historyComplete: true,
    masterContainedInStage: true,
    tags: [{ name: 'v2.4.14', kind: 'stable', onMaster: true, onStage: true }],
    tagRelativeToMaster: false,
    tagRelativeToStage: false,
    tagRefMismatch: null,
  }
  const levels = state => evaluate({ ...base, ...state }).map(r => `${r.id}:${r.level}`)
  const text = (state, id) => evaluate({ ...base, ...state }).find(r => r.id === id)?.text ?? ''

  check('I1 holds', levels({}).includes('I1:OK'), true)
  // The gap is routine while master is the integration branch, and fatal in the two moments a beta
  // is published. Both halves matter: a rule that never fails protects nothing, and a rule that
  // always fails gets routed around.
  check('I1 broken warns on a feature run', levels({ masterContainedInStage: false }).includes('I1:WARN'), true)
  check('I1 broken warns on a push to master', levels({ branch: 'master', masterContainedInStage: false }).includes('I1:WARN'), true)
  check('I1 broken warns for a stable tag', levels({ tag: 'v2.4.15', masterContainedInStage: false }).includes('I1:WARN'), true)
  check('I1 broken fails on a push to stage', levels({ branch: 'stage', masterContainedInStage: false }).includes('I1:FAIL'), true)
  check('I1 broken fails when a beta tag is published', levels({ branch: '', tag: 'v2.4.15-beta.1', masterContainedInStage: false }).includes('I1:FAIL'), true)
  check('the beta-time failure names the fast-forward remedy', text({ branch: 'stage', masterContainedInStage: false }, 'I1').includes('merge --ff-only'), true)
  check('the beta-time failure names what is being published', text({ branch: '', tag: 'v2.4.15-beta.1', masterContainedInStage: false }, 'I1').includes('v2.4.15-beta.1'), true)
  check('the routine warning says when it must be closed', text({ masterContainedInStage: false }, 'I1').includes('before the next beta'), true)
  // History integrity reports on its own line, so a SKIP elsewhere cannot hide it.
  check('I0 reports a complete history', levels({}).includes('I0:OK'), true)
  check('a shallow clone fails on I0', levels({ historyComplete: false, masterContainedInStage: null }).includes('I0:FAIL'), true)
  check('I0 names fetch-depth', text({ historyComplete: false }, 'I0').includes('fetch-depth: 0'), true)
  check('I1 steps aside for I0 rather than skipping silently', levels({ historyComplete: false, masterContainedInStage: null }).includes('I1:SKIP'), true)
  check('I2 steps aside for I0', levels({ tag: 'v2.4.15', historyComplete: false }).includes('I2:SKIP'), true)
  check('W2 does not audit tags on a shallow clone', levels({ historyComplete: false }).includes('W2:SKIP'), true)
  // A stale local tag ref would otherwise be judged at its old commit and pass.
  check('a stale local tag ref fails I2', levels({ tag: 'v2.4.15', tagRefMismatch: { local: 'a'.repeat(40), remote: 'b'.repeat(40) } }).includes('I2:FAIL'), true)
  check('the stale-ref failure names both oids', text({ tag: 'v2.4.15', tagRefMismatch: { local: 'a'.repeat(40), remote: 'b'.repeat(40) } }, 'I2').includes('aaaaaaa'), true)
  check('a matching tag ref is judged normally', levels({ tag: 'v2.4.15', tagRelativeToMaster: true, tagRefMismatch: null }).includes('I2:OK'), true)
  check('I1 skipped without stage', levels({ stagePresent: false, masterContainedInStage: null }).includes('I1:SKIP'), true)
  check('I1 fails without origin/master while a beta is cut', levels({ branch: 'stage', masterPresent: false, masterContainedInStage: null }).includes('I1:FAIL'), true)
  check('an unresolvable origin/master only warns otherwise', levels({ masterPresent: false, masterContainedInStage: null }).includes('I1:WARN'), true)

  check('stable tag on master ok', levels({ tag: 'v2.4.15', tagRelativeToMaster: true }).includes('I2:OK'), true)
  check('stable tag off master fails', levels({ tag: 'v2.4.15', tagRelativeToMaster: false }).includes('I2:FAIL'), true)
  check('beta tag on stage ok', levels({ tag: 'v2.4.15-beta.1', tagRelativeToStage: true }).includes('I2:OK'), true)
  check('beta tag off stage fails', levels({ tag: 'v2.4.15-beta.1' }).includes('I2:FAIL'), true)
  check('beta tag without stage fails', levels({ tag: 'v2.4.15-beta.1', stagePresent: false }).includes('I2:FAIL'), true)
  check('snapshot tag is not judged', levels({ tag: 'v2.4.15-snapshot.x' }).includes('I2:SKIP'), true)
  check('malformed tag fails', levels({ tag: '2.4.15' }).includes('I2:FAIL'), true)
  check('no tag skips I2', levels({}).includes('I2:SKIP'), true)

  check('historical off-policy branch only warns', levels({ remoteBranches: ['master', 'stage', 'release/x'] }).includes('W1:WARN'), true)
  check('open dependabot branch in remote audit is ok', levels({ remoteBranches: ['master', 'stage', 'dependabot/cargo/packages/tuff-native/cc-1.11.3'] }).includes('W1:OK'), true)
  check('malformed dependabot branch in remote audit warns', levels({ remoteBranches: ['master', 'stage', 'dependabot/bad'] }).includes('W1:WARN'), true)
  check('evaluate passes valid dependabot PR -> master', levels({
    branch: 'dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21',
    eventName: 'pull_request',
    baseBranch: 'master',
    prAuthor: DEPENDABOT_LOGIN,
  }).includes('I3:OK'), true)
  check('evaluate fails dependabot PR -> stage', levels({
    branch: 'dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21',
    eventName: 'pull_request',
    baseBranch: 'stage',
    prAuthor: DEPENDABOT_LOGIN,
  }).includes('I3:FAIL'), true)
  check('evaluate fails human PR on dependabot branch', levels({
    branch: 'dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21',
    eventName: 'pull_request',
    baseBranch: 'master',
    prAuthor: 'octocat',
  }).includes('I3:FAIL'), true)
  check('off-policy branch is still a failure when it is the current one', levels({ branch: 'release/x' }).includes('I3:FAIL'), true)
  check('clean branch list is ok', levels({}).includes('W1:OK'), true)
  check('no remote read skips W1', levels({ remoteBranches: [] }).includes('W1:SKIP'), true)
  // The offline listing. `%(refname:short)` renders the symbolic ref as `origin`, so the guard once
  // warned about a branch named `origin` on every pre-push run in this repository.
  check('origin/HEAD is not a branch', originHeadsFromRefs(['refs/remotes/origin/HEAD', 'refs/remotes/origin/master']).join(','), 'master')
  check('a branch named origin/something survives', originHeadsFromRefs(['refs/remotes/origin/origin/feature']).join(','), 'origin/feature')
  check('no refs at all', originHeadsFromRefs([]).length, 0)
  check('stray stable tag warns', levels({ tags: [{ name: 'v2.4.14', kind: 'stable', onMaster: false, onStage: true }] }).includes('W2:WARN'), true)
  check('stray beta tag warns', levels({ tags: [{ name: 'v2.4.14-beta.2', kind: 'beta', onMaster: true, onStage: false }] }).includes('W2:WARN'), true)
  check('unreadable tag warns', levels({ tags: [{ name: 'v2.4.14', kind: 'stable', onMaster: null, onStage: null }] }).includes('W2:WARN'), true)
  check('clean tag list is ok', levels({}).includes('W2:OK'), true)
  check('warnings do not fail the run', levels({ remoteBranches: ['legacy/x'] }).includes('W1:WARN'), true)

  // The type list must stay a subset of the commitlint enum, or a branch and its commits disagree.
  // Sliced by index rather than matched: the regex form (`/[\s\S]*?\[([\s\S]*?)\]/`) is the
  // super-linear-backtracking shape, and this file is read by a check that must not be the reason a
  // release takes a minute.
  const commitlint = fs.readFileSync(path.join(ROOT, 'commitlint.config.cts'), 'utf8')
  const enumStart = commitlint.indexOf(`'type-enum'`)
  const enumEnd = enumStart < 0 ? -1 : commitlint.indexOf(']', enumStart)
  const enumBlock = enumEnd < 0 ? '' : commitlint.slice(enumStart, enumEnd)
  const declared = new Set([...enumBlock.matchAll(/'([a-z]+)'/g)].map(m => m[1]))
  check('commitlint enum is readable', declared.size > 5, true)
  for (const type of TASK_TYPES) check(`task type ${type} exists in the commitlint enum`, declared.has(type), true)

  // Every ecosystem configured in `.github/dependabot.yml` must map to DEPENDABOT_ECOSYSTEMS so a
  // newly enabled Dependabot ecosystem cannot silently break Branch Policy.
  const dependabotConfig = fs.readFileSync(path.join(ROOT, '.github/dependabot.yml'), 'utf8')
  const configuredEcosystems = dependabotConfig
    .split('\n')
    .map(line => line.split('#', 1)[0].trim())
    .map(line => /^(?:-\s*)?package-ecosystem:\s*["']?([a-z0-9-]+)["']?$/.exec(line)?.[1] ?? '')
    .filter(Boolean)
  check('dependabot.yml ecosystems are readable', configuredEcosystems.length > 0, true)
  for (const configured of configuredEcosystems) {
    const mapped = DEPENDABOT_CONFIG_ECOSYSTEM_MAP[configured]
    check(`dependabot.yml ecosystem ${configured} is allowed`, Boolean(mapped && DEPENDABOT_ECOSYSTEMS.includes(mapped)), true)
  }

  let failed = 0
  for (const testCase of cases) {
    if (!Object.is(testCase.actual, testCase.expected)) {
      failed += 1
      console.error(`  x ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`)
    }
  }
  console.log(
    failed === 0
      ? `check-branch-policy --self-test: ${cases.length} cases passed`
      : `check-branch-policy --self-test: ${failed} of ${cases.length} cases failed`,
  )
  return failed
}

// Guarded so `classifyBranch`/`evaluate` can be imported without running the check — an import
// that prints a verdict and calls process.exit() is how an adversarial test of another guard in
// this repo produced a misleading pass (see scripts/check-action-pins.mjs).
//
// Compared through `realpathSync`, not `path.resolve`: invoked through a symlink (a bin shim, an
// `ln -s` in a hooks directory, nvm-style wrappers) `process.argv[1]` is the link's path, the
// comparison fails, and the script exits 0 having printed nothing — a guard that silently does
// nothing, which is the one failure mode worse than a guard that fails.
function invokedDirectly() {
  if (!process.argv[1])
    return false
  const self = fileURLToPath(import.meta.url)
  try {
    return realpathSync(process.argv[1]) === realpathSync(self)
  }
  catch {
    return path.resolve(process.argv[1]) === self
  }
}

if (invokedDirectly()) {
  if (process.argv.includes('--self-test')) {
    process.exit(selfTest() > 0 ? 1 : 0)
  }
  else {
    try {
      process.exit(main(process.argv.slice(2)))
    }
    catch (error) {
      console.error(`check-branch-policy: ${error.message}`)
      process.exit(2)
    }
  }
}
