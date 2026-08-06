# Chunk A 实施报告(freshness-chunk-A,2026-08-06)

A1-A3 完成,门禁全绿:addon/apps 20 文件 202 测试绿;整棵 box-tool 152 文件 1213 测试绿;
`typecheck:node` 零错误(含 Chunk B 并发落盘后复跑);目录内 ESLint 干净。

## 落地要点

- `app-types.ts`:`ScannedAppInfo.createdAt?: Date` + 契约校验 `resolveScannedAppCreatedAt(stats)`
  (birthtime 存在 && >0 && ≤ now+24h)。
- darwin/linux/win 三扫描器填 createdAt;win 覆盖 registry / App Paths / Start Menu,
  shortcut→UWP 透传快捷方式 birthtime,且**取 source(快捷方式)而非 target(exe)的 birthtime**
  ——就地更新换 exe 通常不动开始菜单快捷方式,更抗「更新误判为新装」。
- `app-provider.ts`:`APP_INSTALLED_AT_EXTENSION_KEY`、`AppDiscoveryKind`、
  `insertMissingAppExtensions`(**ON CONFLICT (file_id, key) DO NOTHING**)——「永不覆盖」由
  写入层保证,不依赖调用方传的 extension map(批量 upsert 的 UPDATE 分支传 EMPTY map 的陷阱
  被此化解);`handleIndexedSourceWatchEvent` 传 discovery='watch'。
- 陈旧键清扫无需豁免:清扫集只来自 `APP_SCANNED_OPTIONAL_EXTENSION_KEYS`,`installedAt`
  不在其中,已有测试钉死。

## installedAt 最终语义(与 design §1 一致,B 读侧已核对接上)

主库 `file_extensions`,key=`installedAt`,值=`String(Date.getTime())` 正整数字符串;写一次永不刷新。
createdAt 有效 → 任何路径都写;无效 → 仅 watch 且确实新插 files 行时写 now;全量扫描无 birthtime → 不写。

## 相邻缺口(按范围纪律仅记录,均不阻塞验收;处理与否待定)

1. 解析重试阶梯 / 死信清扫重入 `processAppPath` 不带 discovery(默认 'scan')→ Linux 等无
   birthtime 平台上「watch 发现但首次解析失败」的应用丢掉 now 回退。`AppResolutionRetryEntry`
   已存 managedEntry,补 discovery 约四行。
2. 手动添加条目(`addAppByPath`,managedEntry)走 `buildManagedEntryExtensions`,绕开
   syncScannedAppExtensions,拿不到 installedAt(设计未覆盖)。
3. `steam-provider.ts` 硬编码 `lastModified: new Date(0)` 且不产出 createdAt,Steam 应用只能靠
   watch 回退拿时间。
4. 经 Get-StartApps 发现、无开始菜单文件的纯 UWP 应用无 createdAt。

## 测试侧顺带修复

4 个既有 db double 缺 `onConflictDoNothing`:2 个直接失败,2 个把 TypeError 吞进 processAppPath
的 catch(仅 stderr 可见)——已修;并以 `toHaveBeenCalledWith(path, { discovery: 'watch' })`
钉住 watch 接线。
