# Nexus AI channel billing

## Goal

Ship the first Nexus-owned, DashScope-backed ASR product path. CoreApp and future clients call Nexus capability routes; Nexus alone resolves the encrypted upstream credential, selects a registered provider capability, admits work against a monthly credit balance, records non-sensitive metering evidence, and settles the final credit charge.

## Confirmed facts

- Nexus has `provider_registry` and `provider_capabilities`; a provider carries a secure credential reference, safe metadata, capability metadata, and provider quota controls.
- Provider credentials are encrypted in `provider_secure_store` and must not enter API responses, logs, analytics, ordinary metadata, or UI projections.
- The existing registry vendor enum omits DashScope. Existing generic Intelligence providers are user-owned/legacy mirrors and are not the authority for a product route.
- `creditsStore` supplies calendar-month team/user quota accounting and idempotent consumption, with Free users receiving 1,000 credits; 5,000 is a later-month verification boost after email, OAuth, and Passkey requirements.
- `creditsStore` has no request reservation, settlement, or release lifecycle. Completed-call-only consumption is unsuitable for ASR admission, especially later realtime sessions.
- DashScope `qwen-audio-3.0-asr-flash-filetrans` is asynchronous and requires a provider-readable audio URL. Nexus's existing managed R2/scene objects are authenticated/private and cannot be given to DashScope; a caller-supplied URL would violate the server-owned media boundary. DashScope's separate Qwen3 synchronous ASR accepts Base64 audio up to 10 MB but has a different model and cost rule.

## Requirements

1. Add `dashscope` as a first-class Nexus provider-registry vendor and add a registered, server-owned DashScope ASR adapter. Do not expose unimplemented NewAPI or Volcengine provider types.
2. Use a dedicated Nexus-controlled temporary media handoff for the approved `qwen-audio-3.0-asr-flash-filetrans` batch route. Nexus stores the audio privately, creates an opaque expiring delivery URL only for DashScope, and never forwards a caller-supplied URL, provider, model, endpoint, credential, price, or charge.
   - Initial ingress is a PCM/float WAV body only, capped at 20 MiB and 10 minutes, so Nexus can calculate a server-owned duration bound before admission. General media and direct multipart uploads require a separate managed-media ingestion contract.
3. Admit every ASR request with a server-owned credit reservation before upstream dispatch. Finalization must deterministically settle the reservation or release it when no upstream billable work was accepted.
4. Apply the Filetrans pricing rule `ceil(max(transcriptUnits, billedSeconds × 4))` from the server-normalized final response.
5. Store a request record and ledger metadata containing only stable IDs, route/capability identifiers, metering counts, credit values, timestamps, and stable status/reason codes. Never retain audio bytes, transcript text, provider errors, credentials, or endpoints in the billing ledger.
6. Preserve the existing provider registry, credential-store, quota, and provider-usage ownership boundaries. Fail closed for invalid/disabled/uncredentialed capabilities, insufficient credits, malformed input, unsupported provider responses, and unaccepted upstream failures.
7. Do not expose public prices, checkout, or a claim that credits equal money. The public pricing SoT remains unchanged.
8. Keep realtime DashScope temporary-token issuance, NewAPI, and Volcengine routing as follow-on work after the selected batch data plane and ledger lifecycle are proven.

## Acceptance Criteria

- [ ] An administrator can register an enabled DashScope provider with a secure credential reference and `audio.transcribe` capability; API projections never reveal the credential.
- [ ] The selected media/data-plane contract retains the Nexus-only credential and media boundary; it never forwards a caller-supplied URL to DashScope.
- [ ] A valid authenticated WAV batch transcription is routed only through one selected DashScope provider capability. Submission returns `202 dispatching`; the authenticated status endpoint polls DashScope and returns the transcript only in the terminal response.
- [ ] A request reserves credits before provider dispatch; a successful provider response settles exactly once from provider seconds plus normalized transcript units; any retry with the same key returns the persisted request state without another charge.
- [ ] A rejected/unaccepted upstream request releases its reservation exactly once. An accepted-but-unsettleable provider response remains a stable failed request and does not silently retry or fabricate a refund.
- [ ] Client-controlled model, provider, price, charge, transcript-unit, duration, URL, and storage-key fields are rejected/ignored at the API boundary.
- [ ] Provider credentials, audio body, transcript content, upstream endpoint, and native provider error text are absent from persisted request/ledger projections.
- [ ] Focused Nexus billing/store, adapter, and API tests; Nexus typecheck; API-route guard; and `git diff --check` pass.

## Out of Scope

- Direct client-to-DashScope realtime media sessions and `st-*` temporary-token minting.
- NewAPI or Volcengine runtime adapters, models, automatic fallback, or arbitrary HTTP provider configuration.
- Public payment, checkout, public price display, purchased-credit expiration, or production deployment.
- CoreApp local ASR channel persistence, audio capture, VAD, voice HUD, and the active `09-08-persist-asr-provider-channels` task.

## Selected product decision

Use the screenshot's Filetrans model through a Nexus-controlled temporary handoff. The handoff keeps source audio private in Nexus storage, serves it only by an opaque expiring token that is never persisted in plaintext or returned to the client, and deletes/invalidate it after a terminal ASR state.

## CoreApp continuation (2026-09-08)

The user approved continuing with built-in CoreApp Nexus calls. Extend the existing Tuff Nexus provider with `audio.stt`, reuse the main-owned app login and capability bindings, and connect the existing file/recorded-audio transcription entry points. No separate cloud credential form or provider catalogue is introduced.

- [ ] Submit only bounded WAV bytes through the existing Nexus origin and app access-token lifecycle; preserve one opaque idempotency key during an authorized retry.
- [ ] Poll the same request to its terminal transcript and authoritative credit receipt; reject invalid or missing results rather than reporting an empty success.
- [ ] Cancellation, logout/account changes, deadlines and uncertain dispatch never cause another provider dispatch; no transcript/receipt reuse through generic Intelligence cache.
- [ ] Fresh and existing settings expose the built-in speech capability without overriding explicit disabled providers/bindings; login-required and credit errors are actionable.
- [ ] The file-transcription UI shows the server's billed credits and duration. Filetrans remains batch-only; live `audio.asr` and upstream credentials remain unchanged.
- [ ] Verify focused CoreApp runtime/auth/routing regressions and the real settings surface; distinguish local protocol evidence from a paid live DashScope run.
