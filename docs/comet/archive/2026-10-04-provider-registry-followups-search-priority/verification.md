---
generated_from_state_version: 17
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 2
- 迭代: 1
- 验证器尝试次数: 2
- 完成时间: 2026-10-04T17:12:33.772Z
- 摘要: 当前dispatch scope只有A10，已恰好一次回传passed；candidateId保持37fbd4c7-7da0-467b-a040-f6822266078d，使用新verifierExecutionRef 3538b78c-3c53-44b0-82d1-0ae02dfee47a。前轮10项passed保持不变，A10原证据阻塞在用户授权与Runtime补检、真实中文8格DOM/截图核对后解除。最新Runtime16项检查全部passed，Verifier本次request-checks只执行zh-dashboard-browser；未修改实现/测试/正式需求/配置，未accept-result、归档、提交或推送。补充成功日志为logs/checks/965784a0-1ced-4d6c-9ec3-cc0d343feeb6-zh-dashboard-browser.log，证据为外部zh-supplement/matrix.json和8张截图。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1：TxButton 同时设置 circle 和 size="sm" 时，真实浏览器测得宽高相等且符合 sm 尺寸；其他既有尺寸及非 circle 按钮不退化。 | 独立核对 button/style/index.scss 的统一高度变量与 circle:not(.block) 分支；真实浏览器 real-controls.json、button-circle-sizes.json/截图显示 sm 26×26、md 32×32、lg 38×38、flat-sm 32×32。普通尺寸规则未改变；复用候选绑定的 TuffEx 全量3142测试及构建回执。 |
| A2 | passed | brief.md | A2：TxSelect 的 id 与 aria-label 从首次渲染到属性更新均到达实际 combobox，而不是仅在根 div；单选 label-for 可聚焦对应控件，多选仍有可访问名称。后台迁移到公共属性后不再使用专用命名指令，也不出现重复 id。 | 独立沿 TxSelect triggerAttrs→TuffInput inputAttrs→原生INPUT 追踪属性，class/style仍在根，单选/多选分别接收id和可访问名称；real-controls.json验证首次id/name、更新后旧id数量0/新id数量1、两类多选名称及label聚焦；naming-metadata.json验证后台20个标签无缺失/重复id。全仓引用核对确认专用指令/DOM改写消费者已移除，TxPagination改公共aria-labelledby。 |
| A3 | passed | brief.md | A3：TxStatCard 的 default 与 progress 变体都显示非空 meta，未传 meta 时不新增空说明。AdminStatGrid 仅一项有 meta 时，说明只显示一次、各卡数字仍对齐，加载骨架与成品布局一致。 | 独立核对 TxStatCard.vue:281-316 两变体共用meta输出且无meta/slot不新增节点，AdminStatGrid通过公共meta及aria-hidden空白slot保留说明行，骨架分支保留；real-controls.json、stat-card-default.json及真实截图验证default/progress各显示一次、未传无说明。naming-metadata.json五卡valueY均128.2109375，服务渠道说明文本仅出现一次。 |
| A4 | passed | brief.md | A4：确认框叠在 TxDrawer 上时，Tab/Shift+Tab 留在确认框，Escape 只关闭确认框、提交中不关闭；底层抽屉保持打开。确认框关闭后抽屉恢复自身键盘操作，业务代码不依赖 TuffEx 内部类名或 body 按键拦截绕行。 | 独立读取isTopmostModalDialog与TxDrawer/TxModal的实际document消费分支：按可见dialog/z-index分配键盘，忽略defaultPrevented；AdminConfirmDialog与panel关闭入口在loading时拒绝关闭，业务body拦截与内部CSS判断已删。browser-behavior-evidence.json记录7次Tab/反向Tab均在确认框、Escape仅关确认框；pending-confirmation.json覆盖焦点BODY及挂起请求时两层均保留、Tab恢复。 |
| A5 | passed | brief.md | A5：场景运行请求已发出后，无论正常返回失败状态还是服务端拒绝并记录失败运行，页面都自动刷新注册表，更新最近运行和统计，同时保留运行错误与失败结果。仅输入 JSON 本地解析失败不发运行请求，也不触发该刷新。 | 独立追踪runScene→观测服务POST→错误extractFailedSceneRun→finally refresh→不会reject的useAdminResource；请求标记位于JSON解析之后，运行结果及panel.error不由刷新覆盖。真实隔离D1证据显示HTTP409后usage 0→1、latestRun Failed且错误保留；本地JSON失败注册表请求数0/usage仍1，截图可见保留的失败运行与trace。 |
| A6 | passed | brief.md | A6：编辑服务渠道时，任一有效能力行的计量、约束、metadata JSON 或既有本地校验不通过，都在首个渠道/能力写请求前失败；已填内容保留，错误显示对应字段与行号。合法输入仍能更新渠道及能力，保留删除确认和保存代次隔离。 | 独立核对saveProviderEdit:780-806，渠道本地校验与prepareProviderCapabilities均在updateProvider前完成，全部有效行计量/约束/metadata解析、非负数及重复校验在消费写入循环之前完成，原始index保留；删除确认和panel/token代次隔离保留。真实D1 invalidCapabilityJson证据写请求0、服务端未变、输入名称保留、字段行号错误且抽屉打开；valid-provider-save.json验证修正后渠道和能力合法保存并关闭。 |
| A7 | passed | brief.md | A7：完整目标规格准确写明只有服务渠道与能力路由有筛选栏，能力索引保留独立客户端分页、cap_ URL 状态和空态；三个列表不会因首次数据晚到而丢失深链页码。 | 完整读取708行服务Spec，:342-389及:699-708明确只有渠道/路由筛选栏，能力索引只分页及cap_ URL/空态。独立核对实际RoutesTab模板、三个factory及whenRegistryLoaded等待/失败分支；候选绑定Nexus全量2241测试包含晚到rt_page=2、失败cap_page=2及不同列表URL互不覆盖的实际组合件回归。 |
| A8 | passed | brief.md | A8：经引用分析确认仅由测试使用的旧筛选/空态函数与其专属测试被删除；仍被生产页面使用的单项判定和格式化等函数保留，现有真实筛选、分页和空态行为不变。 | 独立检查删除patch和全仓符号引用，8个旧集合筛选/空态函数、专用类型及其专属测试均已删除，无生产残留导入；providerMatchesObservability、sceneMatchesObservability、格式化/领域函数仍保留并由实际factory调用。真实AdminFilterBar/createClientListFetcher/AdminTable空态链未更改，候选绑定Nexus全量回归通过。 |
| A9 | passed | brief.md | A9：在无使用历史的默认条件下，设置总览、常用设置子页及现有其他可搜索 AppDestination 入口获得有界排序加分，优先于同一查询的低相关模糊结果；精确应用/文件意图、用户置顶和现有学习信号不被全局置顶规则覆盖，不相关查询不召回内置入口，不改用户配置或使用历史。 | 独立读取目录精确别名解析、provider产生identity、sorter主进程注册与renderer scoring.final/pin消费。仅当前查询解析出的host-owned system destination id加90000，不改变召回/历史；18入口catalog-bias证据均90000，sorter-boundaries验证精确app/file、pin、空/无关query边界。真实隔离Electron sz截图/JSON显示无历史Settings首位，Enter后真实DOM为/setting/overview；复用搜索导航133测试和实际CoreApp构建。 |
| A10 | passed | brief.md | A10：受影响后台页面保留现有加载/刷新/失败/重试、四标签页 URL 状态、只读详情、删除与执行确认、表单命名及保存代次隔离契约；1280px 下中英、深浅色无新增横向溢出，确认取消不产生业务写请求。 | 独立核对同一候选源码的useAdminResource加载/刷新/失败/重试、useAdminList与四tab URL、只读详情、ProviderRegistryPanel取消零写入及保存token/panel代次隔离；相关Nexus有效Runtime回执和前轮真实英语/行为证据继续适用。原中文矩阵因直接$i18n.setLocale绕过真实路由chunk加载而证据不足，未计通过。用户授权补验后，本Verifier用新的execution亲自登记startup，并仅通过request-checks申请zh-dashboard-browser；最初gp.$i18n.t探针失败已据实际日志识别为项目外harness错误，修正后同项Runtime收据passed/exit0/16553ms，executedCheckIds仅此一项，未重跑其他15检查。独立读完整zh-supplement/matrix.json及8份新截图，1280×900双主题四tab均heading服务渠道、五统计卡和全部表头中文，真实分页显示共1条、rawKeys=[]，pageOverflow=0、panelOverflow=0，所有表宽974≤panelWidth976，五卡数字对齐；截图与记录一致。独立追踪HeaderUserMenu.vue:105-107→setManualLocale→setLocaleSerial先ensureCurrentRouteLocaleChunks，/admin实际加载dashboard中文chunk，补充走真实语言菜单而非只改locale标签。A10中文真实渲染覆盖已补齐，没有需修复的候选实现问题。 |
| A11 | passed | brief.md | A11：受影响 TuffEx 中英组件文档、必要演示和完整目标规格与实现一致；定向检查通过，并提供真实 Nexus 浏览器与隔离 Electron 的行为证据，不以静态测试替代实际交互。 | 独立逐份读取brief及4份完整目标Spec，并核对6组中英组件文档patch与4个现有demo，公共接口/尺寸/meta/键盘描述一致；真实公开button/select/stat-card页截图和JSON可复核更新，真实Nexus行为及隔离Electron搜索/设置DOM证据存在。核对候选绑定Runtime15门禁均exit0，实际日志为TuffEx279文件3142测试、Nexus279文件2241测试、CoreApp3文件133测试及两构建/三类型/三scoped lint/三docs/diff；不把A10缺失中文覆盖算作已完成。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| TuffEx distributable build | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts | packages/tuffex | passed | 0 | 22727 ms |
| TuffEx full regression suite | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/vitest/vitest.mjs run --maxWorkers=2 | packages/tuffex | passed | 0 | 54195 ms |
| Nexus full regression suite | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/vitest/vitest.mjs run --maxWorkers=2 | apps/nexus | passed | 0 | 31961 ms |
| CoreApp settings search regression suite | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/vitest/vitest.mjs run src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts src/main/modules/box-tool/addon/system/app-destination-provider.test.ts src/main/modules/app-destination --maxWorkers=2 | apps/core-app | passed | 0 | 2167 ms |
| CoreApp main-process types | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/typescript/bin/tsc --noEmit -p [REDACTED] --composite false | apps/core-app | passed | 0 | 18633 ms |
| TuffEx component types | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p [REDACTED] | packages/tuffex | passed | 0 | 7246 ms |
| Canonical Nuxt types | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false NUXT_TUFFEX_SOURCE=true NUXT_USE_CLOUDFLARE_DEV=false NUXT_ENABLE_SENTRY=true /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/nuxt/bin/nuxt.mjs typecheck | apps/nexus | passed | 0 | 25655 ms |
| CoreApp actual runtime build | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false BUILD_TYPE=dev SENTRY_DISABLE=1 /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/electron-vite/bin/electron-vite.js build | apps/core-app | passed | 0 | 41248 ms |
| Nexus changed-source lint | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/eslint/bin/eslint.js app/components/admin/AdminFormField.vue app/components/admin/AdminStatGrid.vue app/components/content/demos/ButtonShapesDemo.vue app/components/content/demos/DrawerBasicDrawerDemo.vue app/components/content/demos/SelectSelectDemo.vue app/components/content/demos/StatCardDefaultVariantDemo.vue app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue app/components/dashboard/provider-registry/ProviderRegistryCheckDrawer.vue app/components/dashboard/provider-registry/ProviderRegistryProviderDrawer.vue app/components/dashboard/provider-registry/ProviderRegistrySceneDrawer.vue app/components/dashboard/provider-registry/provider-registry-components.test.ts app/composables/useAdminFieldControl.ts app/composables/useProviderRegistryAdmin.ts app/utils/admin-kit.ts app/utils/admin-kit.test.ts app/utils/admin-provider-registry.ts app/utils/admin-provider-registry.test.ts app/utils/provider-registry-admin.ts app/utils/provider-registry-admin.test.ts app/components/admin/admin-kit-components.test.ts | apps/nexus | passed | 0 | 3680 ms |
| TuffEx changed-source lint | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node ../../node_modules/eslint/bin/eslint.js packages/components/src/drawer/src/TxDrawer.vue packages/components/src/modal/src/TxModal.vue packages/components/src/pagination/src/TxPagination.vue packages/components/src/select/src/TxSelect.vue packages/components/src/stat-card/src/TxStatCard.vue packages/utils/z-index-manager.ts | packages/tuffex | passed | 0 | 866 ms |
| CoreApp changed-source lint | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node ../../node_modules/eslint/bin/eslint.js src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts | apps/core-app | passed | 0 | 635 ms |
| Nexus demo registration | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node build/check-demo-registry-orphans.mjs | apps/nexus | passed | 0 | 88 ms |
| Nexus MDC fences | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node build/check-mdc-fences.mjs | apps/nexus | passed | 0 | 58 ms |
| Nexus bilingual documentation parity | PATH=/private/tmp/tuff-provider-followups-runtime-1004/bin:/usr/bin:/bin npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node build/check-doc-translation-parity.mjs | apps/nexus | passed | 0 | 57 ms |
| Patch whitespace | diff --check | . | passed | 0 | 76 ms |
| 真实中文后台1280px双主题四标签页 | /private/tmp/tuff-provider-followups-runtime-1004/zh-matrix-check.mjs | . | passed | 0 | 16553 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- CoreApp focused regressions: passed — 2 files / 72 tests; actual source sorter temporary smoke verified 18 searchable destinations +90000, precise app/file, pin and empty/unrelated query boundaries.
- Nexus focused regressions: passed — 13 files / 158 tests; real isolated-D1 browser invalid JSON zero writes and successful valid save; real HTTP409 led to Usage 0→1 and latest run Failed.
- TuffEx focused regressions: passed — Initial 114 cases had a drawer event-ownership regression; fixed disconnected-listener handling. Subsequent drawer 17/17 and modal+drawer 24/24 passed; other original focused suites passed. Final complete suite is in Runtime plan.
- Typechecks and builds: passed — CoreApp node types, TuffEx types, TuffEx distribution build, CoreApp actual build passed. Canonical Nuxt typecheck passed with NUXT_ENABLE_SENTRY=true; direct app-only config lacked ambient types, disabled Sentry mode lacked its Nuxt augmentation. Those initial attempts were not counted as passed.
- Live browser and Electron: passed — ego TaskSpace214 closed after actual 16-case 1280px locale/theme/tab matrix with no overflow; circle 26/32/38 and flat-sm32; dynamic id/name, multi names, stat meta, pending modal proof. Real isolated CoreBox sz ranked Tuff Settings first and Enter opened /setting/overview with rendered settings; private SQLite and Chromium paths verified.
- Docs gates and scoped lint: passed — Demo registry/MDC fences/zh-en parity passed; source lint with owning configs passed after targeted formatting; final whitespace check clean before deleting last obsolete metadata test.
- 已知限制: 未执行提交、合并、推送、PR 或发布；能力规格仍在change目标文档，待用户接受结果和确认归档后才发布。
- 已知限制: 本轮真实Electron验证为macOS隔离开发宿主，不宣称Windows/Linux打包验证。
- 已知限制: 独立实现/测试子代理在此前遇到模型服务503 auth_unavailable，零代码写入；父代理完成实现并仅删除失效旧测试，未自行新增永久测试。最终Verifier尚未启动，不能把本轮自查视为独立验收。
- 已知限制: 从stage创建的worktree未带Comet工具pin，早期命令落到全局0.4.0-rc.6；已明确切到项目固定0.4.4。需求正文和已向用户展示的摘要未改，沿用本轮用户“confirm to build”确认；旧CLI重复拆出的50项按Spec Acceptance引用归并回原11项，完整规格内容保留。
- 已知限制: 截图与JSON证据位于本机 /Users/talexdreamsoul/Workspace/docs/engineering/reports/provider-registry-followups-search-priority，临时UI页、D1插件、Electron启动器已从候选删除。

## 阻塞项

_无。_

## 风险与跳过的工作

- 补充中文证据来自用户授权的Ego空间217与同一隔离D1/项目外Nuxt layer，不宣称生产数据或真实上游写入验证；原matrix-zh截图不作为中文通过依据。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native Shape artifacts changed | 2026-10-04T16:20:23.996Z |
| 2 | 1 | 1 | blocked | A10 | 当前独立Verifier已亲自提交startup，完整核对11项与所有完整Spec/源码消费边界/Runtime原始日志/外部行为证据，最后参考Builder摘要。10项passed，A10仅中文真实矩阵缺失而blocked；未发现可证明由patch引入的实现缺陷，不能将本轮整体判passed。复用15项匹配候选且exit0的Runtime收据，未重复build/lint/tests/formatters，未修改实现/测试/正式需求/配置，未accept-result或archive。等待仅新建Ego中文验收空间的明确授权后补最小真实检查。 | 2026-10-04T16:44:03.931Z |
| 2 | 1 | 1 | recovery | — | 用户已明确选择“允许补验”：允许新建Ego空间，仅补齐1280px后台主体真实中文、无原始翻译键的两主题四tab证据；不修改候选实现或需求，复用已通过的15项门禁。 | 2026-10-04T16:46:47.748Z |
| 2 | 1 | 2 | pass | — | 当前dispatch scope只有A10，已恰好一次回传passed；candidateId保持37fbd4c7-7da0-467b-a040-f6822266078d，使用新verifierExecutionRef 3538b78c-3c53-44b0-82d1-0ae02dfee47a。前轮10项passed保持不变，A10原证据阻塞在用户授权与Runtime补检、真实中文8格DOM/截图核对后解除。最新Runtime16项检查全部passed，Verifier本次request-checks只执行zh-dashboard-browser；未修改实现/测试/正式需求/配置，未accept-result、归档、提交或推送。补充成功日志为logs/checks/965784a0-1ced-4d6c-9ec3-cc0d343feeb6-zh-dashboard-browser.log，证据为外部zh-supplement/matrix.json和8张截图。 | 2026-10-04T17:12:33.772Z |



## 结论

当前dispatch scope只有A10，已恰好一次回传passed；candidateId保持37fbd4c7-7da0-467b-a040-f6822266078d，使用新verifierExecutionRef 3538b78c-3c53-44b0-82d1-0ae02dfee47a。前轮10项passed保持不变，A10原证据阻塞在用户授权与Runtime补检、真实中文8格DOM/截图核对后解除。最新Runtime16项检查全部passed，Verifier本次request-checks只执行zh-dashboard-browser；未修改实现/测试/正式需求/配置，未accept-result、归档、提交或推送。补充成功日志为logs/checks/965784a0-1ced-4d6c-9ec3-cc0d343feeb6-zh-dashboard-browser.log，证据为外部zh-supplement/matrix.json和8张截图。
