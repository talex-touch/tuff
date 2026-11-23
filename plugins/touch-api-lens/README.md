# Touch API Lens (`touch-api-lens`)

Quick HTTP & cURL scratchpad and saved API collections plugin for Tuff CoreBox.

## Features

- **cURL & HTTP Shorthand Parser**: Paste any `curl` command (including `-X`, `-H`, `-d`/`--data-raw`, `--json`, `-u`, `-G`, `-I`, `--url`, line continuations, and quoted arguments) or type shorthand such as `GET https://api.github.com/repos/talex-touch/tuff` or `POST https://httpbin.org/post {"hello":"world"}`.
- **Redacted Live Preview**: Previews method, URL, headers, and body locally on every keystroke with sensitive headers (`Authorization`, `Cookie`, `X-API-Key`, tokens) automatically redacted — never leaking raw credentials into previews, logs, or CoreBox item payloads.
- **Permission-Gated Execution**: Executes requests exclusively through the host `http` facade after fail-closed `network.internet` verification. Formats JSON responses, HTTP status, payload size, and round-trip latency.
- **Saved API Collections with Secret Isolation**: Save named presets (`save <name> <request>`). Non-secret metadata is persisted in `plugin.storage` (`collections.json`), while Bearer tokens, Basic credentials, cookies, and API keys are stored exclusively via the host `secret` capability (fail-closed if `secret.set` fails).
- **Redacted Snippet Export**: Copy requests as clean `curl` commands or JavaScript `fetch()` snippets with secret headers replaced by safe placeholders (`<API_TOKEN>` / `<SECRET_VALUE>`).

## Commands

Activate via `api`, `curl`, `http`, `rest`, `api-lens`, `接口调试`, or `请求调试`:

- `api GET https://api.github.com/zen`
- `api POST https://httpbin.org/post -H "Content-Type: application/json" {"ping":true}`
- `api curl -X POST https://api.example.com/v1/items -H "Authorization: Bearer <your-token>" -d '{"name":"tuff"}'`
- `api save github-zen GET https://api.github.com/zen`
- `api run github-zen`
- `api delete github-zen`
- `api last` (inspect most recent HTTP response)

## Permissions

All permissions are optional and enforced fail-closed at execution time:

- `network.internet`: Execute HTTP requests via the host `http` facade.
- `storage.plugin`: Save/load non-secret presets in `plugin.storage` and isolate secrets via `secret`.
- `clipboard.write`: Copy formatted responses, cURL commands, and `fetch()` snippets.

## Testing

```bash
node -c index.js && node --test index.test.cjs
```
