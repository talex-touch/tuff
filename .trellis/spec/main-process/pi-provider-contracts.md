# pi Provider Contracts

Contracts for the `pi` CLI provider path (home conversation). Established by
08-05-attachments-to-model; commits 647fb3f2a / d9a25ed5f.

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
