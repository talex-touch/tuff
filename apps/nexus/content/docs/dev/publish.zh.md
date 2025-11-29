# 发布流程

## 准备
1. 更新版本号并写好 `CHANGELOG`。
2. 执行 `pnpm lint`、`pnpm utils:test` 确认无错误。
3. 在 Manifest 中校验权限、关键词与截图。

## 构建
```bash
pnpm build
```
- 产物位于 `dist/`，包含 `manifest.json`、`index.js`、资源文件与签名。
- 运行 `pnpm core:build:snapshot` 以验证在桌面端加载是否正常。

## 提交市场
1. 访问开发者后台，上传 `dist.zip`。
2. 填写版本描述、更新亮点、兼容 Workspace 列表。
3. 等待自动化测试（权限校验、性能、崩溃扫描）完成。

## 审核通过后
- 插件会自动推送到已关注的用户。
- 可选择“强制更新”或“可选更新”。

## 私有分发
- 企业可上传签名后的内部包，指定允许的组织 ID。
- 内部包仍享受版本管理与回滚能力。

## 故障排查
- 审核失败日志会显示在后台，附有链接到 `logs/review/<id>.txt`。
- 通过 `pnpm utils:publish --dry-run` 可以提前发现缺失字段。
