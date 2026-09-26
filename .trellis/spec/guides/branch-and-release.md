# Branch and Release Policy

> **Enforced by** `pnpm check branch-policy` (`scripts/check-branch-policy.mjs`).
> This file is the human half of the policy; the script is the half that cannot be forgotten.
> Change one without the other and the script will fail on the next push — which is the point.

---

## The model

Three branch classes, one of them temporary.

```
task/<type>/<slug>  ──PR──►  stage  ──beta build──►  v2.4.15-beta.4   (testers)
                              │
                              └──fast-forward──►  master  ──tag──►  v2.4.15   (everyone)
```

| Branch | Role | Lifetime |
|--------|------|----------|
| `master` | Production. Nothing is published from anywhere else. | Permanent |
| `stage` | The beta channel. Every commit that will ship passes through here first. | Permanent |
| `task/<type>/<slug>` | Every other piece of work, including urgent fixes. | Deleted on merge |
| `gh-pages` | Docs deployment. Orphan history, exempt from every rule above. | Permanent |

`main` is not a second production branch, `dev/*` is retired (a `task/` branch already means "my
work"), and `release/*` is retired (`task/release/<version>` says the same thing inside the
whitelist). Two names for one role is the drift this policy exists to prevent.

## The invariant, and why it needs a check

**`stage` always contains `master`** — `master` only ever moves *forward* into it, by fast-forward.

The reason this is checked rather than agreed: every way of breaking it is invisible locally and
does its damage later.

| Release shape | What breaks |
|---------------|-------------|
| Squash merge `stage` → `master` | The released content is on `master` only. The **next** fast-forward release reverts a published release. No error anywhere. |
| Rebase merge `stage` → `master` | `stage` no longer contains what shipped; every later comparison is wrong. |
| A commit pushed straight to `master` | Same hole as squash, one commit at a time. |

So a release has exactly one shape: **fast-forward**. `git push origin stage:master` moves the ref
and creates nothing, so `stage` is unchanged and the invariant holds by construction rather than by
review. The cost is accepted: `master` must never require a pull request, because any merge method
would produce a commit `stage` does not have.

## Naming

| Rule | Detail |
|------|--------|
| Charset | Lowercase ASCII only. A case-insensitive APFS checkout cannot hold `dev/X` and `dev/x` at once, and bash `[a-z]` under `en_US.UTF-8` matches uppercase anyway. |
| `task/` depth | Exactly `<type>/<slug>` — three segments. A slug never nests, or the whitelist stops being a regex. |
| `<type>` | `build · chore · ci · docs · feat · fix · perf · ref · sec · test` — a subset of `commitlint.config.cts`'s `type-enum`, asserted by `--self-test`, so a branch and its commits cannot disagree about what kind of change this is. |
| `<slug>` | `[a-z0-9._-]`, starts alphanumeric, ≤40 chars. |
| Tags | `v<MAJOR.MINOR.PATCH>` on `master`, `v<MAJOR.MINOR.PATCH>-beta.<n>` on `stage`. Nothing else is a release tag. |

There is no `hotfix` type, deliberately: a fix that must reach production still goes through
`stage`. The beta round trip is minutes, and the alternative — committing to `master` first — is
exactly the hole in the table above.

## Daily flow

```bash
# Start work. Cut from stage, not from master: master is behind by definition.
git fetch origin && git switch -c task/fix/corebox-freeze origin/stage
pnpm check branch-policy                        # I3 must be OK before the first push

# ... work. Commit messages stay conventional (commit-msg hook).
git push -u origin task/fix/corebox-freeze
# Open the PR against stage. `stage` → `master` is never a PR.
```

## Beta (testers)

One command, on `stage`. `bumpp` bumps the manifests, commits, tags `vX.Y.Z-beta.<n>` and pushes;
the tag push triggers the existing Build and Release workflow, which detects `beta` in the tag name,
builds the beta channel on all three platforms and publishes a pre-release.

```bash
git switch stage && git pull
# The two app manifests, named explicitly. `-r`/`--all` would also rewrite packages/utils@2.1.0 and
# packages/tuffex@0.6.0, which version independently of the app.
npx bumpp --git-check --preid beta --release prerelease --push package.json apps/core-app/package.json
```

Add `notes/update_<version>.en.md` and `.zh.md` in the same commit: the in-app updater reads those,
and nothing generates them for you.

This is why `stage` is the beta channel and nothing else is: the beta tag is only legal on `stage`,
and that is checked on the tag push itself.

## Production release

Fast-forward first, then tag. The order matters — a tag pushed before the promotion is a tag on
`stage` only, which is exactly the stray-tag shape `I2` fails on.

```bash
pnpm check branch-policy                         # I1 must be OK, or stage is not what will ship
git switch stage && git pull

# 1. Version commit on stage. --no-push: the tag must not travel before master has the commit.
npx bumpp --git-check --release 2.4.15 --no-push package.json apps/core-app/package.json

# 2. The promotion. Fast-forward only; this is the whole release mechanism.
git push --no-tags origin stage
git push origin stage:master

# 3. The tag, last, now that it is on master.
git push origin v2.4.15
pnpm check branch-policy --tag v2.4.15           # I2 must be OK
```

Pushing the tag triggers Build and Release on the stable channel, and `release-drafter` collects the
release notes from the merged PRs. `check-release-tag-version.mjs` already reconciles the tag with
`apps/core-app/package.json` during that build, so the version a release claims and the version it
is tagged with cannot drift — no second check for it here.

## Urgent fix

`task/fix/<slug>` from `stage`, PR into `stage`, beta, promote. There is no shortcut. The one
exception worth knowing: if production is broken and beta cannot wait, the commit still reaches
`master` through `stage` — never directly — because a direct commit is the case the invariant
cannot survive.

## When the guard fails

| Failure | Fix |
|---------|-----|
| `I0` | The clone has no history (`fetch-depth: 1`). Everything below is then a SKIP, deliberately: a truncated graph answers "not an ancestor" for everything. CI: `fetch-depth: 0`; locally: `git fetch --unshallow`. |
| `I3` | The branch name is off-policy. Rename before it accumulates: `git branch -m task/fix/<slug>`, `git push -u origin task/fix/<slug>`, `git push origin :<old>`. |
| `I1` (master has commits stage lacks) | Merge `master` into `stage` (`git switch stage && git merge origin/master`) and push. If the commit reached `master` without going through `stage`, say so in the PR — that is the shape that reverts a release later. |
| `I2` | The tag is on the wrong branch. Move it before it deploys: `git tag -d <tag>`, `git push origin :refs/tags/<tag>`, re-tag on the right branch. |
| `I2` (stale tag ref) | Your `refs/tags/<tag>` and origin disagree — `git fetch --tags --force` and re-run. `git fetch --tags` never moves an existing tag ref, so without this the guard would judge a commit nobody published. |
| `W1` / `W2` | Drift, reported and never blocking. Rename or delete the branches; a tag on a deleted branch is dead and can go. |

## Where this runs

| Place | Why there |
|-------|-----------|
| `.github/workflows/branch-policy.yml` | The authoritative run: full graph (`fetch-depth: 0`), the pushed tag, and every published ref. Also `workflow_dispatch` for a manual drift audit. |
| `.husky/pre-push` | Advisory, offline, never blocks. It exists to name a bad branch while renaming it is one command. |
| `pnpm check branch-policy` | Before a release, and whenever you want to know. |

Three properties of the guard are deliberate and should survive any edit:

1. **A shallow clone is a failure, not a pass**, and it is reported on its own line (`I0`) so that no
   later SKIP can hide it. `git merge-base --is-ancestor` answers "no" for everything without
   history, so a check that tolerated shallow clones would report a violation that is not there — or,
   after being "fixed", a pass it never proved.
2. **A tag is judged at the commit origin has**, not the one this clone remembers: `git fetch --tags`
   never moves an existing tag ref, so a re-pushed tag would otherwise be judged at a stale object
   and pass while the tag that deploys is somewhere else.
3. **Warnings never change the exit code.** A historical stray tag or a leftover branch must not be
   able to fail a build someone is trying to land. Only I0–I3 fail, and each is about something the
   current run is doing.

## Changing the policy

1. Change the rule in `scripts/check-branch-policy.mjs` (`TASK_TYPES`, `LONG_LIVED`, `EXEMPT_BRANCHES`).
2. Add the case to its `--self-test`, including the mirror: the name that must now be rejected.
3. Update this file.
4. For `task/<type>` additions, the type must exist in `commitlint.config.cts`'s `type-enum` — the
   self-test asserts it.
