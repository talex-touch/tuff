# Tuff v2.4.14-beta.45 更新说明

## 摘要

- 首启向导不再把「跟随系统」当成用户已经做出的选择：在英文 macOS 上默认答简体中文，这一步也用它在问的语言显示，从语言列表返回不再顺手把偏好改回「跟随系统」，末页那行快捷键冲突提示也一并移除。
- 两个流程问同一个插件的权限时只弹一张卡，而这张卡的身份从**文案**换成「插件 id ＋ 权限集合」：显示名相同的另一个插件再也拿不到用户为前者做出的答复。
- 安装的传输超时不再是一刀切的 3 分钟：它改为「下载预算 ＋ 权限确认 120 秒 ＋ 解包校验注册 60 秒」之和，于是不会在用户还在读权限卡时报「安装失败」，也不会因为 14 MB 的包在普通带宽上超过 30 秒就报 `NETWORK_TIMEOUT`。
- `plugin:api:install` 事件同样改用这套推导出来的预算，两个安装事件的期限来源补齐进通道契约文档。
- Home 的助手推荐改为显式开启：设置新增 `homeRecommendations`，默认关闭，只有明确打开才显示开场问候与建议卡，历史配置一律读作关闭。

## 变更内容

- 首启语言：向导用 `BOOT_LANGUAGE_PREFERENCE`（产品默认 `zh-CN`）作答，而不是把系统语言当成用户的选择——设置里「没选过」与「选了跟随系统」逐字相同，所以用 `beginner.init` 这个「首启是否走完」的持久标志区分；已经选过语言的用户重开向导仍从自己的选择开始。卡片显示将要应用的语言，`跟随系统` 标签只在该答案确实是系统语言时出现；新增 `previewPendingLanguage()` 让这一步用答案语言渲染（从列表挑选本来就会即时切换界面，否则首启在英文系统上会是「英文文案 ＋ 中文答案」）；从列表返回只关闭列表，旧实现会在这里调用 `setFollowSystemLanguage(true)` 偷偷改写用户偏好。
- 向导末页：移除那行快捷键冲突提示（`beginner.done.shortcut.conflictHint`）——元素与样式、两条语言条目、钉住它的用例，以及全局快捷键契约里的引用一并清掉，契约文档记录这次移除。
- 权限卡：同一插件的同一次提问只弹一张卡（安装确认与启用时的门禁分别经不同通道抵达，此前各弹一张、各自倒计时，答完一张另一张还立着）。合并键由 `title\0message` 换成 `permissionRequestIdentity(pluginId, permissionIds)`（权限集合去重排序，与顺序无关）：两个提问方本来就问同一个插件 id 与同一套 `missing.required`（`plugin-module.ts` 与 `plugin-permission-gate.ts` 各自用 `getMissingPermissions` 算），所以合并仍然命中，同时不再受两边显示名不一致的影响（安装侧取 `clientMetadata.pluginName`，门禁侧取 manifest 的 `name`）。旧写法下，显示名相同的另一个插件会读到用户为前者做出的答复，而门禁正是拿这条答复去给 `request.pluginId` 放行。
- 安装预算：新增 `packages/utils/plugin/install-budgets.ts` 作为唯一来源——下载预算按注册表公布的大小、以 50 KB/s 的悲观速率换算，30 秒下限、10 分钟上限；权限确认预算 120 秒（渲染层的权限卡到点自动拒绝，因此这也是主进程等待用户的上界）；解包、签名校验与注册 60 秒；`plugin:install-source` 的传输期限取其和。原先固定 3 分钟会在用户还在读权限卡时先到点，把一次 14 MB 下载已经成功的安装报成「安装失败」；各 provider 不再各自持有自己的那份常量。
- Home 推荐：`app-settings` 新增 `homeRecommendations`，默认 `false`（Beta）——空 Home 会话不再默认显示开场问候与建议卡，只有显式打开才显示，键不存在的历史配置读作关闭；`HomePage.vue` 与「设置 · 插件与工具」随之接线，`SettingTools.home-recommendations.test.ts` 覆盖这条开关。
- 通道：本 beta 先把 `origin/master` 合进 `stage` 再切版，上面这些改动随本次构建进入测试通道，`master` 不再跑在测试者构建之前。
