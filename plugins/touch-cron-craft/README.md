# Touch Cron Craft (`touch-cron-craft`)

Cron Expression Humanizer, exact Local/UTC next-run scheduler, bilingual natural-language generator, and production presets for Tuff CoreBox.

Cron 定时表达式助手：支持标准 5 字段与 `@daily`/`@hourly`/`@weekly` 等别名解析、中英文自然语言反向生成、精确本地/UTC 未来 10 次运行时间推算，以及 16 个高频生产预设。

## Trigger Commands / 触发指令

`cron` · `crontab` · `cron-craft` · `定时任务` · `定时表达式` · `计划任务`

## Usage Examples / 使用示例

### 1. Parse & Humanize 5-Field Cron & Aliases / 解析 5 字段表达式与别名

```text
cron */15 9-18 * * 1-5
cron 30 2 1,15 * *
cron @daily
cron @weekly utc
cron 0 0 29 2 * utc
```

- Supports `*`, steps (`*/5`, `5/15`), ranges (`1-5`, `MON-FRI`, `FRI-SUN`), lists (`1,15`), named months (`JAN`–`DEC`), named weekdays (`SUN`–`SAT`, `0` or `7` for Sunday), and `@yearly`/`@annually`/`@monthly`/`@weekly`/`@daily`/`@midnight`/`@hourly`/`@reboot`.
- Computes exact next 10 run times in both **Local** and **UTC** (including leap years like Feb 29 and Vixie cron DOM/DOW union semantics).
- Append or prepend `utc` to make UTC the primary schedule view.

### 2. English & Chinese Natural-Language Reverse Generator / 中英文自然语言反推 Cron

```text
cron every 15 minutes on weekdays
cron every weekday at 9:30 am
cron every mon,wed,fri at 8:30
cron monthly on 15th at 9am
cron 每5分钟
cron 每天早上9点半
cron 工作日 9:30
cron 每周一三五 8:30
cron 每月15日 9:30
```

- Automatically generates the 5-field cron expression, displays bilingual explanation, calculates the next 10 run times, and offers copy actions for **Cron**, **Crontab line**, **GitHub Actions YAML**, and **Run list**.

### 3. Production Presets / 常用预设

```text
cron
cron presets
cron quarterly
```

## Permissions / 权限说明

- `clipboard.write` *(optional)*: Copies cron expressions, humanized summaries, GitHub Actions YAML snippets, and run schedules via fail-closed permission checks.
