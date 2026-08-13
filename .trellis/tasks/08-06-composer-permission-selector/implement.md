# Implement — composer 权限选择器与 Auto Context 归位

按序执行;每步后跑该步的验证命令。工作目录默认 `apps/core-app/`。

## Checklist

1. [ ] **Transport 类型**:`packages/utils/transport/sdk/domains/agent-tools.ts` 的 `setEnabled` payload 加可选 `mode?: 'review' | 'full'`(含类型导出)。
   - 验证:`cd apps/core-app && npm run typecheck:node`
2. [ ] **主进程短路**:`src/main/modules/tool-gateway/index.ts` — `setEnabled` handler 读 `payload.mode`(缺省 `'review'`)存入 `this.mode`;`confirm` 回调开头 full 短路 + `toolLog` 日志,`remember: false`。
   - 验证:`npx vitest run src/main/modules/tool-gateway/`
3. [ ] **主进程测试**:补档位用例——mode=full 时 confirm 不广播直接 approve 且有日志;切回 review 后恢复广播;**切档不追溯**(已 pending 的请求在切 full 后仍等待决定/超时);disabled 路径不受影响。放在 `gateway-server.test.ts` 同目录新 `index.test.ts` 或就近文件。
4. [ ] **Renderer hook**:`src/renderer/src/modules/conversation/useAgentTools.ts` — `setEnabled` → `setMode('off'|'review'|'full')`;`resetApprovals` 已暴露,无需改。
5. [ ] **HomePage 胶囊**:删 Auto Context 与工具胶囊(~876-897),加权限胶囊 + 三档弹层(radiogroup、键盘可达、TuffEx 优先);切「完全允许」在弹层内二步确认(焦点落取消键,取消回列表);full 态胶囊警示样式(边框+文字色);弹层 footer「重置已记住的授权」(仅自动审阅档显示,连 `resetApprovals` + 轻提示);`agentToolsMode` computed(兼容读 + 双写 + `setMode`);挂载时 mode≠off 同步主进程(先核对是否已有同步点);`autoContext` computed 保留仅删 UI。
   - 验证:`npm run typecheck:web`
6. [ ] **SettingTools 默认值**:`appSetting.tools` 默认对象加 `agentToolsMode: 'off'`。
7. [ ] **i18n**:zh-CN/en-US —— 新 `home.permission*` 键(三档 + hint + 确认步标题/说明/取消/确认 + 重置授权);`settingTools.autoContext*` 中文化(zh);删 `home.autoContext*` / `home.agentTools*` 四键(两语言同步)。en 档位名:Off / Review each call / Allow all。
   - 验证:`rg "home.autoContext|home.agentTools" src/renderer` 无 UI 残留引用
8. [ ] **回归**:`npx vitest run src/renderer/src/modules/conversation/ src/main/modules/tool-gateway/`;`npm run typecheck`;改动文件 lint delta(用包内 ESLint 配置,不整文件 --fix)。

## Review gates

- 步骤 3、5 完成后各跑一轮 trellis-check(主进程语义 / renderer 版式与可达性)。
- 全部完成后:3.3 回写 `agent-tool-gateway-contracts.md` §4(full-allow 条款)+ §7(新增测试项)。

## Rollback points

- commit 1:transport + 主进程(步骤 1-3);commit 2:renderer + i18n(步骤 4-8)。任一可单独 revert;setting 新字段被旧代码忽略,无数据迁移。
