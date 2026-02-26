# Nexus Locale Backfill Runbook (2026-02-26)

## Goal

将 `auth_users.locale` 历史脏值收敛到 `en | zh | NULL`，与 Nexus i18n 新约束保持一致。

## Scope

- 表：`auth_users`
- 字段：`locale`
- 目标环境：Nexus D1（prod/preview 均可按环境执行）

## Execution Steps

### 1) Pre-check (read-only)

```sql
SELECT locale, COUNT(*) AS total
FROM auth_users
GROUP BY locale
ORDER BY total DESC;
```

### 2) Backfill SQL

```sql
BEGIN TRANSACTION;

UPDATE auth_users
SET locale = 'zh'
WHERE locale IS NOT NULL
  AND TRIM(locale) != ''
  AND LOWER(locale) LIKE 'zh%';

UPDATE auth_users
SET locale = 'en'
WHERE locale IS NOT NULL
  AND TRIM(locale) != ''
  AND LOWER(locale) LIKE 'en%';

UPDATE auth_users
SET locale = NULL
WHERE locale IS NOT NULL
  AND TRIM(locale) != ''
  AND LOWER(locale) NOT LIKE 'zh%'
  AND LOWER(locale) NOT LIKE 'en%';

COMMIT;
```

### 3) Post-check (read-only)

```sql
SELECT locale, COUNT(*) AS total
FROM auth_users
GROUP BY locale
ORDER BY total DESC;
```

期望仅出现：`en`、`zh`、`NULL`。

## Optional: Wrangler Commands

> 下面命令中的 `<DB_NAME>`、`--env` 请替换为实际值。

```bash
wrangler d1 execute "<DB_NAME>" --env production --command "SELECT locale, COUNT(*) AS total FROM auth_users GROUP BY locale ORDER BY total DESC;"
wrangler d1 execute "<DB_NAME>" --env production --file "./docs/plan-prd/04-implementation/sql/nexus-locale-backfill-260226.sql"
wrangler d1 execute "<DB_NAME>" --env production --command "SELECT locale, COUNT(*) AS total FROM auth_users GROUP BY locale ORDER BY total DESC;"
```

## Rollback

该回填是幂等收敛，不提供逐行回滚。若需恢复，请依赖执行前快照或 D1 备份。

