# Touch Regex Lab (`touch-regex-lab`)

Interactive Regex Studio for Tuff CoreBox — test regular expressions live, inspect numbered & named capture groups, preview replacements, stay protected with a static + runtime ReDoS guard, and search 26 battle-tested patterns with one-click Raw / JS / Python copy.

交互式正则表达式实验室：支持实时匹配测试、命名/编号捕获组检查、替换预览、ReDoS 静态与限时双重防护，以及 26 个精选常用正则库与 JS/Python/原始表达式一键复制。

## Trigger Commands / 触发指令

`regex` · `regexp` · `rx` · `reglab` · `regex-lab` · `正则` · `正则表达式` · `正则测试`

## Usage Examples / 使用示例

### 1. Live Match & Capture Group Inspector / 实时匹配与捕获组检查

```text
regex /(?<user>[a-z]+)@(?<domain>[\w.-]+)/gi :: alice@tuff.dev bob@example.org
regex /\b\d{3}-\d{4}\b/g :: Call 555-1234 or 888-9012
```

- Displays match count, span offsets `[start..end]`, numbered groups (`$1`, `$2`), and named groups (`<user>`, `<domain>`).
- Generates ready-to-copy **JS RegExp** (`/.../flags`), **Python** (`re.compile(r"...", re.IGNORECASE)`), and **Raw** patterns.

### 2. Replace Preview / 替换预览

Supports both sed-style and arrow-style replacement syntax, including `$1`, `$<name>`, `$&`, `$$`:

```text
regex s/(\w+)=(\d+)/$1:$2/g :: port=8080 timeout=30
regex /(?<first>\w+)\s+(?<last>\w+)/g => $<last>, $<first> :: Ada Lovelace
```

- Shows live replaced output plus ready-to-copy JS `text.replace(...)` and Python `re.sub(...)` snippets.

### 3. Pattern Inspection / 表达式解析

```text
regex /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/
```

- Validates syntax, checks ReDoS safety, and summarizes constructs (anchors, character classes, lookarounds, named groups, flags).

### 4. Curated Regex Library (26 Patterns) & Auto-Detection / 正则库检索与样例识别

```text
regex email
regex semver
regex ipv4
regex 192.168.10.42
regex 2026-11-23
```

- Search by English/Chinese keywords (`email`, `url`, `ipv4`, `ipv6`, `uuid`, `semver`, `jwt`, `cron`, `手机号`, `颜色`, `日期`).
- Paste a sample value (such as an IPv4, ISO date, UUID, or email) to auto-detect matching library regexes.

## ReDoS Protection / 安全防护

- **Static AST/structure analysis**: blocks nested quantifiers (e.g. `(a+)+`), overlapping repeated alternations (e.g. `(a|aa)+`), chained wildcard runs (`.*.*.*`), and huge repetition bounds (`{5000}`).
- **Runtime bounds**: caps input length (8,192 chars), match count (50), zero-width match loops, and execution budget (25 ms).

## Permissions / 权限说明

- `clipboard.write` *(optional)*: Copies patterns, capture outputs, replace results, and JS/Python snippets via fail-closed permission checks.
