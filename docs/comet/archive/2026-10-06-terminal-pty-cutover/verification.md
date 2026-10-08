---
generated_from_state_version: 12
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 2
- 验证器尝试次数: 1
- 完成时间: 2026-10-06T05:03:12.665Z
- 摘要: 同一指定候选与execution完成独立只读完整A1–A10验收，每项恰好一次passed。brief/fullSpec/scope、生产实现和消费路由、绑定工作区/输入、原10项Runtime receipts/logs及真实浏览器/Electron脚本材料均已核对；缺失的核心/SDK合同已交Runtime追加执行并通过。未发现阻止当前已确认范围通过的实现缺陷或外部阻塞；保留所有未执行平台/客户端/Provider场景限制，未接受结果或归档。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | `TxTerminal` 在真实浏览器中显示 ANSI 颜色、中文和连续输出；交互模式提供键盘输入，容器改变尺寸时正确适配，主题随宿主更新，卸载后释放实例和观察器。组件不要求 Electron 环境。 | 独立核对 terminal/src/TxTerminal.vue 的客户端动态导入、有序输出队列、输入/readOnly门禁、fit/主题订阅与卸载释放。真实保存证据 /tmp/tuff-terminal-smoke/browser-{initial,actions,cleanup,theme-final}.json 与 component-before/after.png 显示ANSI/中文、abc\r输入、92→53列、255→20背景、清空及卸载；Runtime tuffex-contracts 的11项组件/SSR/suite合同通过。未将组件测试中的xterm替身作为浏览器证据。 |
| A2 | passed | brief.md | Electron 中显式打开交互式终端后，子进程观察到真实 TTY；普通输入、Ctrl+C、尺寸变化和退出状态真实生效。可执行文件缺失时返回明确失败，不降级为管道进程或假成功。 | 核对主进程 terminal/index.ts → pty-session-core.ts 生产node-pty.create/spawn及write/resize/close路由，缺失可执行文件在native spawn前明确失败，无管道降级。保存的 native-evidence.json 与 native-probe.mjs/pty-child.cjs 证明TTY=true、真实输入、71x19 resize、Ctrl+C退出130、PID不可存活及missingRejected；host-entry/compile-host/electron-main加载生产channel/module/preload和真实node-pty，profile仅/tmp。 |
| A3 | passed | brief.md | 新 typed SDK 的会话创建、订阅与关闭覆盖快速输出和快速退出：首段及末段输出不丢失，不截断较大的输出块。退出、关闭、组件卸载和窗口销毁后，进程及订阅释放，重复关闭不重复通知或释放。 | 新 terminal domain SDK 在create前订阅data/exit，缓存按会话ID有序回放；creationToken处理未消费ACK取消，core等待native onExit后统一dispose，close可重复且仅一次终止/通知。Runtime追加 verifier-core-terminal-regressions(97项) 与 verifier-utils-terminal-regressions(85项)通过，覆盖快速输出/退出、100k单块、首末段、失去ACK、卸载、native退出屏障与重复close；真实证据 native-evidence.json 的48000字符及终段完整、close后PID不存在，native-extra-evidence.json 的sender销毁及sessions/creationCount归零佐证真实清理。 |
| A4 | passed | brief.md | 创建、输入、resize 和关闭均保留 `system.shell` 权限与可信调用方校验。两个窗口或插件不能操作彼此的会话，猜测会话 ID 不能绕过隔离。身份或权限不满足时，不先启动子进程。 | 独立追踪 TerminalModule四个控制注册全部经过system.shell withPermission和可信transport身份，core owner绑定具体sender/scope/plugin activation，不依赖payload声明；notifyTo→channel.broadcastTo→renderer.on消费路由已核对。Runtime两个追加合同通过，覆盖权限denied/unavailable、未验证身份在spawn前拒绝、跨plugin/window同ID及token拒绝、revoked activation清理与定向通知。真实native smoke仅直接覆盖跨窗口write拒绝，其余权限/resize/close隔离由源码和合同证据证明，未冒充真实插件运行。 |
| A5 | passed | brief.md | AI CLI 面板使用 `TxTerminal` 和共用 PTY 核心；Provider 可执行文件、访问等级、项目工作目录、原生会话恢复与 lease 的既有约束保持。切换会话或关闭面板后，旧进程退出，迟到输出不能进入新会话。 | LocalAiCliPanel使用TxTerminal；local-ai-cli主进程createTerminal交给共用ptySessionCore，保留Provider executable/feature/access、项目canonical cwd、sessionRef恢复/归属/能力和native-session lease门禁；onDispose只在真实exit后释放lease。面板generation、创建取消、早期事件按ID过滤及reset/unmount清理阻止迟到输出。Runtime core-terminal追加检查中的AI index及panel合同全部通过，覆盖恢复门禁、安全args/cwd、kill/exit/destroy lease释放与会话切换。未执行付费Provider新任务，不将合同替身当作Provider真实运行证据。 |
| A6 | passed | brief.md | 插件日志通过 `TxTerminal` 的只读模式显示；增量追加、历史切换、清空、暂停和自动滚动保持正确。显示日志不创建 PTY、不发送输入，也不主动抢焦点。 | PluginLogs.vue只向TxTerminal传lines/read-only/auto-scroll，没有PTY创建、输入事件或焦点调用；既有handleLogStream暂停与历史选择、clearLogs保持，组件prefix增量/替换reset及viewport逻辑已核对。Runtime tuffex-contracts通过，包含日志追加/原地编辑/历史切换/清空、readonly禁止输入与autofocus、关闭autoscroll保留viewport。浏览器保存证据readonlyPreserved=true、可见历史替换及清空佐证真实显示；完整正常Tuff插件日志页未逐页现场巡检。 |
| A7 | passed | brief.md | 插件创建页的 Node/degit 检测和显式安装入口使用新 SDK，不再依赖旧 `Terminal` 类。检测完成、失败或超时后释放资源；安装命令只在用户明确操作后执行，以独立 command/args 传入并显示真实输出与退出结果。 | EnvDetector通过createTerminalSdk传独立command/args，并只在成功退出且有有效输出后返回Node/degit状态；2秒超时abort并等待清理，失败不伪装可用。PluginNew安装入口显式弹出TerminalTemplate(command=npm,args=[install,-g,degit])，模板仅Start点击创建，卸载/Stop取消pending或active会话。Runtime terminal-env与TerminalTemplate合同通过；native-extra-evidence.json及native-extra.mjs证明实际生产模板经用户点击执行无副作用/usr/bin/printf，显示真实中文输出与exit0。没有执行全局npm安装。 |
| A8 | passed | brief.md | 本次替代的旧 manager、终端组件、SDK 类、重复会话实现与旧接口已删除，全部当前调用方和生成声明迁移。没有转发别名、弃用 re-export 或双实现；不再使用的终端依赖移除，非终端功能和历史审计保持。 | git diff和全仓引用核对确认旧terminal.manager、InteractiveTerminal、LogTerminal、touch-sdk Terminal类与旧kill/error接口已删除，当前AI面板/日志/环境检测/安装消费者及生成声明均迁移，未发现可调用compat re-export或第二套PTY核心。CoreApp直连xterm依赖已移到TuffEx并同步lockfile；AI task进程业务和外部目录终端功能保留，历史审计及legacy拒绝墓碑不改写。Runtime core-node/web/utils类型和suite合同通过。 |
| A9 | passed | brief.md | `TxTerminal` 的包导出、suite 与 Nexus 分类、导航、gallery、双语文档和演示完整。相关现有检查通过；验收材料包含真实浏览器组件表现与隔离 Electron 的 PTY 交互，未执行的场景明确记录，不把测试替身当作真实运行证据。 | 核对terminal公共入口、root/pro barrel、wildcard exports、构建入口/声明及dist终端CSS含xterm样式；Nexus分类/导航/gallery/demo-registry、两份完整同义文档和两个真实组件演示源齐全。原10项Runtime类型/组件/SSR/suite/文档/registry/icon/lint回执与日志逐项有效通过，未重跑；仅补两项缺失的生命周期/安全合同，由Runtime执行并通过。已独立阅读六份浏览器/Electron JSON、PNG及临时生产宿主编译/交互脚本，确认没有mock transport/module/PTY；BareHost仅提供真实模块启动所需app上下文，不是假处理器。未运行范围在risks明确保留。 |
| A10 | passed | brief.md | 长期待办包含 Ghostty 引擎评估，并明确本轮仅使用 xterm.js 与 PTY；本轮不存在 Ghostty 实现或依赖。 | 长期待办 docs/plan-prd/TODO-BACKLOG-LONG-TERM.md:44明确Ghostty/libghostty Web/WASM后续评估及本轮仅xterm.js+PTY；package/lockfile和终端实现无Ghostty引擎依赖、空实现或facade。仓库其他Ghostty名称为既有外部应用识别/打开目录功能，不属于新增引擎实现。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| CoreApp main-process contracts | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node /tmp/tuff-terminal-pty-cutover/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit -p [REDACTED] --composite false | apps/core-app | passed | 0 | 24189 ms |
| CoreApp renderer and TuffEx contracts | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node /tmp/tuff-terminal-pty-cutover/node_modules/.pnpm/vue-tsc@3.3.7_typescript@5.9.3/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p [REDACTED] --composite false | apps/core-app | passed | 0 | 23025 ms |
| Utils transport public contracts | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node /tmp/tuff-terminal-pty-cutover/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit -p [REDACTED] | packages/utils | passed | 0 | 2637 ms |
| Terminal final component and suite contracts | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node /tmp/tuff-terminal-pty-cutover/node_modules/.pnpm/vitest@3.2.7_@types+debug@4.1.13_@types+node@24.13.2_jiti@2.7.0_jsdom@26.1.0_bufferutil_c13fa0a5449f5c9d31c583b542e83236/node_modules/vitest/vitest.mjs run --project components packages/components/src/terminal/__tests__/terminal.test.ts packages/components/src/terminal/__tests__/terminal.ssr.test.ts packages/components/src/__tests__/suite-barrels.test.ts | packages/tuffex | passed | 0 | 1135 ms |
| mdc-fences | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node apps/nexus/build/check-mdc-fences.mjs | . | passed | 0 | 179 ms |
| doc-parity | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node apps/nexus/build/check-doc-translation-parity.mjs | . | passed | 0 | 64 ms |
| demo-registry | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node apps/nexus/build/check-demo-registry-orphans.mjs | . | passed | 0 | 152 ms |
| icon-collections | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node apps/nexus/build/check-icon-collections.mjs | . | passed | 0 | 151 ms |
| Nexus component documentation coverage | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node /tmp/tuff-terminal-pty-cutover/node_modules/.pnpm/vitest@3.2.7_@types+debug@4.1.13_@types+node@24.13.2_jiti@2.7.0_jsdom@26.1.0_bufferutil_c13fa0a5449f5c9d31c583b542e83236/node_modules/vitest/vitest.mjs run test/docs/tuffex-component-docs-coverage.test.ts | apps/nexus | passed | 0 | 615 ms |
| Terminal source convention gate | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node /tmp/tuff-terminal-pty-cutover/node_modules/.pnpm/eslint@9.39.4_jiti@2.7.0_supports-color@10.2.2/node_modules/eslint/bin/eslint.js src/renderer/src/views/omni-panel/components/LocalAiCliPanel.vue src/renderer/src/components/addon/TerminalTemplate.vue src/renderer/src/components/plugin/tabs/PluginLogs.vue src/renderer/src/views/base/plugin/PluginNew.vue src/main/modules/terminal/index.ts src/main/modules/terminal/pty-session-core.ts src/main/modules/local-ai-cli/index.ts --max-warnings 0 | apps/core-app | passed | 0 | 1711 ms |
| PTY permissions, AI lease and consumer lifecycle contracts | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node /tmp/tuff-terminal-pty-cutover/node_modules/.pnpm/vitest@3.2.7_@types+debug@4.1.13_@types+node@24.13.2_jiti@2.7.0_jsdom@26.1.0_bufferutil_c13fa0a5449f5c9d31c583b542e83236/node_modules/vitest/vitest.mjs run src/main/modules/terminal/pty-session-core.test.ts src/main/modules/terminal/terminal.test.ts src/main/modules/local-ai-cli/index.test.ts src/renderer/src/views/omni-panel/LocalAiCliPanel.session.test.ts src/renderer/src/components/addon/TerminalTemplate.test.ts | apps/core-app | passed | 0 | 3619 ms |
| Typed SDK cancellation, environment detection and recipient isolation contracts | PATH=/tmp/tuff-terminal-tools:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false PNPM_VERIFY_DEPS_BEFORE_RUN=false /tmp/tuff-terminal-tools/node /tmp/tuff-terminal-pty-cutover/node_modules/.pnpm/vitest@3.2.7_@types+debug@4.1.13_@types+node@24.13.2_jiti@2.7.0_jsdom@26.1.0_bufferutil_c13fa0a5449f5c9d31c583b542e83236/node_modules/vitest/vitest.mjs run __tests__/terminal-domain-sdk.test.ts __tests__/terminal-env.test.ts __tests__/local-ai-cli-terminal-sdk.test.ts __tests__/main-transport-identity.test.ts __tests__/transport-domain-sdks.test.ts | packages/utils | passed | 0 | 1008 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- Terminal consumers/PTY/SDK/permission regressions: passed — 开发期12文件191项已通过；两次具体fixture/PATH失败已修复并只复验受影响文件。最终主题源码的component合同由Runtime重新执行。
- Actual browser component smoke: passed — /tmp/tuff-terminal-smoke/browser-initial.json、browser-actions.json、browser-cleanup.json、browser-theme-final.json；只读无输入、resize92->53、主题255->20、真实屏幕清空与卸载。
- Actual Electron production typed SDK to native PTY smoke: passed — /tmp/tuff-terminal-smoke/native-evidence.json、native-extra-evidence.json；TTY真实、48k完整数据、PID退出后不存在、跨window拒绝、explicit printf不安装任何包。
- TuffEx distribution build/SSR import: passed — 完整gulp build成功；实际Node无window导入dist/es/terminal成功，installable类型正确，terminal/style.css包含引擎样式。
- 已知限制: 仅本机macOS真实运行；Windows/Linux未验收。
- 已知限制: 真实Electron smoke加载生产transport/channel/preload/TerminalModule与真实node-pty；未对完整正常Tuff客户端的所有页面做巡检。
- 已知限制: 未执行全局npm安装、付费Provider新任务、远端CI、提交、推送、合并或归档。
- 已知限制: 实际浏览器清空判断使用真实screen；body.innerText包含xterm sr-only历史公告，不作为可见日志未清空的结论。

## 阻塞项

_无。_

## 风险与跳过的工作

- 真实运行证据限本机macOS；Windows/Linux运行与打包未执行，brief明确列为本轮非目标，不外推跨平台通过。
- 真实Electron证据来自/tmp独立profile的生产channel/transport/preload/TerminalModule/真实node-pty宿主，不是完整正常Tuff客户端所有页面的巡检。
- 付费Provider新任务、用户真实AI会话/配置、全局npm安装、远端CI未执行；AI门禁/lease及EnvDetector边界结合源码与Runtime合同验收，合同中的替身仅作为可重复合同证据。
- Verifier复用并审查已有真实浏览器/Electron材料，未现场重跑这些smoke；原10项Runtime检查不重跑，只通过request-checks补充两项缺失的核心/SDK安全生命周期合同，两项共182测试通过。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Builder handoff Runtime checks failed: core-node-types, component-doc-coverage | 2026-10-06T04:33:51.120Z |
| 1 | 2 | 1 | pass | — | 同一指定候选与execution完成独立只读完整A1–A10验收，每项恰好一次passed。brief/fullSpec/scope、生产实现和消费路由、绑定工作区/输入、原10项Runtime receipts/logs及真实浏览器/Electron脚本材料均已核对；缺失的核心/SDK合同已交Runtime追加执行并通过。未发现阻止当前已确认范围通过的实现缺陷或外部阻塞；保留所有未执行平台/客户端/Provider场景限制，未接受结果或归档。 | 2026-10-06T05:03:12.665Z |



## 结论

同一指定候选与execution完成独立只读完整A1–A10验收，每项恰好一次passed。brief/fullSpec/scope、生产实现和消费路由、绑定工作区/输入、原10项Runtime receipts/logs及真实浏览器/Electron脚本材料均已核对；缺失的核心/SDK合同已交Runtime追加执行并通过。未发现阻止当前已确认范围通过的实现缺陷或外部阻塞；保留所有未执行平台/客户端/Provider场景限制，未接受结果或归档。
