# Branch and Release Policy

> **Enforced by** `pnpm check branch-policy` (`scripts/check-branch-policy.mjs`).
> This file is the human half of the policy; the script is the half that cannot be forgotten.
> Change one without the other and the script will fail on the next push — which is the point.

---

## The model

Two long-lived branches, one of them temporary.

```
task/<type>/<slug> ──PR──► master ──┬──catch-up──► stage ──beta tag──► v2.4.15-beta.4  (testers)
                                    │
                                    └────────────► tag ──► v2.4.15   (everyone)
```

| Branch | Role | Lifetime |
|--------|------|----------|
| `master` | The integration branch and the production line. Pull requests land here; a stable tag is taken here. | Permanent |
| `stage` | The beta channel. `stage` is what testers are handed, so a beta is cut from it. | Permanent |
| `task/<type>/<slug>` | Every other piece of work, including urgent fixes. | Deleted on merge |
| `gh-pages` | Docs deployment. Orphan history, exempt from every rule above. | Permanent |

`main` is not a second production branch, `dev/*` is retired (a `task/` branch already means "my
work"), and `release/*` is retired (`task/release/<version>` says the same thing inside the
whitelist). Two names for one role is the drift this policy exists to prevent.

## The invariant, and why it needs a check

**A beta is cut from a `stage` that already contains `master`.**

`stage` is what testers are handed, so a stage trailing master publishes a build that is missing work
already on the production line — usually the fix the beta was cut to test. Nothing errors: the gap
surfaces later, as a tester reporting a stale bug against a build labelled new, and the beta that
shipped is not a descendant of what production already has.

The other direction is the normal state rather than a defect: pull requests land on `master`, so it
runs ahead of `stage` for most of the time between betas. That is why the rule is judged **only when
a beta is published** — a push to `stage`, or a `-beta.` tag — and reported as a warning everywhere
else (`master` push, PR run, stable tag, a local run on a feature branch). A guard that fails routine
work is a guard people learn to route around, which costs more than the gap it was watching.

| Shape | What breaks |
|-------|-------------|
| A beta tagged on a `stage` that trails `master` | The beta omits commits production already has; testers validate stale content and the published beta is not on top of the line it will ship from |
| A beta tag pushed from a stale local clone | `git fetch --tags` never moves an existing tag ref, so the tag that deploys is judged nowhere (`I2`, stale-ref case) |
| A tag taken somewhere other than `stage` / `master` | It builds and publishes from a commit on no release line at all (`I2`) |

## Naming

| Rule | Detail |
|------|--------|
| Charset | Lowercase ASCII only. A case-insensitive APFS checkout cannot hold `dev/X` and `dev/x` at once, and bash `[a-z]` under `en_US.UTF-8` matches uppercase anyway. |
| `task/` depth | Exactly `<type>/<slug>` — three segments. A slug never nests, or the whitelist stops being a regex. |
| `<type>` | `build · chore · ci · docs · feat · fix · perf · ref · sec · test` — a subset of `commitlint.config.cts`'s `type-enum`, asserted by `--self-test`, so a branch and its commits cannot disagree about what kind of change this is. |
| `<slug>` | `[a-z0-9._-]`, starts alphanumeric, ≤40 chars. |
| Tags | `v<MAJOR.MINOR.PATCH>` on `master`, `v<MAJOR.MINOR.PATCH>-beta.<n>` on `stage`. Nothing else is a release tag. |

There is no `hotfix` type, deliberately: a fix is `fix`, and whether it needs a beta round first is a
scheduling decision, not a different kind of change. A hotfix that skips the beta channel is a normal
PR plus an immediate tag — the branch name should not have to say so.

## Daily flow

```bash
# Start work from master: it is the integration branch, and stage trails it by design.
git fetch origin && git switch -c task/fix/corebox-freeze origin/master
pnpm check branch-policy                        # I3 must be OK before the first push

# ... work. Commit messages stay conventional (commit-msg hook).
git push -u origin task/fix/corebox-freeze
# Open the PR against master. A beta is not part of landing work; it is a separate step below.
```

A `task/` branch is short-lived on purpose: the guard names it at push time, and the PR is the only
thing that reaches `master`.

## Beta (testers)

`bumpp` bumps the manifests, commits, tags `vX.Y.Z-beta.<n>` and pushes; the tag push triggers the
existing Build and Release workflow, which detects `beta` in the tag name, builds the beta channel on
all three platforms and publishes a pre-release.

```bash
# 1. Catch the beta channel up FIRST. A push to stage and a -beta. tag are the two runs where I1 is
#    fatal, and a beta cut from a stale stage is the thing I1 exists to prevent.
git switch stage && git pull
git merge --ff-only origin/master
pnpm check branch-policy                        # I1 must be OK: stage now contains master

# 2. The two app manifests, named explicitly. `-r`/`--all` would also rewrite packages/utils@2.1.0
#    and packages/tuffex@0.6.0, which version independently of the app.
npx bumpp --git-check --preid beta --release prerelease --push package.json apps/core-app/package.json
```

If `--ff-only` refuses, `stage` has commits `master` does not — a beta bump from a round that was
never merged back. Merge `master` into `stage` normally and say so in the next beta's notes rather
than force-pushing: the bump commits from earlier betas are history testers may still be running.

Add `notes/update_<version>.en.md` and `.zh.md` in the same commit: the in-app updater reads those,
and nothing generates them for you.

This is why `stage` is the beta channel and nothing else is: the beta tag is only legal on `stage`,
and that is checked on the tag push itself.

## Production release

One version commit on `master`, then the tag. The order matters — a tag pushed before the version
commit is a tag on the previous version's content, and `check-release-tag-version.mjs` will fail the
build over the mismatch anyway.

```bash
git switch master && git pull

# 1. Version commit on master. --no-push: the tag must not travel before the commit does.
npx bumpp --git-check --release 2.4.15 --no-push package.json apps/core-app/package.json

# 2. The commit first, then the tag.
git push origin master
git push origin v2.4.15
pnpm check branch-policy --tag v2.4.15           # I2 must be OK
```

`stage` does not have to be involved, and is not: the next beta catches it up to `master`, which is
the step that carries the version bump back to the testers' channel.

Pushing the tag triggers Build and Release on the stable channel, and `release-drafter` collects the
release notes from the merged PRs. `check-release-tag-version.mjs` already reconciles the tag with
`apps/core-app/package.json` during that build, so the version a release claims and the version it
is tagged with cannot drift — no second check for it here.

## Urgent fix

`task/fix/<slug>`, PR into `master`, and it ships in the next stable tag — that is the whole shortcut.
If it has to reach testers first, cut a beta: catch `stage` up and tag, which is the same two steps as
any other beta and costs minutes.

## When the guard fails

| Failure | Fix |
|---------|-----|
| `I0` | The clone has no history (`fetch-depth: 1`). Everything below is then a SKIP, deliberately: a truncated graph answers "not an ancestor" for everything. CI: `fetch-depth: 0`; locally: `git fetch --unshallow`. |
| `I3` | The branch name is off-policy. Rename before it accumulates: `git branch -m task/fix/<slug>`, `git push -u origin task/fix/<slug>`, `git push origin :<old>`. |
| `I1`, fatal (push to `stage`, or a `-beta.` tag) | `stage` is missing commits `master` has, and this run publishes a beta from it. `git switch stage && git merge --ff-only origin/master`, push, then re-run the beta step. The tag must not ship first. |
| `I1`, warning (`master` push, PR, stable tag, local run) | Nothing is broken: `master` is the integration branch and is ahead by design. It has to be closed before the next beta — that is the catch-up step in **Beta** above. |
| `I2` | The tag is on the wrong branch. Move it before it deploys: `git tag -d <tag>`, `git push origin :refs/tags/<tag>`, re-tag on the right branch. |
| `I2` (stale tag ref) | Your `refs/tags/<tag>` and origin disagree — `git fetch --tags --force` and re-run. `git fetch --tags` never moves an existing tag ref, so without this the guard would judge a commit nobody published. |
| `W1` / `W2` | Drift, reported and never blocking. Rename or delete the branches; a tag on a deleted branch is dead and can go. |

## Where this runs

| Place | Why there |
|-------|-----------|
| `.github/workflows/branch-policy.yml` | The authoritative run: full graph (`fetch-depth: 0`), the pushed tag, and every published ref. Also `workflow_dispatch` for a manual drift audit. |
| `.husky/pre-push` | Advisory, offline, never blocks. It exists to name a bad branch while renaming it is one command. |
| `pnpm check branch-policy` | On `stage` before cutting a beta, and whenever you want to know. |

Three properties of the guard are deliberate and should survive any edit:

1. **A shallow clone is a failure, not a pass**, and it is reported on its own line (`I0`) so that no
   later SKIP can hide it. `git merge-base --is-ancestor` answers "no" for everything without
   history, so a check that tolerated shallow clones would report a violation that is not there — or,
   after being "fixed", a pass it never proved.
2. **A tag is judged at the commit origin has**, not the one this clone remembers: `git fetch --tags`
   never moves an existing tag ref, so a re-pushed tag would otherwise be judged at a stale object
   and pass while the tag that deploys is somewhere else.
3. **Warnings never change the exit code**, and a check's *level* is scoped to the run that raises it.
   A historical stray tag, a leftover branch, or `master` running ahead of `stage` — which is its
   normal state between betas — must not be able to fail a build someone is trying to land. Of
   `I0`–`I3` only `I1` varies with context: fatal when the run publishes a beta (a push to `stage`, a
   `-beta.` tag), a warning otherwise. A rule that fails routine work is a rule people route around,
   and then the one run where it mattered fails silently too.

## Changing the policy

1. Change the rule in `scripts/check-branch-policy.mjs` (`TASK_TYPES`, `LONG_LIVED`, `EXEMPT_BRANCHES`).
2. Add the case to its `--self-test`, including the mirror: the name that must now be rejected.
3. Update this file.
4. For `task/<type>` additions, the type must exist in `commitlint.config.cts`'s `type-enum` — the
   self-test asserts it.
5. Changing *which runs a rule is fatal in* is a policy change too, not a tweak. The failing contexts
   live in `evaluate` (`publishesBeta` for `I1`), and both halves need a case each way: one run that
   must fail, one that must only warn. A scope that is only tested in the failing direction is how a
   guard ends up red on everyone's ordinary work.
