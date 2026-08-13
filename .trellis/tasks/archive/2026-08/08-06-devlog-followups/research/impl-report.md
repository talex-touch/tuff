# 实施报告(2026-08-06)

## R1 会话保存(主会话完成)

- schema:`conversation_messages` 复合主键 `(conversation_id, id)`;0037 手写迁移 + journal;
  store 删插入事务化。`conversation-messages-schema.test.ts` 4 测试绿;全链迁移应用绿(exposure
  schema 测试遍历 journal);typecheck:node 干净。
- 已知不可恢复:修复前失败保存已删除的线程消息(日志中 b181f3d2)无法找回。

## R2 shortcutTriggered 广播化(devlog-followups-impl 完成)

- `window.ts` show() 两处 `sendTo(...).catch(()=>{})` → `broadcastToWindow(window.window.id, ...)`,
  时序与「Publish shortcut intent before exposing the window」注释保留,渲染端未动。
- 事件名解析链已验证:defineEvent → toEventName `core-box:ui:shortcut-triggered` → broadcastTo 信封
  (与 _sendTo 同、少 sync 块)→ 渲染端 __handle_main 按 name 派发 → renderer transport.on 同 key;
  Port allowlist 不含此事件,无通道分叉。60s WARN 源 = _sendTo 的 CHANNEL_DEFAULT_TIMEOUT(60s,
  channel-core.ts:727);broadcastTo 不进 pendingMap,WARN 消除。
- 行为差异记录:broadcastToWindow 在窗口已销毁时抛异常(原 sendTo 的 rejection 被吞)——与同函数
  既有 ui.trigger 广播同暴露面,show() 开头已校验窗口未销毁,按既有范式未加 try/catch。

## R3 shrink 日志诚实化(devlog-followups-impl 完成)

- else 分支 error → `debug('CoreBox window is not created yet, skipping shrink')`;
  「Shrunk window to compact mode」移进动画分支;同步分支保留原 `'CoreBox shrink applied'`,
  catch 不再顺带宣称成功。行为未改。

## 测试与门

- `window.test.ts` 12 passed(10 旧 + 2 新,新用例对旧代码均会失败,非空转);测试桩修复:
  transport/childLogger mock 提升为稳定对象(原每次返回新对象,无法断言)。
- typecheck:node 零错误;eslint 包内配置下两文件全清(从仓库根跑 eslint 是另一份配置,~108 条
  既有 style 报错与本次无关)。
- 全量 box-tool vitest:151/152 文件过;唯一失败 `search-core.contracts.test.ts` ×2 属并行任务
  reco-item-freshness 在途状态,归其 B7 门收敛。
