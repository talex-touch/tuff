-- Tuff Launcher Database Schema
-- Version: 1.0
-- Author: Gemini AI

-- 启用外键约束 (推荐)
PRAGMA foreign_keys = ON;

-- =============================================================================
-- 1. 文件索引系统 (FileIndex)
-- =============================================================================

-- 1.1 `files` — 文件元数据表
-- 存储文件的核心信息
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  extension TEXT,
  size INTEGER,
  mtime INTEGER NOT NULL,
  ctime INTEGER NOT NULL,
  is_dir INTEGER NOT NULL DEFAULT 0,
  pinyin TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_access INTEGER
);

-- 为常用查询字段创建索引
CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime);
CREATE INDEX IF NOT EXISTS idx_files_last_access ON files(last_access);


-- 1.2 `file_fts` — 文件名和拼音的全文搜索表 (FTS5)
-- 用于高效地搜索文件名和拼音
-- 注意: 这里我们只索引文件名和拼音，不索引文件内容，以保持数据库轻量和快速。
-- 如果需要索引文件内容，可以将内容插入此表。
CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
    name,
    pinyin,
    content='files',      -- 将内容存储在外部表 'files'
    content_rowid='id'    -- 关联 'files' 表的主键 'id'
);

-- 1.3 `Triggers` for FTS5 Synchronization
-- 创建触发器，在 `files` 表发生变化时，自动同步数据到 `file_fts` 全文搜索表

-- 当 `files` 表插入新数据后，将 `name` 和 `pinyin` 插入到 `file_fts`
CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
  INSERT INTO file_fts(rowid, name, pinyin) VALUES (new.id, new.name, new.pinyin);
END;

-- 当 `files` 表数据被删除后，从 `file_fts` 中删除对应条目
CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
  INSERT INTO file_fts(file_fts, rowid, name, pinyin) VALUES ('delete', old.id, old.name, old.pinyin);
END;

-- 当 `files` 表数据更新后，更新 `file_fts` 中的对应条目
CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
  INSERT INTO file_fts(file_fts, rowid, name, pinyin) VALUES ('delete', old.id, old.name, old.pinyin);
  INSERT INTO file_fts(rowid, name, pinyin) VALUES (new.id, new.name, new.pinyin);
END;


-- =============================================================================
-- 2. 用户行为记录 (UsageTracker)
-- =============================================================================

-- 2.1 `usage_logs` — 原始行为日志表
-- 记录每一次具体的用户交互
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  action TEXT NOT NULL, -- 'click', 'preview', 'execute', etc.
  keyword TEXT,
  timestamp INTEGER NOT NULL
);

-- 为常用查询字段创建索引
CREATE INDEX IF NOT EXISTS idx_usage_item_id ON usage_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_logs(timestamp);


-- 2.2 `usage_summary` — 行为频率汇总表
-- 用于快速查询某个项目的总使用频率和时间，避免实时计算
CREATE TABLE IF NOT EXISTS usage_summary (
  item_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  click_count INTEGER NOT NULL DEFAULT 0,
  last_used INTEGER NOT NULL
);

-- 创建索引以加速按来源和时间的查询
CREATE INDEX IF NOT EXISTS idx_summary_source ON usage_summary(source);
CREATE INDEX IF NOT EXISTS idx_summary_last_used ON usage_summary(last_used);


-- =============================================================================
-- 3. 插件数据与系统配置
-- =============================================================================

-- 3.1 `plugin_data` — 插件键值对存储表
-- 为插件提供统一的持久化存储能力
CREATE TABLE IF NOT EXISTS plugin_data (
  plugin_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (plugin_id, key)
);

-- 3.2 `config` — 系统全局配置表
-- 存储 Tuff 自身的配置项
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 插入一条默认配置用于演示
INSERT OR IGNORE INTO config (key, value) VALUES ('app_version', '1.0.0');

COMMIT;
