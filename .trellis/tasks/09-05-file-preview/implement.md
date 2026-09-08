# C5 执行计划 · 文件预览

## 状态：设计完成，实现未开始（有意为之）

C5 的 PRD 与父任务集成计划都要求 R1 独立成 PR、独立安全评审。摸清接线后确认它要动
**10 个文件、跨 2 个包**，并新增一条出现在用户权限界面的权限位，落在 #914 修过的边界上。
当前分支 `feature/clipboard-layout-shell` 已承载 C1–C4 四个纯渲染层改动，
不能让 UI 重排的 review 顺带批准文件读取能力。

**下一步：从 master 另起分支实现 R1。** 链路与约束见 `design.md`，逐文件行号已确认。

## 阶段 A · 主进程能力（独立分支 + 独立 PR）

- [ ] 从 `master` 切 `feature/clipboard-preview-capability`
- [ ] 按 design.md §1 的十步接线
- [ ] 按 design.md §2 实现约束：无 path 参数、库内反查、先 stat 后读、上限拦截
- [ ] 五条负向测试全绿（design.md §2 表格）
- [ ] `grep` 断言 `previewClipboardFile` 的签名里**不存在** path 参数
- [ ] 安全评审通过后再合

验证命令（core-app 走它自己的配置，别用插件包的）：

```bash
pnpm --filter @talex-touch/core-app test -- clipboard
pnpm --filter @talex-touch/core-app typecheck
```

## 阶段 B · 预览接管 UI（A 合入后）

- [ ] `ClipboardManagerView` 接住 C1 已经在发的 `previewFile` 事件
- [ ] 预览区切接管态：返回条 + `Esc` / `←` 退回并保留滚动位置与选中行
- [ ] 状态机覆盖 10 态（PRD R3b）：未展开 / 加载中 / 完成 / 部分加载 / 超大 /
      空文件 / 解析失败 / 密码保护 / 无权限 / 文件已不存在

## 阶段 C · 渲染器分批

- [ ] P0：图片（复用 C3 的主题色）/ 纯文本 / Markdown
- [ ] P1：代码高亮 / JSON / YAML / CSV
- [ ] P2：PDF（Chromium 内置，不引第三方）/ 3D / SVG（禁脚本）/ 压缩包
- [ ] P3：字体 / 音视频 / 表格文档 / 演示文档 / 电子书 / 磁盘映像 / 证书（只出元信息）

每批开工前评估依赖体积；语法高亮与 three.js 必须动态 import，
`vite build` 后**对比 chunk 清单**确认没进主 chunk（不看总体积）。

## 已经就位的部分（C1 产出，无需重做）

- 文件树按目录分组、目录可折叠
- 每行的 👁 按钮与 `previewFile` 事件
- `.preview-surface[data-kind='files'] { max-height: 60% }` 高度契约
