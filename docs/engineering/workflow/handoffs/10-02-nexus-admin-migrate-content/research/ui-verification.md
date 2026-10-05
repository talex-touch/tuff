# 内容运营三页 · ego 验收（2026-10-03）

- 环境：worktree `talex-touch-migrate-content`（detached `ee35ab869` + 本任务未提交改动），dev server `127.0.0.1:3205`，D1 为主检出开发库快照的副本，会话 `ui-audit-bot@local.test`（admin）。
- 浏览器：ego，TaskSpace 192（已关闭），时区 `America/Los_Angeles`（与本机一致，UTC-7）。
- 造数（只写 worktree 自己的本地存储）：
  - 经真实接口上传 65 张 PNG（`POST /api/images/upload`）、建 25 条要闻（`POST /api/dashboard/updates`）、25 条文档评论（`POST /api/docs/comments`）；
  - 插件评价接口要求插件存在，本地没有插件，因此停服后直接往 worktree D1 插入 25 条 `pending` 评价。
- 矩阵：三页 × 1280 / 1920 × 亮 / 暗 × 中 / 英，共 24 组，指标脚本与全部截图在 `/tmp/content-verify/`（本目录只留 5 张代表图）。

## 结果

| 项 | 结论 |
|---|---|
| 标题 = 侧栏文案 | 24/24 |
| 横向溢出（表格与文档） | 24/24 为 0 |
| 单元格折行 | 0 |
| 更新与要闻 | 每页 20 行、共 26 条、分页与每页条数可用；日期列只显示日期 |
| 资源库 | 首屏 60 张（1280 四列、1920 六列）；「加载更多」后 65 张，按钮消失，计数「已加载 60 个」→「共 65 个」；`/api/images/list` 无参仍返回 `{ images, total }` |
| 评论管理 · 切标签保留页码 | 插件第 2 页（`p_page=2`，5 行）→ 文档评论（`p_page=2` 保留，文档第 1 页 20 行）→ 文档第 2 页（`d_page=2`）→ 切回插件仍是第 2 页同一批 5 行；刷新后两边页码都在 |
| 评论管理 · 详情与确认 | 点行打开详情抽屉（`TxDescriptions`，完整正文换行），Esc 关闭；「通过」先弹确认（标题、作者、插件名、取消 / 通过），确认后共 25 → 24 条 |
| 删除确认 | 要闻删除、资源删除都先弹确认，取消后数据不变 |
| 新建要闻表单 | 12 个控件全部有可访问名称（两个下拉 `aria-labelledby`，其余 `<label for>`） |
| 作者首字母 | `[R] 评测员` → `R` |

## 验收中发现并已修复

1. **英文类型 / 范围徽标被硬切**：`Announcement` 徽标 99px，类型列 112px 的内容区只有 88px，显示为「Announcemen」。按真实字体测量，最长标签加内边距分别要 123px（`Announcement`）和 121px（`Web + System`），两列改为 128px，标题列在 1280 下剩 274px。修后两种语言都没有被截断的徽标。
2. **英文侧栏「Comment Managem…」被截断**：`menu.comments` 英文改为 `Comments`，页面标题随之一致；中文「评论管理」不变。`menu.reviews` 在修改前就没有引用，未动。
3. **手动要闻的日期在 UTC 以西早一天**：本机为 `America/Los_Angeles`，存为 `2026-09-26T00:00:00Z` 的条目按本地读是 9 月 25 日，列表显示 `2026-09-25`，与编辑表单（`slice(0, 10)` 读 UTC）不一致。
   - 组合件：`tableDate` / `date` 增加可选参数 `{ timeZone: 'UTC' }`，已登记 kit design §8 与父任务 §2.2。
   - 更新页：`isCalendarDayTimestamp`（恰为 UTC 零点）决定按 UTC 只显示日期，同步来的发布条目仍按本地显示完整时间（`updateDateLabels`）。
   - 修后列表、悬停提示与详情都是 9 月 26 日。
   - 测试按记录调用断言，与运行时区无关；负控：去掉这条规则后用例失败，恢复后逐字节一致。
4. **上传说明写了 SVG**：去掉。#896 的策略是不收 SVG；但服务端 `validateFile` 是「MIME 或扩展名任一匹配」，而 `image/*` 放行 `image/svg+xml`，所以上传层实际仍收 SVG，下载层强制以附件返回。这一点作为旁路问题报告，未在本任务修改。

## 门禁（修复后）

- vitest：263 个文件 / 2,033 条通过。
- typecheck：exit 0，0 个错误。
- ESLint：26 个改动文件 0 问题，用 `var` 探针做正控能报错。
- `git diff --check` 干净，9 个未跟踪文件无行尾空白、结尾有换行。
