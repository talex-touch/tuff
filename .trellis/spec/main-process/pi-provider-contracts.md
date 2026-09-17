# Local CLI Provider Contracts (pi · omp · codex · claude)

Contracts for the CLI-backed chat providers — the shared runtime, each CLI's own
argument vector, and the per-stream termination semantics. §1–§9 were established
on the `pi` path alone; §11 generalises them to the family.

## 1. Scope / Trigger

Changes to what crosses the renderer → main → `pi` subprocess boundary:
message payload fields, spawn argv/env, NDJSON event consumption.

## 2. Attachments channel (`@files`)

```
renderer: AiAttachment(image, data URL)
  → IntelligenceMessage.attachments?: IntelligenceMessageAttachment[]   // dual-mirrored type
    → main: spillAttachments() → os.tmpdir()/tuff-attach-<uuid>.<ext>  (mode 0600)
      → argv: pi [options] [@path...] [prompt]     // positional, BEFORE the prompt
        → finally: unlink
```

- **Type dual-mirror**: `IntelligenceMessageAttachment` exists as two literal
  copies — `packages/utils/types/intelligence.ts` and
  `packages/tuff-intelligence/src/types/intelligence.ts`. Edit both or neither
  (same rule as `IntelligencePartEvent`).
- **Validation (main-side, per attachment, skip-not-fail)**: data URL prefix
  must match `data:image/(png|jpeg|webp|gif);base64,`; decoded size ≤ 10 MB;
  extension derived from MIME, never from the client-supplied name. A bad
  attachment logs a warning and is skipped — the turn still runs as text.
- **Renderer hint contract**: the "not sent to the model" hint renders only
  when `attachments.length > modelAttachments.length` — i.e. for what
  genuinely stayed local (non-image kinds, or restored messages whose object
  URLs died). `modelAttachments` is what the send actually carried.
- **Non-pi providers** ignore the optional field; absence keeps argv shape
  identical to the pre-attachment form (existing arg tests must not need
  changes when the list is empty).

## 3. Validation & Error Matrix

| Condition | Behaviour |
|---|---|
| non-image / malformed data URL | skip + warn, turn proceeds |
| decoded size > 10 MB | skip + warn |
| temp write fails | skip + warn (turn degrades to text) |
| retry/regenerate | attachments re-carried from the message object |

## 4. Tests (assertion points)

- spill: data URL → temp path → argv order (`@paths` before prompt), multiple
  attachments, bad-URL skip, size-cap skip, cleanup invoked, empty list leaves
  argv untouched (`attachment-spill.test.ts`, `pi-cli-runtime.test.ts`)
- payload: last user message carries them; retry re-carries; restored
  messages don't (`attachment-payload.test.ts`, `useHomeConversation.test.ts`)
- live evidence: task research `vision-smoke.md` — the model read generated
  image text back through the real channel.

## 5. Wrong vs Correct

### Wrong

```ts
// Trusting the client name for the extension — lets a .html "image" land
// on disk executable-adjacent.
const ext = attachment.name?.split('.').pop()
```

### Correct

```ts
// MIME decides; the whitelist decided MIME.
const ext = MIME_TO_EXT[mime]
```

## 6. Stream consumption: commit/rollback (landed, cd018f946)

**Deltas are preview; an assistant `message_end` with an explicitly healthy
`stopReason` is a commit point; `auto_retry_start` rolls back to the last
commit.** pi replays failed attempts into the same stdout — treat the NDJSON
stream as a session log, never as one monotonic text buffer.

- Part events (dual-mirrored): `{ kind: 'message-commit' }`,
  `{ kind: 'text-reset' }`.
- Commit requires an explicit non-error/aborted `stopReason` on
  `message_end` — absence is not success (message_start's pending state and
  zero-usage message_end keep their existing null contract).
- Every accumulating layer keeps a high-water mark and rolls back to it:
  provider (`streamedLength`/`committedLength`), router (`accumulated`),
  renderer parts assembly (`committed = {contentLength, partsLength,
  textLength}` — textLength exists because deltas merge into the tail text
  part, so partsLength alone can't rewind it).
- Final user-visible text = committed + un-rolled-back tail preview; the
  **error decision** uses committed-only: EOF with nothing committed and a
  failed final state throws pi's `auto_retry_end.finalError`. Exit codes are
  meaningless (`--mode json` exits 0 even when every attempt failed).
- Spawn env pins `PI_RETRY_STALL_TIMEOUT_MS: '0'` — the pi-retry extension's
  90s stall watchdog only amplifies replays in a headless host.
- Retries log `attempt/maxAttempts/delayMs` (evidence trail for retry-count
  anomalies).

Guard tests: tool-turn rollback (text₁ commit → tool cards → text₂ reset →
text₂′ commit ⇒ text₁+text₂′ with cards intact); 4-attempt NDJSON fixture
accumulates one copy; all-failed run throws `finalError`.

## 7. Model catalogue reads (landed, task 08-06-model-menu-sources)

**The model menu's pi row is filled from pi's own catalogue files; credentials
never leave the reader.** `pi-model-catalog.ts` reads exactly two files under
`PI_CODING_AGENT_DIR` (default `~/.pi/agent`): `models.json` (user-defined
providers — carries plaintext `apiKey`s) and `models-store.json` (the built-in
catalogue `pi update` maintains). `auth.json` is never opened.

- **Secret boundary is the return type**: `listPiCliModels(): string[]` of
  `<provider>/<id>` patterns — nothing else escapes, so no caller can log or
  ship a key by accident. Warn lines carry a fixed reason string, never a
  caught error: V8's `JSON.parse` message quotes source text, which here is
  credential-bearing.
- **Sync on purpose**: `getProviderModelOptions` feeds the plugin host through
  a frozen sync dependency (`plugin-intelligence-host-service.ts`), so the
  reader stays `readFileSync` + an mtime/size-signature cache instead of going
  async and rippling through that surface.
- **Defensive parse, silent degrade**: these files are pi internals, not a
  contract. Unrecognised shapes skip entries; a corrupt file empties that
  source and warns once per run; a missing file is silent (that is what "no
  catalogue" looks like).
- **Probed-absent vs unprobed**: only `getResolvedPiExecutable() === null`
  (probed, absent) drops the pi row from model options; `undefined` (not yet
  probed) must be treated as present — the same stance config assembly takes.
  Custom `models.json` patterns win dedup collisions against the store.

Guard tests: `pi-model-catalog.test.ts` (real temp dirs; asserts a fixture
credential appears in neither patterns nor warnings, warn-once across cache
invalidations); `intelligence-provider-model-options.test.ts` pi block (row
filled from catalogue, probed-absent removal, unprobed retention, empty
catalogue removal).

## 8. Scenario: Bounded subprocess cancellation and packaged ledger evidence

### 1. Scope / Trigger

- Trigger: changing `PiCliProvider.chatStream()`, its abort/teardown behavior,
  pi child-process ownership, or the packaged Provider acceptance ledger.
- A cancelled turn can leave `readline.next()` pending while the child is
  alive. Teardown is therefore part of the billing and tool-safety boundary,
  not optional cleanup.

### 2. Signatures

```ts
type PiCliRuntimeOptions = IntelligenceInvokeOptions & {
  readonly signal?: AbortSignal
}

PiCliProvider.chatStream(
  payload: IntelligenceChatPayload,
  options: IntelligenceInvokeOptions,
): AsyncGenerator<IntelligenceStreamChunk>

summarizeUsageDelta(
  beforeRows: UsageRowLike[],
  afterRows: UsageRowLike[],
  audit: AuditSummary,
): UsageDeltaSummary
```

Stable teardown error: `PI_CLI_TERMINATION_FAILED` in both `error.code` and
`error.message`. Current termination windows are 150 ms after `SIGTERM`, then
750 ms after `SIGKILL`.

### 3. Contracts

- A pre-aborted request performs no spawn. If attachment spill completed before
  the abort was observed, cleanup completes before the generator returns.
- The abort handler resolves the cancellation branch, closes the readline
  interface, and destroys stdout. This is required to settle a pending
  `iterator.next()`; calling `AsyncGenerator.return()` alone cannot preempt it.
- Termination is single-flight. Send `SIGTERM`, wait for authoritative exit,
  then send `SIGKILL` and wait again. A `kill()` return value or emitted error
  is not proof that the process exited; only `exitCode`, `signalCode`, or the
  process `exit` event establishes that fact.
- Cancellation wins over a concurrent child error. Check `signal.aborted`
  before and after the exit race so a kill error cannot replace the canonical
  cancelled outcome.
- Every path removes the abort and stderr data listeners, closes readline,
  destroys stdout/stderr, and cleans attachment files. If the child still has
  not exited, call `unref()` and throw `PI_CLI_TERMINATION_FAILED` only after
  those bounded cleanup steps. Keep the child error observer until `close` so
  a later child error cannot become an uncaught process exception.
- pi JSON exit code is not the answer truth. A failed terminal `stopReason`
  with no committed text fails even when pi exits zero; a late non-zero exit
  does not erase text already delivered to the user.
- Packaged audit/usage evidence compares integer counters exactly. Floating
  cost deltas use a machine-precision relative tolerance:
  `Number.EPSILON * max(1, abs(left), abs(right)) * 16`. Both day and month
  deltas must independently match the accepted audit window.
- A packaged report records the tested `Info.plist` version and physical
  `app.asar` SHA-256. A source test pass or an older package hash cannot stand
  in for the package named by the report.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Signal already aborted before spawn | Return without child work; clean any completed spill |
| Abort while `next()` waits for NDJSON | Close readline/stdout; pending read settles as cancellation |
| Child exits during SIGTERM grace | No SIGKILL; normal bounded teardown |
| SIGTERM fails or child ignores it | Escalate to SIGKILL after 150 ms |
| SIGTERM and SIGKILL both fail to produce exit | Destroy streams, unref, clean attachments, throw `PI_CLI_TERMINATION_FAILED` |
| Abort and child error settle together | Cancellation remains authoritative |
| pi exits zero with failed stop reason and no commit | Fail with pi terminal failure |
| Day/month integer ledger differs from audit | Packaged report fails |
| Cost differs only by IEEE-754 representation noise | Accept within machine tolerance |
| Cost differs materially | Packaged report fails |

### 5. Good / Base / Bad Cases

- **Good:** a blocked pi child ignores SIGTERM, exits after SIGKILL, the pending
  `next()` settles, listeners and streams are cleaned, and no cancellation
  failure audit or orphan child remains.
- **Base:** the child has already exited; teardown observes that state, closes
  owned resources idempotently, and does not send another signal.
- **Bad:** treat `child.kill() === true` as exit, await NDJSON before closing
  stdout, swallow two failed kill attempts, leak stderr listeners, compare
  decimal cost with `===`, or report evidence for an older `app.asar` hash.

### 6. Tests Required

- Provider tests cover consumer early return, abort while `next()` is pending,
  SIGTERM error followed by successful SIGKILL, and failure of both signals.
- The double-failure regression asserts stable error code/message, stderr
  destruction, zero stderr data listeners, `unref()`, and no
  `unhandledRejection`; test cleanup must reap its deliberately live stub.
- Runner tests reproduce a real floating case such as
  `0.00054 - 0.00036` versus `0.00018`, while still rejecting material cost,
  identity, counter, and malformed numeric differences.
- Final packaged evidence must use a fresh build, isolated profile, bounded
  report schema, tested bundle version, and physical `app.asar` hash.

### 7. Wrong vs Correct

#### Wrong

```ts
child.kill('SIGTERM')
await exited
const costMatches = usage.totalCost === audit.estimatedCost
```

#### Correct

```ts
const childTerminated = await terminateChild() // SIGTERM -> wait -> SIGKILL -> wait
if (!childTerminated) throw stableTerminationError()

const tolerance =
  Number.EPSILON * Math.max(1, Math.abs(usage.totalCost), Math.abs(audit.estimatedCost)) * 16
const costMatches = Math.abs(usage.totalCost - audit.estimatedCost) <= tolerance
```

## 9. Scenario: Home conversations use provider-owned native Pi sessions

### 1. Scope / Trigger

- Trigger: changing `PiCliProvider`, Home conversation identity metadata,
  `local_ai_cli_sessions`, native session discovery, or Pi session-file checks.
- This applies only to host Home `text.chat` turns. Title generation,
  translation, capability probes, and other non-Home Pi calls remain ephemeral.

### 2. Signatures

```ts
IntelligenceHomeSurfaceMetadata {
  surface: 'home-conversation'
  conversationId?: string
  projectId?: string | null
}

local_ai_cli_sessions.conversation_id TEXT NULL UNIQUE

buildPiArgs(..., {
  session?: { id: string; create: boolean }
})
```

### 3. Contracts

- The renderer sends only Tuff `conversationId` / `projectId`. The native id,
  expected head and JSONL path stay main-only and never enter conversation DTOs,
  sync, ordinary exports, or logs.
- A trusted Home invocation requires an opaque conversation id and explicit
  nullable project id. Plugin-authored Home markers fail closed. Project turns
  resolve the canonical Project root; Home turns use the same stable isolated
  workspace as Local AI.
- First local use generates a UUID, holds a conversation guard, starts Pi with
  `--session-id`, validates the version-3 session record, acquires the shared
  native tuple lease, then binds the pointer before output. Existing bindings
  hold both guards and use `--session`.
- Normal continuation sends only the newest user turn. A legacy or synced Home
  conversation without a device-local pointer may seed its visible bounded
  transcript once; later turns never replay it.
- Before resume, locate the exact native JSONL without storing its path, validate
  header id/canonical cwd, and compare its last head to `expected_head_id`.
  After success, appended entries must be one linear parent chain containing
  exactly one user message and at least one assistant message. Head drift,
  siblings, truncation, replacement, malformed JSONL, or more than 1 MiB of
  appended bytes marks the pointer `conflict`.
- Home and OmniPanel use the same process-wide `(provider, root, native id)`
  lease. A second writer fails `NATIVE_SESSION_BUSY` before spawn. Every process,
  parser, cancellation, consumer-return, and verification exit releases once.
- Once the renderer receives a native Pi provider start event, it never retries
  the same turn through the non-streaming fallback: session persistence can make
  a no-delta failure billable and replaying would append the prompt twice.
- Home messages remain the rendered/encrypted-sync record; Pi's transcript is
  the inference-context authority. Deleting a conversation transactionally
  removes its local pointer only, never the provider transcript.

### 4. Validation Matrix

| Condition | Result |
| --- | --- |
| First Home Pi turn | `--session-id`; pointer binds after exact session line |
| Existing binding | `--session`; newest user turn only |
| Legacy/synced thread without pointer | One bounded bootstrap, then native continuation |
| Non-Home Pi invocation | `--no-session`; no durable pointer |
| Project/root/provider mismatch | `NATIVE_SESSION_CONFLICT`; no spawn |
| Missing session file/provider response | mark `missing`; no fresh fallback |
| Head drift/sibling/JSONL replacement | mark `conflict`; no later resume |
| Second Home/OmniPanel writer | `NATIVE_SESSION_BUSY`; first writer remains healthy |

### 5. Tests Required

- Full migration chain and real SQLite store tests cover nullable uniqueness,
  hidden conversation-bound rows, local/sync deletion, and no foreign-key race
  before the first conversation snapshot.
- Pi argument/prompt tests cover fresh/resume/non-Home selectors, newest-turn
  continuation, and one-time bounded bootstrap.
- Process tests use a throwaway Pi JSONL writer and prove exact id/cwd, restart
  continuation, shared leases, every release path, missing state, linear head
  updates, sibling conflict, attachment/tool behavior, and no prompt replay.
- Renderer tests prove Home identity metadata and the no-fallback-after-native-
  start rule while retaining fallback for a transport failure before start.

## 10. Scenario: Explicit project-scoped native session discovery

- Discovery is a host-only `local-ai-cli:session:discover` action for one opaque
  existing Project id. It never runs on startup/list refresh and never accepts a
  renderer path or creates a Project.
- Main scans fixed Pi, OMP, Claude Code and Codex archive roots with bounded
  directory/file/byte budgets, no-follow opens, stable inode/size checks, and
  canonical containment. A present archive that cannot be completely inspected
  returns `incomplete: true`; an absent archive is normal.
- A candidate is adopted only when its provider-recorded cwd resolves exactly to
  the selected canonical Project root. Main retains native id/path only while
  upserting the pointer and exposes only the existing `LocalAiCliSessionSummary`.
- New rows use `origin='discovered'`. Rescan is atomic/idempotent by provider,
  canonical root and native id; it preserves opaque id, established title,
  Tuff origin and conflict state, while a physically rediscovered missing row
  may return to available.
- The stored title is only the first sanitized nonblank line, bounded to 120
  Unicode code points. Prompt remainder, output, tool data, native errors and
  transcript paths never enter SQLite, renderer events, sync, exports or logs.
- Discovered Pi pointers capture the current last entry id as their expected
  head, so first continuation applies the same branch-drift guard as a
  Tuff-created pointer. Forget removes only the pointer.

## 11. Scenario: The local CLI provider family (pi / omp / codex / claude)

### 1. Scope / Trigger

- Trigger: adding a CLI to the family, or changing its argument vector, its
  stream parser, its model-catalogue read, or its executable lookup.
- One runtime owns the lifecycle for all four (`runCliChat`); everything that
  differs between them is data — the argv a provider builds and the parser it
  hands in. A new CLI that needs a third parser is a change to this contract.

### 2. Signatures

```ts
type CliRunSpec = {
  name: 'pi' | 'omp' | 'codex' | 'claude'
  errorPrefix: string
  executable: string
  args: string[] | ((attachmentPaths: string[]) => string[])
  cwd?: string
  parseLine: (line: string) => CliLineEvent | null
  terminationErrorCode: string
  logger: Logger
}

CliLineEvent = {
  delta?; usage?; provider?; model?; stopReason?; failure?
  partEvent?; partEvents?; retry?; commit?; reset?
}

buildPiArgs(prompt, model?, toolOptions?, attachmentPaths?)   // pi-cli-runtime.ts
buildOmpArgs(prompt, model?, attachmentPaths?)                // pi-cli-runtime.ts
createClaudeLineParser()                                      // cli/claude-stream-json.ts
createCodexLineParser()                                       // cli/codex-exec-json.ts
resolveCliExecutable(lookup: CliExecutableLookup)             // cli/cli-executable.ts
```

### 3. Contracts

#### 3.1 Argument matrix

| Concern | pi | omp | codex | claude |
|---|---|---|---|---|
| answer-only run | `--print --mode json --no-tools --no-extensions --no-skills --no-session` | `--print --mode json --no-tools --no-extensions --no-skills --no-rules --no-session --thinking off` | `exec --json --ephemeral --ignore-rules -s read-only --color never` | `-p --output-format stream-json --verbose --include-partial-messages --no-session-persistence` |
| tool suppression | `--no-tools` (+ `-e <extensionPath>` only when tools were granted) | `--no-tools` | `-c mcp_servers={}` | `--tools '' --strict-mcp-config --setting-sources '' --disable-slash-commands --no-chrome` |
| system prompt | `--system-prompt` | `--system-prompt` | no flag — the text is **prefixed** to the prompt | `--system-prompt` |
| model | `--model` | `--model` | `-m` | `--model` |
| attachments | `@<path>` positionals before the prompt | `@<path>` positionals | `-i <path>` (repeatable) | **dropped** — no flag exists |
| working root | `--no-context-files` + the host's cwd | `--no-rules` is its name for the same idea; no session flags exist | `-C <isolationRoot> --skip-git-repo-check` | cwd = `isolationRoot` |

- `--no-context-files` is **pi's** spelling. omp rejects it (`unknown flag`,
  exit 2) and calls it `--no-rules`; using pi's vector for omp fails before the
  first token is generated.
- omp exposes no `--session` / `--session-id` (only `-c/--continue` and
  `-r/--resume`), so it is always ephemeral. A session-continuation feature may
  not be bolted onto it by passing pi's flags.

#### 3.2 Termination semantics are per stream, not per CLI

| CLI | answer carrier | failure carrier | exit code |
|---|---|---|---|
| pi / omp | NDJSON events; deltas are preview until `message-commit` | `auto_retry_end.finalError`; unknown model arrives as **plain text on stderr** | not the answer truth |
| claude | `stream_event.content_block_delta.delta.text` only | `result.is_error === true`, message in `result.result` | secondary |
| codex | `item.completed{type:'agent_message'}` — whole answer, delta **and** `commit` on one line | `turn.failed{error.message}` | secondary |

- **claude's `subtype` is not the verdict.** A run that failed with
  `API Error: 400 unknown provider for model …` reported
  `subtype: "success"` with `is_error: true`. Reading `subtype` renders a failed
  turn as an empty answer. The same error text also rides an `assistant` line;
  reading that line as content prints every answer twice, so it is ignored and
  `result.result` is the single source of the failure text.
- **`item.completed{type:'error'}` is metadata, not failure** (codex reports
  non-fatal warnings that way); only `turn.failed` means the run produced nothing.
- **A run that ends with nothing streamed and no explicit success must throw the
  CLI's own words.** An empty bubble is the failure mode these parsers exist to
  prevent (AC5): the words are already in hand — `state.failure`, the stderr
  tail, or the exit code — and every one of them beats showing nothing.
- **Cancellation is a normal return**, not an error: `signal.aborted` wins over
  a concurrent child error, and the caller sees a generator that simply ends.
  The child must be gone when it does (see the termination window in §8.3).

#### 3.3 Executable lookup, absent vs unprobed

- Order: `TUFF_<CLI>_CLI_PATH` → `PATH` → version-manager roots (mise, volta,
  nvm, fnm) → fixed bins (`~/.local/bin`, `~/.bun/bin`, `/opt/homebrew/bin`, …).
  A GUI launch inherits launchd's `PATH` and would otherwise find nothing.
- The override is **authoritative**: a value that does not point at an
  executable means *absent*, never "search anyway". That is what makes
  `TUFF_CLAUDE_CLI_PATH=/nonexistent` a faithful simulation of an uninstalled CLI.
- `undefined` means **not probed**, `null` means **probed and absent**. Config
  assembly runs on every invoke, so treating unprobed as absent drops the row
  until something else forces a re-assembly.
- `pie` is pi's fallback form (same protocol, same catalogue); the display name
  hangs off the resolved form, so a `pie`-only machine still reads "Pi · Touch Pie".

#### 3.4 Model catalogue reads and the credential boundary

| CLI | files read | root env | never read |
|---|---|---|---|
| pi | `models.json`, `models-store.json` | `PI_CODING_AGENT_DIR` (default `~/.pi/agent`) | `auth.json` |
| omp | `models.yml` / `models.yaml` / `models.json`, `config.yml` (`enabledModels`) | `TUFF_OMP_AGENT_DIR` (default `~/.omp/agent`) | — |
| codex | `config.toml` | `CODEX_HOME` (default `~/.codex`) | `auth.json` |
| claude | `~/.claude.json` aliases | `CLAUDE_HOME` | keychain / OAuth state |

- **The return type is the boundary**: `listXxxCliModels(): string[]` of
  `<provider>/<id>` patterns — no credential can leave through a string array,
  so no caller can log one by accident.
- Warn lines carry a **fixed reason string**, never the caught error: V8's
  `JSON.parse` message quotes source text, and here the source is
  credential-bearing.
- Defensive parse, silent degrade: these are CLI internals, not contracts. An
  unrecognised shape skips entries; a corrupt file empties that source and warns
  once per run; a missing file is silent.

#### 3.5 Startup reporting

- Probing the four CLIs emits **exactly one `info` line** naming each CLI's
  resolved form or `absent`. Absence is normal (a machine without `claude`
  simply has no such row) and must not be a warning.
- The line carries names, not paths: an absolute path embeds the user's name and
  the only actionable fact is whether the CLI is there.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Model id the CLI does not know | throw with the CLI's own text (omp: stderr + exit 1; claude: `result.result`) — never an empty answer |
| CLI not installed / overridden to a non-executable | that row disappears from model options; one info line says `absent`; no warn |
| CLI not yet probed | row stays (unprobed ≠ absent) |
| Turn cancelled mid-flight | generator returns; child gone within the §8 termination window; no orphan |
| claude answers partially then fails | deltas shown, `is_error` decides the run failed |
| codex emits a non-fatal `item.completed{error}` and then an answer | answer delivered; the error item is recorded only |
| attachment sent to claude | dropped, never guessed at with a path in the prompt |
| two CLI turns at once | independent children; each owns its own teardown |

### 5. Tests Required

- One parser suite per stream (`claude-stream-json.test.ts`,
  `codex-exec-json.test.ts`, plus the pi/omp NDJSON cases in
  `pi-cli-runtime.test.ts`), each pinned to the samples in
  `.trellis/tasks/09-06-local-cli-model-providers/research/cli-protocol-samples.md`.
- Argv tests per CLI: the flags above, and the **negative** case — omp must not
  receive `--no-context-files`.
- Executable lookup: override wins, override-to-non-executable means absent,
  `pie` fallback form, version-manager roots, probe-cache reset.
- Model options: four rows when present, row removed when probed absent, row
  retained when unprobed.
- Mutation checks that must fail: swap `is_error` for `subtype` in the claude
  parser; print the whole `assistant` line as content; count
  `cached_input_tokens` on top of `input_tokens`; treat `item.completed{error}`
  as terminal.

### 6. Wrong vs Correct

#### Wrong

```ts
// claude: subtype said "success" on a run that failed with an API error
if (record.subtype === 'error') return { stopReason: 'error' }

// omp is not pi: this throws `unknown flag: --no-context-files`
args.push('--no-context-files')

// codex exec --json has no system-prompt flag
args.push('--system-prompt', prompt.systemPrompt)
```

#### Correct

```ts
// claude: the CLI's own verdict and its own words
if (record.is_error === true) {
  return { stopReason: 'error', failure: readString(record.result) ?? 'claude reported an error' }
}

// omp's own isolation vocabulary
args.push('--no-rules')

// codex: the system text rides in front of the prompt
args.push(`${prompt.systemPrompt}\n\n---\n\n${prompt.prompt}`)
```

Verified on this machine (2026-09-16): `omp` answering `pong` through
`runCliChat`; `omp` + `bogus/nope-9` → `omp exited with code 1: Model "bogus/nope-9"
not found … Or create ~/.omp/agent/models.yml`; `claude` + `bogus-nope` →
`claude ended the run without an answer: API Error: 400 unknown provider for
model bogus-nope`; cancel at 1500 ms → generator returned at 1563 ms with the
child gone. Codex's success path is **not** verified on this machine (its local
provider is unreachable); it rests on the recorded samples.
