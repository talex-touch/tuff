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
