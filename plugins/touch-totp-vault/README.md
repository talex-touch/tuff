# Touch TOTP Vault (`@talex-touch/touch-totp-vault-plugin`)

A purely local, zero-network **RFC 6238 / RFC 4226 2FA TOTP Authenticator** for Tuff. Generates live 6- and 8-digit TOTP codes using a pure-JS Base32 decoder and WebCrypto `crypto.subtle` (`HMAC-SHA1`, `HMAC-SHA256`, `HMAC-SHA512`), with strict fail-closed secret isolation.

## Security Architecture / 安全边界

- **Secrets exclusively in `secret` capability**: Every Base32 TOTP seed is written via `secret.set(key, value)` (key format `totp.<id>`) and NEVER written to `plugin.storage`, logs, or rendered item payloads.
- **Sanitized metadata only**: `plugin.storage` (`totp-accounts.json`) stores only `{ id, secretKey, issuer, label, algorithm, digits, period, createdAt }`.
- **Fail-closed persistence**: If the `secret` capability is missing or `secret.set` fails, the import/add aborts immediately without writing metadata to `plugin.storage`. If metadata persistence fails after `secret.set`, the newly written secret is rolled back via `secret.delete`.
- **Gated clipboard writes**: Copying a live TOTP code always routes through a plugin action checked against `permission.check('clipboard.write')` (never a host `copy` bypass) and recomputes the live code at copy time so expired codes are never copied.

## Triggers / 触发词

`totp`, `2fa`, `otp`, `mfa`, `auth`, `vault`, `验证码`, `令牌`, `动态码`

## Usage / 使用示例

### View Live Codes / 查看实时验证码
- Open with empty query (or filter by issuer/account name such as `github` or `aws`).
- Displays formatted live codes (`287 082` / `9428 7082`) with a 10-segment countdown bar (`███████░░░ 21s`).
- Press Enter to copy the clean digits (without spaces).

### Import via `otpauth://` URI / 导入 `otpauth://` 链接
Paste a standard authenticator URI directly:
```text
otpauth://totp/GitHub:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30
```
Review the redacted metadata preview and confirm to save into the encrypted secret store.

### Manual Add / 手动添加
```text
add GitHub alice@example.com JBSWY3DPEHPK3PXP
add CloudCorp ops@corp.io GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ digits=8 period=30 algo=SHA256
```

### Delete Account / 删除令牌
- Trigger the secondary `delete-account` action on any item, or query `delete <name>` / `remove <name>`.

## Permissions / 权限说明

- `storage.plugin` (required): Authorizes host encrypted `secret` capability (`secret.get`/`secret.set`/`secret.delete`) and non-secret metadata storage (`totp-accounts.json`).
- `clipboard.write` (optional): Copies the active TOTP code on explicit user action (fail-closed if denied or unavailable).

## Testing

```bash
node -c index.js && node --test index.test.cjs
```
