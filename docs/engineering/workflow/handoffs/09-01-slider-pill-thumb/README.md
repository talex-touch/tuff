# 交接：09-01-slider-pill-thumb

> 迁移前 Trellis 任务的无损交接副本（2026-10-03 切换到 Comet Native）。这里只保存证据，不是活动变更。恢复这项工作前，先读交接与证据，与用户确认范围和验收，核对现有 PRD、工程规格与真实运行证据，再与当前负责人确认交接。

| 项 | 值 |
| --- | --- |
| 标题 | slider 拖钮改为 Radio 指示条式胶囊，按下回弹收敛 |
| 旧 id | `slider-pill-thumb` |
| 冻结时状态 | `completed` |
| 处置 | 历史（historical，已归档） |
| 原路径 | `.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/`（已退役，仅作来源记录） |
| 基线目录 | [`cfda0a6cd` 上的原目录](https://github.com/talex-touch/tuff/tree/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb) |

## 本目录保存的文件

以下文件在迁移时没有基线 Git 出处，已逐字节复制，sha256 与源文件一致。

| 文件 | 迁移时状态 | sha256 |
| --- | --- | --- |
| `research/after/dark/demos/metrics.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `*.log` 忽略，仅本机保存 | `56482e1ee2dcf9c4a86066cb504a357cd1f974435fdb638ca9051e2afe86b90b` |
| `research/after/dark/metrics.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `*.log` 忽略，仅本机保存 | `098e3bd55071e8d6520a22e2046ae96452f1372ffe79ecdd106b6deb829f396b` |
| `research/after/light/demos/metrics.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `*.log` 忽略，仅本机保存 | `56482e1ee2dcf9c4a86066cb504a357cd1f974435fdb638ca9051e2afe86b90b` |
| `research/after/light/metrics.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `*.log` 忽略，仅本机保存 | `13baf0fa5913810d14840b218ea196418230dda9dd812b6e6fcf9cdbfe9fd0b0` |
| `research/after/reduced-motion.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `*.log` 忽略，仅本机保存 | `b809f300d9710f911d7d364abfd70e691797d185d6697e300e194171c8997ecf` |
| `research/logs/audit-size.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `a119e887b36ebe43034a8fcdc372c3ea46f0e1ab667da3cb601ea9c1eae44148` |
| `research/logs/chain.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `97920e1752cbcf48506c15e542573db75f238da7137b8fb2c5a125470a5b4957` |
| `research/logs/coreapp-node.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `research/logs/coreapp-web.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `research/logs/gate-fences.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `research/logs/gate-orphans.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `8f6026c570421dba0f67b3288b21738bcb27baed97a621f8e747433898a1cabc` |
| `research/logs/gate-parity.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `research/logs/harness.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `67be6877635247ede0199cca07179f33fe29f1e1a4bbc6d764f7611c301edf98` |
| `research/logs/nexus-typecheck-direct.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `b071fe142baf891e19a94690f01adacb79f0333cb104fdad972dbcd0bc99d539` |
| `research/logs/nexus-typecheck-probe.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `47b384464f1d3b7845e9e7d9d3843d5f372e1a5f0d24e5645f8fb6f189c55cfc` |
| `research/logs/test-final.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `1bf6da7a585903cfd4ed7c504f83566c4674b77b13185692fa7e0e9808531751` |
| `research/logs/tuffex-all-tests.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `77fb4ed0bf61c874fb143e31fe6a1d9d65b4b58720c0b2d6b69a3c01b20ebe85` |
| `research/logs/tuffex-typecheck-probe.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `4c54deb508a4f2d98cd672a6f06bc1bb88bfca87e784e9ea033bad4bb3dfacb7` |
| `research/logs/tuffex-typecheck.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `logs/` 忽略，仅本机保存 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `research/test-green.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `*.log` 忽略，仅本机保存 | `6d5b26b9cc728a541179f58fe6747e8d728cf8e455da015ee8b2bf04f0b9131a` |
| `research/test-red.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `*.log` 忽略，仅本机保存 | `d9f1606abfdd3224470d3080cf039e89a58f5ebaca7f7177cdea622814b49a11` |
| `research/tuffex-build.log` | 基线时即被 `.gitignore` 忽略；在本目录仍被 `*.log` 忽略，仅本机保存 | `fe75d95eed9c321f9018b8e5e7fd1527c178ceacffb3c8438db04c782ca8ac3a` |

## 未复制的文件

以下文件与基线提交 `cfda0a6cd` 完全一致，直接从基线链接读取。

| 文件 | 基线 |
| --- | --- |
| `check.jsonl` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/check.jsonl) |
| `design.md` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/design.md) |
| `implement.jsonl` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/implement.jsonl) |
| `implement.md` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/implement.md) |
| `prd.md` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/prd.md) |
| `research/after/dark/demos/demo-0-drag.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/demos/demo-0-drag.png) |
| `research/after/dark/demos/demo-0.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/demos/demo-0.png) |
| `research/after/dark/demos/demo-1.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/demos/demo-1.png) |
| `research/after/dark/demos/demo-2.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/demos/demo-2.png) |
| `research/after/dark/demos/demo-3.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/demos/demo-3.png) |
| `research/after/dark/radio-rest.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/radio-rest.png) |
| `research/after/dark/side-by-side.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/side-by-side.png) |
| `research/after/dark/slider-drag-max.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/slider-drag-max.png) |
| `research/after/dark/slider-drag-min.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/slider-drag-min.png) |
| `research/after/dark/slider-drag.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/slider-drag.png) |
| `research/after/dark/slider-flat-path-simulated.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/slider-flat-path-simulated.png) |
| `research/after/dark/slider-focus.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/slider-focus.png) |
| `research/after/dark/slider-hover.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/slider-hover.png) |
| `research/after/dark/slider-press-120ms.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/slider-press-120ms.png) |
| `research/after/dark/slider-rest.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/dark/slider-rest.png) |
| `research/after/harness/harness-dark.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/harness/harness-dark.png) |
| `research/after/harness/harness-light.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/harness/harness-light.png) |
| `research/after/light/demos/demo-0-drag.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/demos/demo-0-drag.png) |
| `research/after/light/demos/demo-0.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/demos/demo-0.png) |
| `research/after/light/demos/demo-1.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/demos/demo-1.png) |
| `research/after/light/demos/demo-2.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/demos/demo-2.png) |
| `research/after/light/demos/demo-3.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/demos/demo-3.png) |
| `research/after/light/radio-rest.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/radio-rest.png) |
| `research/after/light/side-by-side.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/side-by-side.png) |
| `research/after/light/slider-drag-max.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/slider-drag-max.png) |
| `research/after/light/slider-drag-min.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/slider-drag-min.png) |
| `research/after/light/slider-drag.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/slider-drag.png) |
| `research/after/light/slider-focus.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/slider-focus.png) |
| `research/after/light/slider-hover.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/slider-hover.png) |
| `research/after/light/slider-press-120ms.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/slider-press-120ms.png) |
| `research/after/light/slider-rest.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/after/light/slider-rest.png) |
| `research/before/dark/radio-rest.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/dark/radio-rest.png) |
| `research/before/dark/slider-drag-max.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/dark/slider-drag-max.png) |
| `research/before/dark/slider-drag-min.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/dark/slider-drag-min.png) |
| `research/before/dark/slider-drag.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/dark/slider-drag.png) |
| `research/before/dark/slider-focus.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/dark/slider-focus.png) |
| `research/before/dark/slider-hover.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/dark/slider-hover.png) |
| `research/before/dark/slider-press-120ms.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/dark/slider-press-120ms.png) |
| `research/before/dark/slider-rest.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/dark/slider-rest.png) |
| `research/before/light/radio-rest.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/light/radio-rest.png) |
| `research/before/light/slider-drag-max.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/light/slider-drag-max.png) |
| `research/before/light/slider-drag-min.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/light/slider-drag-min.png) |
| `research/before/light/slider-drag.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/light/slider-drag.png) |
| `research/before/light/slider-focus.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/light/slider-focus.png) |
| `research/before/light/slider-hover.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/light/slider-hover.png) |
| `research/before/light/slider-press-120ms.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/light/slider-press-120ms.png) |
| `research/before/light/slider-rest.png` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/before/light/slider-rest.png) |
| `research/compose.mjs` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/compose.mjs) |
| `research/demos.mjs` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/demos.mjs) |
| `research/harness.mjs` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/harness.mjs) |
| `research/hover.mjs` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/hover.mjs) |
| `research/measurements.md` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/measurements.md) |
| `research/reduced.mjs` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/reduced.mjs) |
| `research/shoot.mjs` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/shoot.mjs) |
| `research/spring-probe.mjs` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/spring-probe.mjs) |
| `research/spring-reversals.mjs` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/research/spring-reversals.mjs) |
| `task.json` | [blob](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-09/09-01-slider-pill-thumb/task.json) |
