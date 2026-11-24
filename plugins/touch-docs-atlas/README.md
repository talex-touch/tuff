# Touch Docs Atlas (`touch-docs-atlas`)

100% Offline Developer Reference Atlas & Calculators for Tuff CoreBox — instant lookup for HTTP status codes (1xx–5xx), `chmod` octal ↔ symbolic calculator, IPv4 CIDR subnet calculator, MIME types, ASCII/ANSI escape codes, and curated Git/Docker/SQL/cURL/tmux cheatsheets.

离线开发者参考手册与实用计算器：内置 HTTP 1xx–5xx 状态码、chmod 权限双向计算、IPv4 CIDR 子网计算器、MIME 类型、ASCII/ANSI 转义码，以及 Git/Docker/SQL/cURL/tmux 75 条高频速查命令。

## Trigger Commands / 触发指令

`atlas` · `devref` · `docs-atlas` · `http` · `httpcode` · `statuscode` · `chmod` · `cidr` · `subnet` · `mime` · `ascii` · `ansi` · `cheat` · `cheatsheet` · `速查` · `参考手册` · `状态码` · `子网` · `权限计算`

## Usage Examples / 使用示例

### 1. HTTP Status Codes (1xx–5xx) / HTTP 状态码

```text
http 429
http 5xx
http redirect
statuscode 418
```

### 2. `chmod` Octal ↔ Symbolic Calculator / 权限计算器

```text
chmod 755
chmod 4755
chmod 1777
chmod rwxr-xr-x
chmod drwxrwxrwt
chmod u=rwx,g=rx,o=rx
```

- Supports 3-digit and 4-digit octal (including `setuid`, `setgid`, `sticky` special bits), 9/10-char `ls -l` symbolic forms, symbolic clauses, binary bitmasks, and security warnings for world-writable modes.

### 3. IPv4 CIDR Subnet Calculator / 子网计算器

```text
cidr 192.168.1.42/24
cidr 10.0.0.1/31
cidr 10.0.0.1/32
cidr 172.16.5.10 255.255.240.0
```

- Calculates network address, broadcast address, subnet & wildcard masks, usable host range & counts (including RFC 3021 `/31` point-to-point and `/32` host routes), RFC 1918/6598/loopback/link-local classification, binary representation, and copyable JSON report.

### 4. MIME Types & ASCII / ANSI Codes / MIME 与编码速查

```text
mime svg
mime sse
mime application/pdf
ascii A
ascii 65
ascii 0x1B
ascii LF
ansi green
ansi rgb
```

### 5. Developer Cheatsheets (Git / Docker / SQL / cURL / tmux) / 高频命令速查

```text
cheat git rebase
cheat docker logs
cheat sql window
cheat curl timing
cheat tmux split
atlas worktree
```

## Permissions / 权限说明

- `clipboard.write` *(optional)*: Copies status summaries, chmod commands, CIDR JSON/masks, MIME headers, ANSI sequences, and cheatsheet recipes via fail-closed permission checks.
