# Troubleshooting

## 401 Unauthorized

- Check the provider `apiKey` is configured.
- The SDK filters out missing-key providers before strategy selection.

## 400 Bad Request

Common causes:

- Provider/model mismatch (rejected early)
- Invalid payload
- Embedding input too large (now chunked/truncated globally)

## SQLITE_BUSY / SQLITE_BUSY_SNAPSHOT

Symptoms:

- OCR persistence: `ocr_results` insert / `ocr_jobs` update failing

Mitigation:

- Use the unified DB write scheduler (`db-write-scheduler.ts`).
- Reduce large payload persistence (OCR raw/snippets are capped).

## Debugging checklist

- Check audit logs in `intelligence-audit-logger.ts`
- Validate routing config `intelligence.json` (providers + capabilities)
- Verify selected provider in logs: `[Intelligence] Selected provider ...`
