# 复查报告(devlog-followups-check,2026-08-06)——通过

R1/R2/R3 逐条过,门禁:3 文件 19 测试绿;typecheck:node 零错误;范围内 eslint 全清
(修 1 处:conversation-messages-schema.test.ts 行宽,--max-warnings=0 下会卡门禁)。

## 复查中额外确立的证据

- 0037 迁移:INSERT/SELECT 显式列名列序一致(列序无关保数据);新表定义与 0035 逐字一致仅 PK
  行不同;级联外键与索引保留。叶子子表前提全仓证实(无 FK/视图/触发器/其他 TS 引用)。
  PRAGMA 无需手写的前提双验:`client.migrate()` 自带 `PRAGMA foreign_keys=off`+deferred 事务
  (@libsql/client sqlite3.js:143-174);privacy 测试 helper 在 foreign_keys=ON 下应用全链同样通过。
- journal `when`=1785628800000 延续「每迁移 +1 天」合成时间惯例,且为全 journal 最大——关键:
  drizzle 只应用 `folderMillis` 大于库内最新 created_at 的迁移,老库才能升级。
  (journal 0010→0011 有既有非单调,与本次无关。)
- store 事务化与 usage-stats-queue.ts:321 既有范式一致;scheduleDbWrite 为透传,无嵌套事务。
- R2 投递目标同一性:broadcastToWindow → BrowserWindow.fromId → channel-core getWebContents
  返回同一个 webContents;60s WARN 只可能来自 _sendTo 的 pending 定时器,broadcastTo 不起定时器。
- 首唤走 shrink 已证:`CoreBoxManager._isCollapsed` 初值 true(manager.ts:49)。

## 只报不改(范围外遗留,待立项/择机)

1. **retention-migration.test.ts 既有红 ×2**:写死 `migrations.at(-1)==='0034_...'` 与 journal 行数
   35,自 0035/0036 起已破,0037 只是推远;且 slice(0,-1) 的切法已测不到它本要测的 0034 升级路径。
   修法:按 0034 下标切片。归 privacy 模块,建议单独立项。
2. **expand() 对称撒谎日志**:window.ts:528 对良性「窗口未创建」打 error,:531 无条件宣称成功。
   触发条件是 idle-destroy 后仍处展开态,冷启首唤不命中(首唤 collapsed),R3 验收不受影响。
3. **beginner.shortcutTriggered 同款 60s 陷阱**:core-box/index.ts:94 `sendToWindow`(请求-响应)
   发往主窗口,唯一监听在引导页 Done.vue;未挂载时 1 分钟后同样超时告警。被 admission 门挡着,
   只影响未完成 onboarding 的用户;日志再现时按 R2 同法收口。

## 数据结论

修复前失败保存已删除的线程(b181f3d2)不可恢复,无补救手段。
