# Design — composer 权限选择器与 Auto Context 归位

## 最佳实践对照(取舍依据)

| 实践来源 | 采纳 | 落点 |
|---|---|---|
| Claude Code `bypassPermissions`:启用需显式警告、危险模式不进 Shift+Tab 快捷循环、模式状态常显 | ✅ | 切入完全允许的二步确认;无快捷循环,菜单显式选;full 态胶囊警示样式 |
| Cursor auto-run:开启处就地说明后果 | ✅ | 确认步文案直说「含破坏性 MCP 工具在内全部自动放行」 |
| Claude Code:纯读工具不询问直接放行 | ⏸ 暂缓 | 现有 remember 机制首批后等效免弹;本任务不再扩大确认语义变更面,避免一次改两层契约 |
| 拒绝的方案:完全允许重启后自动降级回自动审阅 | ❌ | 显式选择即配置,静默改用户配置更 surprising;安全权重由确认步+警示态承担 |

## 状态模型

- 新字段 `appSetting.tools.agentToolsMode?: 'off' | 'review' | 'full'`。
- 读取兼容:`mode = agentToolsMode ?? (agentTools === true ? 'review' : 'off')`;写入时同步维护旧布尔 `agentTools = mode !== 'off'`,保证回滚到旧版本代码仍可用。
- `SettingTools.vue` 的 `appSetting.tools` 默认对象补 `agentToolsMode: 'off'`。

## Transport / 主进程

- `AgentToolEvents.setEnabled` payload 扩展为 `{ enabled: boolean; mode?: 'review' | 'full' }`(可选字段,缺省视为 `'review'`,新旧两端互相兼容)。「禁用」即 `enabled: false`,不引入新事件。
- `ToolGatewayModule` 持有 `private mode: 'review' | 'full' = 'review'`;`confirm` 回调开头短路:

```ts
if (this.mode === 'full') {
  toolLog.info(`Auto-approved (full-allow): ${request.tool} — ${request.summary}`)
  return { approved: true, remember: false }
}
```

- 不广播、不进 `pending`、不写 session approvals(`remember: false`),因此切回「自动审阅」后 write/execute 恢复逐条确认,已 remember 的 read 工具维持现有语义。切档不主动 reset approvals(用户仍可走现有 `resetApprovals`)。
- `confirm` 每次调用读 `this.mode`,档位切换即时生效,无需重启 gateway。
- **切档不追溯**:短路发生在 `confirm` 入口;已广播、正挂在 `pending` 的请求不受档位切换影响,仍等 renderer 决定(或 2 分钟超时拒绝)。防止「为了以后省事切 full」意外放行了屏上那条破坏性调用。
- **契约修订**:本设计修改 `agent-tool-gateway-contracts.md` §4「every call passes the gate」——修订为「每次调用都到达 gate;full-allow 档位在 gate 处按用户全局授权自动放行并记日志」。3.3 阶段回写 spec。

## Renderer

- `useAgentTools`:`setEnabled(value)` 改为 `setMode(mode: 'off' | 'review' | 'full')`,内部发 `{ enabled: mode !== 'off', mode: mode === 'off' ? undefined : mode }`(内部 hook,调用点只有 HomePage,直接改签名)。
- `HomePage.vue`:
  - 删除 Auto Context 胶囊与「工具」胶囊(现 876-897 行),原位放一个「权限」胶囊:图标 + 当前档位文案(如「权限 · 自动审阅」),点击弹三档小菜单(radiogroup 语义,键盘可达,优先 TuffEx primitives;容器样式对齐 HomeModelMenu 的弹层)。
  - **完全允许的二步确认**:在弹层内就地展开确认(标题 + 后果说明 + 取消/确认两键,焦点移到取消键),确认才写档位,取消回三档列表。不另开模态,减少层级。
  - **full 态警示样式**:胶囊在完全允许下用警示色系(边框+文字,非仅图标),与 `active` 蓝色区分。
  - **弹层 footer**:一条「重置已记住的授权」动作(仅自动审阅档显示),直连 `useAgentTools().resetApprovals()`(hook 已暴露,零主进程改动),成功后轻提示。
  - `agentToolsMode` computed:get 走兼容读取,set 写 setting(新旧字段)并调 `agentTools.setMode`。
  - 挂载时若 mode ≠ 'off' 主动 `setMode` 同步一次主进程(主进程 `enabled` 默认 false,重启后需要 renderer 对齐;实现时先核对现状是否已有同步点,避免重复)。
  - `autoContext` computed 保留(useHomeConversation per-send 注入仍读它),仅删 UI;确认卡片区(`agentTools.pending`)不动——full 档主进程不广播,卡片自然不出现。
- 设置页不新增工具档位入口(用户决策:档位并入 composer 权限胶囊,设置页只保留 Auto Context)。

## i18n

- zh-CN:`home.permission*` 新键——权限 / 禁用 / 自动审阅 / 完全允许 + 各档 hint + 确认步(标题/说明/取消/确认)+ 「重置已记住的授权」;`settingTools.autoContext` → 「自动上下文」(hint/desc 相应中文化确认)。
- en-US:Permissions / Off / Review each call / Allow all + 对应 hint、确认步、Reset remembered approvals;Auto Context 保持英文。
- 删除 `home.autoContext` / `home.autoContextHint` / `home.agentTools` / `home.agentToolsHint`,zh/en 键集同步。

## 安全考量

- full 档每条自动放行必须落 `toolLog` 日志(tool + summary),MCP critical 的 `⚠ ` 前缀保留在日志里。
- full 档对 critical/destructive 工具同样放行——「完全允许」的语义即用户接受全局授权;不做二级例外(避免档位语义含糊)。
- 伪造 surface / 插件驱动的防线不变(`assertHostOwned`、§5 注入契约均不动)。

## 兼容与回滚

- transport 可选字段 + 双写 setting:任意一侧回滚都不破。
- 回滚点:renderer UI 与主进程短路是两个独立 commit,可单独 revert。
