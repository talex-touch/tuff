# 设置选项全量盘点与剃刀建议

> 范围：所有 `/setting/*` 分类页所组合的现有设置组件、其可见项和隐藏的高级项。插件业务内部设置不在本表内；全局设置中仅作为跳转入口的项目单列标注。

## 结论摘要

- 普通用户设置最终只保留少量真实偏好：显示语言、同步授权、启动与后台驻留、核心助手启用、以及需要手动指定时的网络代理。
- 用户主动打开的高级设置只承载低频但仍反映个人使用方式的细项：自定义代理、助手/输入行为、CoreBox 个性化和需要授权的来源恢复。
- 不把权限、索引、Everything、更新过程、下载策略、存储状态、诊断和版本信息当作用户偏好；它们应由系统策略、按需任务或故障恢复入口负责。
- `auth.useSecureStorage` 和其覆盖/提醒/不可用字段属于必须移除的旧用户决策模型。
- `autoStart` 和 `startSilent` 目前在 `SettingSetup.vue` 与未挂载的 `SettingWindow.vue` 中重复；实施时只能保留一个所有权。

## 全量清单


| 域          | 当前选项或入口                                                              | 当前键/能力                                                                                                        | 建议处置          | 理由                                            |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------- |
| 账户         | 登录、登出、编辑资料                                                           | 认证动作                                                                                                          | 迁移到账户操作       | 是账户动作，不是设置。                                   |
| 账户         | 云同步启用                                                                | `sync.enabled`、`sync.userOverridden`                                                                          | 保留            | 涉及用户数据向远端同步，必须保留明确授权；默认值及同步范围另由同步产品契约确定。      |
| 账户         | 立即同步、同步运行状态                                                          | 同步任务                                                                                                          | 迁移到同步详情/失败恢复  | 操作和诊断不应长期占用总览设置。                              |
| 账户         | 登录凭证保护                                                               | `auth.useSecureStorage`、`secureStorageUserOverridden`、`secureStorageReminderShown`、`secureStorageUnavailable` | 系统默认          | 强制受保护持久化，无 UI、状态或用户覆盖；失败仅会话。                  |
| 账户         | 开发环境 API Server                                                      | 运行时 server mode                                                                                               | 仅开发者可见        | 仅在开发且未登录时出现。                                  |
| 语言         | 跟随系统                                                                 | `lang.followSystem`                                                                                           | 合并            | 并入一个“语言”选择器中的“跟随系统”值，移除独立开关。                  |
| 语言         | 选择语言                                                                 | `lang.locale`                                                                                                 | 保留            | 真实个人偏好，保留一个选择器。                               |
| 系统权限       | 辅助功能、完全磁盘访问、麦克风、通知、管理员权限                                             | OS permission transport                                                                                       | 按需入口          | 由首次使用相关能力时请求；设置只保留一个统一的“权限恢复”入口，不能将系统状态伪装成偏好。 |
| 启动         | 开机启动                                                                 | `setup.autoStart`                                                                                             | 保留            | 明确且长期的个人工作流选择。                                |
| 后台         | 显示托盘                                                                 | `setup.showTray`                                                                                              | 合并            | 与关闭/后台驻留收敛为一个“关闭后仍在后台运行”意图，避免相邻开关彼此矛盾。        |
| 后台         | 隐藏 Dock                                                              | `setup.hideDock`                                                                                              | 系统默认          | macOS 实现细节；由后台驻留策略派生。                         |
| 启动         | 静默启动                                                                 | `window.startSilent`                                                                                          | 合并            | 作为开机启动的从属策略，不独立暴露；移除与 `SettingWindow` 的重复入口。  |
| 插件         | 新装插件自动挂载首个功能                                                         | `omniPanel.autoMountFirstFeatureOnPluginInstall`                                                              | 系统默认          | 安装后发现策略，不应成为用户日常选择。                           |
| 应用索引       | 隐藏嘈杂系统应用                                                             | app-index settings                                                                                            | 系统默认          | 搜索质量过滤策略；不应要求用户理解系统应用噪声。                      |
| 平台实验       | 自定义桌面 / 以管理员身份运行                                                     | `setup.customDesktop`、`setup.runAsAdmin`                                                                      | 按需或高级入口      | 仅在特定 Linux/Windows 操作需要时请求，不能形成无消费者的普通开关。     |
| 工具         | CoreBox 自定义占位文字                                                      | `coreBox.customPlaceholder`                                                                                   | 迁移到高级入口       | 低频个性化，不占据常规设置；用户可主动调整。                            |
| 工具         | 使用指南、快捷键管理                                                           | 引导/快捷键动作                                                                                                      | 迁移到帮助或快捷键入口   | 非持久化偏好。                                       |
| 工具         | 鼠标长按、自动粘贴、自动清理、剪贴板轮询、低电量策略、自动隐藏                                      | `omniPanel.*`、`tools.*`                                                                                       | 高级入口 / 系统默认    | 鼠标长按、自动粘贴和自动隐藏可作为低频个人行为偏好；轮询、清理和节能策略仍由系统按平台/负载治理。 |
| 推荐         | 推荐启用、显示原因、最大数量、语义/上下文来源                                              | `recommendation.*`                                                                                            | 系统默认          | 排序/可解释性内部策略；需要时应在结果侧呈现，不要求用户调参。               |
| 助手         | 启用助手                                                                 | `assistant.enabled`                                                                                           | 保留            | 核心能力的明确总开关。                                   |
| 助手         | 悬浮球                                                                  | `floatingBall.enabled`                                                                                        | 合并            | 作为助手可达方式，合并入助手入口选择，不能与主开关形成无效组合。              |
| 助手         | 助手名称                                                                 | `assistant.name`                                                                                              | 删除            | 品牌和产品语言应一致，不提供个人改名。                           |
| 助手         | 语音唤醒、唤醒词                                                             | `voiceWake.*`                                                                                                 | 高级入口          | 仅在用户主动进入助手高级项时显示，并从该流请求麦克风；不常驻普通设置。       |
| 文件索引       | 索引状态、进度、错误、统计、最后检查、重建                                                | index SDK                                                                                                     | 迁移到故障恢复       | 状态和维护动作；平时无须用户选择。                             |
| 文件索引       | 来源诊断、书签授权/禁用/重建、来源维护                                                 | indexed-source SDK                                                                                            | 按需或高级入口      | 只在来源接入或失败时展示；书签授权是操作授权。                           |
| 文件索引       | 空闲阈值、充电允许、backfill/full-sync 与数值                                     | index/app-index SDK                                                                                           | 系统默认          | 资源调度参数，不能要求用户猜测。                              |
| Windows 搜索 | Everything 启用、状态刷新、安装/下载、CLI 路径、测试、证据导出                              | Everything SDK                                                                                                | 系统默认 + 故障恢复   | 后端选择、安装和诊断由系统管理；仅在搜索降级时给出“修复搜索”任务。            |
| 下载         | 并发、分块、重试、保留、超时、临时目录、清理/重置                                            | 下载配置 API                                                                                                      | 系统默认          | 网络/磁盘调度策略；清理动作迁移到下载中心。                        |
| 网络         | proxy mode、主机、端口、账号、密码、bypass                                        | 网络配置 API                                                                                                      | 高级入口          | 默认采用系统网络；用户主动打开高级设置，或在连接故障时进入明确的手动代理表单。 |
| 网络         | 重试、超时、退避、恢复默认                                                        | 网络配置 API                                                                                                      | 系统默认          | 传输策略不能成为普通用户调参表。                              |
| 更新         | 稳定/Beta 渠道                                                           | `UpdateSettings.updateChannel`                                                                                | 仅开发者可见        | 普通版本固定稳定渠道；预览渠道由测试/开发者明确选择。                   |
| 更新         | 检查频率、自动下载、退出时安装、renderer override、证据导出                               | update runtime API                                                                                            | 系统默认 / 仅开发者可见 | 正常更新采取统一后台策略；诊断/覆盖不暴露给普通用户。                   |
| 存储         | 存储占用入口、清理数据                                                          | 跳转/Privacy SDK                                                                                                | 迁移到数据管理       | 不是设置开关；保留独立的数据与隐私管理页。                         |
| 关于         | 版本、构建、许可、健康信息                                                        | 只读状态                                                                                                          | 迁移到关于         | 可保留为信息页，但不属于设置决策。                             |
| 开发         | developer mode、advanced settings、dashboard、search engine logs、Sentry | `dev.*` 等                                                                                                     | 仅开发者可见        | 这些项现在控制大量隐藏内容，必须从普通用户设置模型中彻底隔离。               |


## 配置所有者与平台适用性

除本节明确标注的平台项外，盘点表中的策略和偏好均适用于 macOS、Windows、Linux 三端；“按需入口”仍须在不支持的平台上完全隐藏或返回稳定的不可用结果。


| 选项域           | 配置/能力所有者                              | 平台                                                    |
| ------------- | ------------------------------------- | ----------------------------------------------------- |
| 账户同步、登录凭证     | `AuthModule`、同步偏好模块、main secure store | 三端                                                    |
| 语言            | renderer language settings            | 三端                                                    |
| 系统权限          | typed system permission transport     | 辅助功能/完整磁盘/通知为 macOS；管理员权限为 Windows；麦克风为 macOS/Windows |
| 启动、后台与托盘      | typed system settings SDK             | 三端；隐藏 Dock 仅 macOS                                    |
| 平台实验          | setup settings 与平台宿主                  | `customDesktop` 仅 Linux；`runAsAdmin` 仅 Windows        |
| CoreBox、工具、推荐 | renderer domain settings              | 三端                                                    |
| 助手、悬浮球、语音     | Assistant/FloatingBall/voice domain   | 三端，实际功能按平台能力门控                                        |
| 文件与应用索引       | indexed-source/app-index SDK          | 三端，书签/权限实现按平台分支                                       |
| Everything    | Everything settings SDK               | 仅 Windows                                             |
| 下载            | download configuration API            | 三端                                                    |
| 网络代理          | network configuration API             | 三端                                                    |
| 更新            | update runtime API                    | 三端，发布渠道仅开发/测试显式选择                                     |
| 数据管理与隐私       | Privacy SDK、storage owners            | 三端                                                    |
| 开发与诊断         | `dev.*`、Sentry、search diagnostics     | 开发构建/受控诊断环境                                           |


## 代码与依赖证据

- 新设置导航及九个分类页由 `apps/core-app/src/renderer/src/modules/settings/categories.ts` 与 `apps/core-app/src/renderer/src/base/router.ts` 共同定义。
- 账户设置实现与凭证保护开关位于 `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`；主进程对其持久化语义的处理位于 `apps/core-app/src/main/modules/auth/index.ts`。
- 受保护存储的实际后端、加密格式与文件权限处理位于 `apps/core-app/src/main/utils/secure-store.ts`。
- 平台权限及启动/后台项位于 `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`；重复的窗口项位于未挂载的 `SettingWindow.vue`。
- 工具、助手、文件索引、Everything、下载、网络、更新、关于分别由同名 `Setting*.vue` 组件拥有；新分类页将它们聚合到 `/setting/*`。

## 不应误判的项目

- `setup.fileAccessRootKey` 是由授权目录派生的授权一致性标记，不是登录加密密钥，也没有用户控件。
- `secure-store.ts` 的 `local-secret` 不是系统 Keychain；协议与库存文档必须保持这一事实，直到专门的后端升级任务完成。
- 存储、下载、插件市场、应用管理和智能中心的当前设置页入口多数是跳转动作，不能因出现在设置页就被视为待保留的“选项”。
