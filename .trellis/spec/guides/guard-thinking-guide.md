# Guard Thinking Guide

> **Purpose**: Write checks that fail when the thing they protect is broken, not when its spelling changes.

---

## The Problem

**A guard that cannot fail is worse than no guard**, because it also removes the suspicion that would have made someone look.

Every example below is from this repository, and each one passed CI while the property it named was broken:

| The guard asserted | What actually had to hold | How it broke |
|---|---|---|
| `artifactName` contains `${arch}` | the produced filenames can be classified by the release pipeline | `Tuff-2.4.14-arm64.zip` satisfied the check and `inferCoreArtifactIdentity` returned `null` for it |
| the implicit-any count equals the pinned number | the compiler rejects implicit any | the number was correct for seven PRs while the compiler flag stayed off |
| `main.ts` contains `.catch(` | the CSP violation reporter does not reject unhandled | the substring matched unrelated code 200 lines further down |
| `actionlint` exits 0 | workflows are actually analysed | without `shellcheck` on `PATH` it silently skips every `run:` block and reports 0 findings where CI reports 32 |
| the OCR test passes | native OCR ran | it returns early when support is absent, so a run that never reached the engine looked identical to a passing one |

The shape is always the same: **the assertion names a proxy for the property, and the proxy is satisfiable without the property.**

---

## The Questions

### 1. If this were broken, would my check fail?

Not "does my check pass" — write the broken version and run it. If it still passes, the check is decorative.

This is the whole of mutation testing, and it costs one minute: change the implementation to the failure you are guarding against, run the test, expect red, revert.

### 2. Am I asserting the config, or the result of the config?

Prefer running the real consumer over reading the text that feeds it.

```js
// Proxy: satisfied by a name the pipeline cannot parse
expect(artifactName).toContain('${arch}')

// Property: the same function the release pipeline calls
expect(inferCoreArtifactIdentity(expandedName)).toEqual({ platform: 'darwin', arch })
```

### 3. Can this pass because nothing ran?

A skip, an early return, an absent binary, and a satisfied assertion all produce a green tick.

If the code under test can decline to run, the guard needs a way to demand it — an env flag the CI job sets, an explicit assertion that the precondition held, or a positive control proving the search or the tool was live.

### 4. Does the number this pins have a floor?

A ratchet is for debt that will never reach zero but must not grow. **If the number can reach zero, the instrument is a switch, not a ratchet** — turn on the compiler flag, the lint rule, the config, and delete the counter.

Keeping a ratchet at zero means maintaining a second, weaker, hand-updated copy of a rule the tool already enforces.

### 5. Where does this fail, and is that early enough?

A check that fires during manifest validation, after signing and notarisation, is technically a check. It is also a check that costs a full release cycle to learn from. Prefer the earliest layer that can see the property.

---

## Absence Scans Need a Positive Control

"No references found" is the easiest wrong answer to produce. A misspelled pattern, a wrong directory, a flag that means something else, and a genuinely empty result all print nothing.

Before believing an absence, prove the scan works by finding something you know is there.

```bash
rg -n "Windows OCR recognized no text" packages   # known to exist — non-empty proves the scan runs
rg -n "No text recognized" .                      # the actual question
```

Two ways this has gone wrong here: `rg -r` is `--replace`, not "recursive", so `rg -rn pattern` silently rewrites the output; and a `^src/` anchor quietly excluded every path that did not start with `src/`, under-reporting a per-file breakdown by two.

---

## When You Cannot Verify Locally

Say so, and name what would verify it.

A guard for Windows COM behaviour cannot be proven on macOS. What can be done is to place the test where the platform runs it — and then read the job log to confirm it *ran*, rather than trusting the green tick.

Recording the limit is not a weaker result. It is the difference between "verified" and "assumed", and the next person needs to know which one they inherited.
