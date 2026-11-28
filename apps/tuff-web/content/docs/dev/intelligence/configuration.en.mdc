# Configuration

## File location

The runtime config is persisted in:

- `<user-data>/config/intelligence.json`

It contains:

- `providers`: provider list + credentials + default model
- `capabilities`: per-capability routing bindings (providerId, priority, models)
- `globalConfig`: cache/audit/defaultStrategy

## Provider config

Typical fields:

- `id`: stable provider id used by routing
- `type`: `openai | anthropic | deepseek | siliconflow | local | custom`
- `enabled`
- `apiKey` (required for non-local providers)
- `baseUrl` (optional)
- `defaultModel` (optional)

## Capability routing

A capability binding may define:

- `providerId`
- `priority`
- `models` (preferred model list)

If `options.allowedProviderIds` is empty, the SDK uses routing config bindings.
If `options.modelPreference` is empty, the SDK merges model lists from routing config.

## Governance (important)

- Provider/model mismatch is rejected before network calls.
- Missing API key providers are filtered out before strategy selection.
- For `embedding.generate`, the SDK applies **normalize + chunking + truncation + aggregation**.
