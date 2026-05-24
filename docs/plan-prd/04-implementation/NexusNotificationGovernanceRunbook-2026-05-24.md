# Nexus Notification Governance Runbook

> Date: 2026-05-24
> Scope: Nexus notification channel configuration, live-send evidence, and privacy-safe audit.

## Current Status

- Status is **in progress, not production-complete**.
- Local channel-test and delivery analytics are covered by focused tests and cockpit contract checks.
- Real credential-backed live sends for email, chat/webhook, and Web Push are still open evidence blockers.

## Supported Channels

| Profile | Channel / provider type | Adapter | Credential type | Production evidence |
| --- | --- | --- | --- | --- |
| Browser inbox | `browser` / `browser` | `browser` | None | Local implementation and analytics evidence only. Needs authenticated cockpit evidence. |
| Resend | `email` / `resend` | `email/resend` | `api_key` | Open. Needs real delivery evidence. |
| SendGrid | `email` / `sendgrid` | `email/sendgrid` | `api_key` | Open. Needs real delivery evidence if used. |
| Mailgun | `email` / `mailgun` | `email/mailgun` | `api_key` | Open. Needs real delivery evidence if used. |
| Postmark | `email` / `postmark` | `email/postmark` | `api_key` | Open. Needs real delivery evidence if used. |
| SMTP relay | `email` / `smtp` | `email/smtp` | `smtp` | Open. Requires HTTPS relay endpoint evidence, not direct SMTP socket from Pages. |
| Generic HTTP email | `email` / `generic` | `email/generic` | `webhook` | Open. Requires relay response evidence. |
| Feishu bot | `feishu` / `feishu` | `feishu` | `bot_token` or webhook credential | Open. Needs real room/bot send evidence. |
| Lark bot | `lark` / `lark` | `lark` | `bot_token` or webhook credential | Open. Needs real room/bot send evidence. |
| Webhook | `webhook` / `webhook` | `webhook` | `webhook` | Open. Needs real receiver evidence. |
| Web Push relay | `webpush` / `webpush` | `webpush` | `webhook` | Open. Requires public VAPID runtime key, stored subscription, and relay response evidence. |

## Config Shape

Notification channel configs are `platform_governance_configs` rows with `configType = "notification_channel"`.

Example Resend channel:

```json
{
  "configType": "notification_channel",
  "name": "Resend review notifications",
  "channel": "email",
  "provider": "resend-primary",
  "limits": {
    "maxMessagesPerDay": 5000,
    "maxFailuresPerHour": 50
  },
  "config": {
    "mode": "send",
    "providerType": "resend",
    "credentialRef": "secure://notifications/resend-primary",
    "from": "Tuff <noreply@example.com>",
    "subject": "Plugin review status changed",
    "events": ["plugin.version.approved", "plugin.version.rejected"]
  }
}
```

Rules:

1. Credential refs must use `secure://notifications/*`.
2. Do not store recipient lists in persistent channel config. Recipients must come from the dispatch payload, owner lookup, or browser push subscription store.
3. Non-browser production channels must use `mode: "send"` for live delivery.
4. SMTP must use an HTTPS relay endpoint. Direct SMTP sockets are not a Cloudflare Pages runtime assumption.
5. Web Push requires both relay credential and public runtime readiness (`webPushPublicKeyConfigured`).

## Credential Payloads

Store credentials through `/api/dashboard/notifications/credentials`; never put them in channel config, logs, docs, or governance metadata.

| Credential type | Expected payload | Notes |
| --- | --- | --- |
| `api_key` | `{ "apiKey": "..." }` | Resend, SendGrid, Mailgun, Postmark. |
| `smtp` | `{ "host": "...", "port": 587, "username": "...", "password": "...", "secure": false, "from": "..." }` | Sent to the HTTPS SMTP relay only. |
| `webhook` | `{ "url": "https://...", "signingSecret": "..." }` | Generic webhook/email relay/Web Push relay. |
| `bot_token` | `{ "token": "..." }` | Feishu/Lark bot token builds the official bot webhook URL. |

## Dry-Run Procedure

1. Create or select a notification channel in Data Governance.
2. Bind the credential ref if the adapter requires it.
3. Run **Dry run** from the channel test panel.
4. Expected audit event: `notification.delivery.planned`, or `notification.delivery.failed/skipped` with a visible reason.
5. Confirm `notifications.testEvidence` shows planned/skipped/failed counts without recipient, body, endpoint key, token, or credential data.

Dry-run proves routing and readiness only; it is not live-send evidence.

## Live-Send Procedure

Use this only after credentials and recipients are intentionally configured.

1. Start with one low-risk channel:
   - Email: Resend or a hosted HTTP email relay.
   - Chat: Feishu/Lark bot or generic webhook.
   - Browser/Web Push: browser inbox first, then Web Push relay after VAPID/subscription readiness.
2. Run **Dry run** and attach the sanitized cockpit output.
3. Run **Send** from the same channel test panel.
4. Expected success audit event: `notification.delivery.sent`.
5. Check provider-side evidence:
   - Email provider message id or accepted HTTP status.
   - Feishu/Lark/webhook receiver message timestamp.
   - Web Push relay accepted status and a stored subscription id/hash, not raw endpoint.
6. Confirm `notifications.deliveryEvidence` or `notifications.testEvidence` updates with status, provider, adapter, duration, status code, counts, and unique actor count.

## Failure Response

| Reason | Meaning | Action |
| --- | --- | --- |
| `credential-ref-required` | Channel needs a secure credential ref. | Add `secure://notifications/*` to config and store credential payload. |
| `credential-missing` | Credential ref exists but secure store has no payload. | Re-bind credential via the credentials API/UI. |
| `credential-type-mismatch` | Stored payload does not match adapter expectation. | Replace credential with the right type. |
| `send-mode-required` | Channel is not in send mode. | Set `config.mode = "send"` after dry-run proof. |
| `recipient-missing` | Email/browser delivery has no target user/recipient. | Provide dispatch recipient metadata or ensure owner/user lookup exists. |
| `relay-endpoint-missing` | SMTP lacks an HTTPS relay endpoint. | Configure `endpoint` or `relayUrl`. |
| `webpush-vapid-public-key-missing` | Web Push public runtime key is absent. | Configure public runtime key before live Web Push evidence. |
| `subscription-missing` | No Web Push subscription is available. | Register a browser push subscription for the target user. |
| `adapter-http-error` | Provider returned non-2xx. | Check provider dashboard, credential, domain/sender verification, and rate limits. |
| `adapter-request-failed` | Network client threw before a provider status was available. | Check runtime egress, DNS, timeout, and relay health. |

## Privacy Boundary

Governance audit may record:

- notification action
- config id/name
- channel/provider/provider type/adapter
- delivery status/reason
- duration/status code
- resource type/id when non-sensitive
- bounded safe metadata

Governance audit must not record:

- raw admin/reviewer/developer ids or emails
- recipients
- subject/text/html/body/title/url
- credential refs
- API keys, tokens, passwords, signing secrets
- Web Push endpoint, `p256dh`, or `auth`

Provider requests still receive the required delivery payload. The restriction applies to governance records and dashboard analytics.

## Evidence Checklist

- [x] Channel config readiness analytics and action queue.
- [x] Channel-test analytics (`notifications.testEvidence`) with sanitized audit metadata.
- [x] Non-test delivery analytics (`notifications.deliveryEvidence`) separated from channel-test evidence.
- [x] Auth email helpers routed through notification governance channels.
- [ ] Real email provider live-send evidence.
- [ ] Real Feishu/Lark or webhook live-send evidence.
- [ ] Real Web Push relay evidence with public runtime key and subscription.
- [ ] Authenticated admin cockpit screenshot/interaction evidence.

## Focused Verification

```sh
pnpm -C "apps/nexus" exec vitest run \
  "server/utils/notificationDispatcher.test.ts" \
  "test/api/dashboard/notifications/channels.api.test.ts" \
  "test/api/dashboard/notifications/channels-test.api.test.ts" \
  "test/api/dashboard/notifications/credentials.api.test.ts" \
  "test/api/dashboard/notifications/inbox.api.test.ts" \
  "test/api/dashboard/notifications/push-subscriptions.api.test.ts" \
  "server/utils/platformGovernanceStore.test.ts" \
  "app/pages/dashboard/admin/governance.test.ts"

pnpm -C "apps/nexus" exec eslint \
  "server/utils/notificationDispatcher.ts" \
  "server/utils/notificationDispatcher.test.ts" \
  "server/utils/notificationChannelCatalog.ts" \
  "test/api/dashboard/notifications/channels-test.api.test.ts"
```

`pnpm -C "apps/nexus" run typecheck` is still not the current acceptance gate for this slice because existing unrelated failures remain in `nuxt.config.ts`, `packages/utils/core-box/preview/abilities/*`, and Volar/vue-router plugin typing.
