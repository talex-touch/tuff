#!/usr/bin/env node
/**
 * Branch and tag policy guard -- the mechanical half of `.trellis/spec/guides/branch-and-release.md`.
 *
 * Two branches are long-lived. `master` is production, `stage` is the beta channel, and every other
 * branch is `task/<type>/<slug>`, deleted on merge. Everything below follows from one sentence: a
 * release only ever *fast-forwards* `master` to `stage`, so `stage ⊇ master` holds at all times.
 *
 * Why that needs a check rather than a note. The invariant is silently destroyed by any release
 * shape that writes a commit to `master` alone, and the damage is deferred:
 *
 *   - a squash merge puts the released content on `master` and not on `stage`, so the *next*
 *     fast-forward release reverts it -- a published release disappears with no error anywhere;
 *   - a rebase merge rewrites the SHAs, so `stage` stops containing what shipped;
 *   - a commit pushed straight to `master` (a hotfix, a "small" fix) is the same hole.
 *
 * None of those are visible locally, and all of them are cheap to detect from the graph, which is
 * the whole argument for this script. The direction of the check is the opposite of ibuki-main's
 * ADR-0007 guard (`main ⊇ stage` there): this repo promotes *into* `master`, so the containment to
 * protect is `stage ⊇ master`.
 *
 *   node scripts/check-branch-policy.mjs                  # current branch, plus every decidable invariant
 *   node scripts/check-branch-policy.mjs --tag v2.4.15    # release time: also check the tag's landing branch
 *   node scripts/check-branch-policy.mjs --branch task/fix/x --offline
 *
 * CI needs no arguments: the script reads GITHUB_HEAD_REF / GITHUB_REF_NAME / GITHUB_REF_TYPE, and
 * falls back to HEAD locally. Ancestry needs full history, so a CI job must check out with
 * `fetch-depth: 0`; a shallow clone it cannot repair is a FAIL, never a silent pass.
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

/** Lowercase ASCII only: a case-insensitive APFS checkout cannot hold `dev/X` and `dev/x` at once. */
const SLUG = /^[a-z0-9][a-z0-9._-]{0,39}$/
/** `v1.2.3` or `v1.2.3-beta.4` / `v1.2.3-snapshot.20260925-120000`. */
const VERSION_TAG = /^v\d+\.\d+\.\d+(?:-([a-z]+)\..+)?$/

const WHITELIST_HINT
  = 'allowed: master | stage | task/<type>/<slug> | gh-pages'
    + ` (type ∈ ${TASK_TYPES.join('|')}, slug = lowercase [a-z0-9._-], ≤40)`

/**
 * Is this a branch name the policy allows, and which class is it?
 *
 * @returns {{ok: true, kind: 'long-lived'|'task'|'exempt'|'detached'} | {ok: false, reason: string}} `ok: false` carries the reason a name is rejected, ready to print.
 */
export function classifyBranch(name) {
  if (!name || name === 'HEAD')
    return { ok: true, kind: 'detached' }
  if (LONG_LIVED.includes(name))
    return { ok: true, kind: 'long-lived' }
  if (EXEMPT_BRANCHES.includes(name))
    return { ok: true, kind: 'exempt' }

  const segments = name.split('/')
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
  const branch = classifyBranch(state.branch)
  if (branch.ok && branch.kind === 'detached')
    out.push(entry('SKIP', 'I3', `branch name: detached HEAD (inspecting a tag or commit)`))
  else if (branch.ok)
    out.push(entry('OK', 'I3', `branch name ${state.branch} (${branch.kind})`))
  else out.push(entry('FAIL', 'I3', `branch name ${state.branch}: ${branch.reason}`))

  // I1 -- stage ⊇ master. The one invariant every release shape is judged by.
  if (!state.masterPresent) {
    out.push(entry('FAIL', 'I1', 'stage ⊇ master: cannot resolve origin/master (no origin, or offline)'))
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
    out.push(entry('FAIL', 'I1', 'stage ⊇ master: undecidable -- origin/master or origin/stage object is missing'))
  }
  else {
    out.push(entry('FAIL', 'I1', 'stage ⊇ master: master has commits stage does not. Either `git merge origin/master` into stage, '
    + 'or the commit reached master without going through stage -- which is the shape that makes the '
    + 'next fast-forward release revert it (squash/rebase merge, or a direct push)'))
  }

  // I2 -- the landing branch of the tag this run is about. Judged before anything else about the
  // tag: on a shallow clone `merge-base --is-ancestor` answers "no" for a tag that is on the branch,
  // so the verdict would be a false failure dressed as a real one.
  const current = classifyTag(state.tag)
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
    const offenders = state.remoteBranches.filter(name => !classifyBranch(name).ok)
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

function parseArgs(argv) {
  const args = { branch: '', tag: '', fetch: true }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--branch')
      args.branch = argv[++index] ?? ''
    else if (arg === '--tag')
      args.tag = argv[++index] ?? ''
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

/** Result and tag are different events: a result event carries no branch, a tag event carries the tag. */
function fromEnvironment(args) {
  const branch = args.branch
    || process.env.GITHUB_HEAD_REF
    || (process.env.GITHUB_REF_TYPE === 'tag' ? '' : process.env.GITHUB_REF_NAME)
    || git(['rev-parse', '--abbrev-ref', 'HEAD'], { optional: true })
  const tag = args.tag || (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME ?? '' : '')
  return { branch, tag }
}

function main(argv) {
  const args = parseArgs(argv)
  const { branch, tag } = fromEnvironment(args)

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
  console.log(`== branch/tag policy  branch=${branch || '<detached>'} tag=${tag || '<none>'}${args.fetch ? '' : ' (offline: refs as of the last fetch)'}`)
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
      : `== result: ${failed} failure(s) -- see .trellis/spec/guides/branch-and-release.md`,
  )
  return failed === 0 ? 0 : 1
}

function selfTest() {
  const cases = []
  const check = (name, actual, expected) => cases.push({ name, actual, expected })
  const nameCase = (branch, expected) => check(`branch ${branch || '<empty>'}`, classifyBranch(branch).ok, expected)

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
  check('I1 broken fails', levels({ masterContainedInStage: false }).includes('I1:FAIL'), true)
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
  check('I1 fails without origin/master', levels({ masterPresent: false, masterContainedInStage: null }).includes('I1:FAIL'), true)
  check('I1 failure names both causes', text({ masterContainedInStage: false }, 'I1').includes('squash'), true)

  check('stable tag on master ok', levels({ tag: 'v2.4.15', tagRelativeToMaster: true }).includes('I2:OK'), true)
  check('stable tag off master fails', levels({ tag: 'v2.4.15', tagRelativeToMaster: false }).includes('I2:FAIL'), true)
  check('beta tag on stage ok', levels({ tag: 'v2.4.15-beta.1', tagRelativeToStage: true }).includes('I2:OK'), true)
  check('beta tag off stage fails', levels({ tag: 'v2.4.15-beta.1' }).includes('I2:FAIL'), true)
  check('beta tag without stage fails', levels({ tag: 'v2.4.15-beta.1', stagePresent: false }).includes('I2:FAIL'), true)
  check('snapshot tag is not judged', levels({ tag: 'v2.4.15-snapshot.x' }).includes('I2:SKIP'), true)
  check('malformed tag fails', levels({ tag: '2.4.15' }).includes('I2:FAIL'), true)
  check('no tag skips I2', levels({}).includes('I2:SKIP'), true)

  check('historical off-policy branch only warns', levels({ remoteBranches: ['master', 'stage', 'release/x'] }).includes('W1:WARN'), true)
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
