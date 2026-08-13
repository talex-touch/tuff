# CoreBox composer 权限选择器与 Auto Context 归位

## Goal

Composer 左侧现在有两个语义重叠的胶囊(Auto Context / 工具),用户感知重复。收敛为一个「权限」选择器,并把 Auto Context 收归设置页、文案中文化。

## Background(现状)

- `HomePage.vue:876-897`:两个胶囊并排 —— Auto Context 切 `appSetting.tools.autoContext`,工具切 `appSetting.tools.agentTools` + `useAgentTools().setEnabled()`。
- zh-CN 里 `home.autoContext` 与设置页 `autoContext` 的文案字面值均为英文 "Auto Context",未中文化。
- 设置页(SettingTools.vue)已有 Auto Context 开关(`autoContextGroupTitle` 上下文分组)。
- 主进程 ToolGatewayModule:每次工具调用经 confirm 广播 → renderer 内联确认卡片(approve/deny + remember,仅 read 风险可 remember),2 分钟超时拒绝。

## Requirements

1. **权限选择器(替代两个胶囊)**:composer 左侧只保留一个「权限」胶囊,三档:
   - 禁用:等价现在的工具关闭态(gateway 不启用,不下发工具)。
   - 自动审阅:现行为,逐条弹确认卡片。
   - 完全允许:所有工具调用自动放行,不再弹确认。
2. **危险档的摩擦与可见性**(参照 Claude Code `bypassPermissions` / Cursor auto-run 实践):
   - 切入「完全允许」必须经过一次显式确认(说明后果:含 MCP 破坏性工具在内全部自动放行),可取消;
   - 「完全允许」生效期间胶囊呈警示样式(有色差,不只靠文字),让用户始终看得见自己处于放权态;
   - 不为危险档提供任何无确认的快捷切换路径(无隐藏循环快捷键;菜单显式选择)。
3. **已记住授权的管理**:权限菜单内提供「重置已记住的授权」入口(走现有 `resetApprovals`),重置后 read 工具恢复询问。
4. **Auto Context 归位**:composer 移除 Auto Context 胶囊;仅设置页可开关;per-send 注入逻辑(`useHomeConversation` 读取 setting)保持不变。
5. **中文化**:zh-CN 下 Auto Context 相关文案改为中文(如「自动上下文」),设置页与任何残留展示位一并处理;en-US 保持英文。
6. **持久化与迁移**:权限档位持久化到 `appSetting.tools`;旧布尔 `agentTools` 需向后兼容(true → 自动审阅,false/缺省 → 禁用);三档均跨重启保持(显式配置,不做重启自动降级)。
7. **主进程生效**:完全允许必须在主进程 confirm 流程生效(不是 renderer 偷偷点同意),禁用走现有 `setEnabled(false)` 路径;切档只影响后续调用,已在屏的确认卡片仍需用户回答,不被追溯放行。

## Constraints

- 完全允许属于安全敏感行为:自动放行的调用仍要有日志;会话内已 remember 的放行语义不受档位切换破坏(切回自动审阅后恢复逐条确认)。
- 不改动工具集本身(本任务不新增/删除工具,a2ui 相关能力不在本任务范围)。
- 遵循 CoreBox v2.5 版式语言:composer 弹出层职责不变(模型+推理强度),权限胶囊是独立控件。

## Acceptance Criteria

- [ ] Composer 左侧只有「+」附件按钮与一个「权限」胶囊,无 Auto Context 与「工具」胶囊。
- [ ] 权限三档切换生效:禁用时 pi spawn 拿不到工具;自动审阅逐条确认;完全允许不弹卡片且调用成功、有日志。
- [ ] 切入「完全允许」出现确认步,取消则档位不变;生效期间胶囊有警示样式。
- [ ] 「重置已记住的授权」后,此前 remember 过的 read 工具重新弹确认。
- [ ] 切档不追溯:自动审阅下已在屏的确认卡片,在切到完全允许后仍等待用户回答。
- [ ] 档位与 Auto Context 设置重启后保持;旧 `agentTools: true` 用户升级后落在「自动审阅」。
- [ ] zh-CN 全部相关文案中文;en-US 相应更新(Permissions / Off / Review each call / Allow all)。
- [ ] 设置页 Auto Context 开关仍工作,per-send `autoContext` 注入行为不变。
- [ ] `npm run typecheck`(core-app)通过;相关既有测试(useHomeConversation.test、gateway/tool-registry 测试)通过并按需补充档位用例。
