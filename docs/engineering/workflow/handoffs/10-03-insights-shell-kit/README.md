# 交接：10-03-insights-shell-kit

> 迁移前 Trellis 任务的无损交接副本（2026-10-03 切换到 Comet Native）。这里只保存证据，不是活动变更。恢复这项工作前，先读交接与证据，与用户确认范围和验收，核对现有 PRD、工程规格与真实运行证据，再与当前负责人确认交接。

| 项 | 值 |
| --- | --- |
| 标题 | 洞察页共享组件与语音页迁移 |
| 旧 id | `insights-shell-kit` |
| 冻结时状态 | `in_progress` |
| 处置 | 冻结（frozen） |
| 原路径 | `.trellis/tasks/10-03-insights-shell-kit/`（已退役，仅作来源记录） |
| 冻结记录 | [backlog.md#10-03-insights-shell-kit](../../backlog.md#10-03-insights-shell-kit) |
| 基线目录 | 基线提交 `cfda0a6cd` 中不存在该目录；本目录是唯一的仓库内副本 |

## 本目录保存的文件

以下文件在迁移时没有基线 Git 出处，已逐字节复制，sha256 与源文件一致。

| 文件 | 迁移时状态 | sha256 |
| --- | --- | --- |
| [check.jsonl](check.jsonl) | 未跟踪 | `23356ac458c85eefdaa118c5a30e67a1abd0df54eebdf87c2f22291f2f6821fe` |
| [design.md](design.md) | 未跟踪 | `162a58f44dafc813f8ebd84b8fa98accb45687dd047b4979cede20fbc604d7fa` |
| [evidence/README.md](evidence/README.md) | 未跟踪 | `fa8f5728866695915b9137814d952cbf869cede5887ec81cd76084676792523e` |
| [evidence/after-data.png](evidence/after-data.png) | 未跟踪 | `e5592c8da4cb2ad00f467edd87619ba0100fcd0d420c72bf00f0e8e36b08afc5` |
| [evidence/after-empty.png](evidence/after-empty.png) | 未跟踪 | `51f67c1a708f6984d808473213bf51b472e4353a94335c5ff0712d4586971bc8` |
| [evidence/after-menu.png](evidence/after-menu.png) | 未跟踪 | `d9a15de367a3f4097ea71762ee32083bf443001b36c6d8eb0a996b9f1459bff7` |
| [evidence/after-notices-460.png](evidence/after-notices-460.png) | 未跟踪 | `03bf788b0c2944197de27be0f1ec4bea9511e4e2b1c7af0816cadbffffd1bf02` |
| [evidence/after-notices-640.png](evidence/after-notices-640.png) | 未跟踪 | `cfee6c1cf6b6055595d831271d090ffe790cfbf5a48e269748428098684bbde7` |
| [evidence/after-notices.png](evidence/after-notices.png) | 未跟踪 | `530a13370effdba5b8522591095d612cddf251f25752ced0800a643c7c4b7d8a` |
| [evidence/before-data.png](evidence/before-data.png) | 未跟踪 | `5d2589c3d80385d1d8428f7ab50f327f880c1acbff0cef5277d3fb74be28cb0c` |
| [evidence/before-empty.png](evidence/before-empty.png) | 未跟踪 | `51f67c1a708f6984d808473213bf51b472e4353a94335c5ff0712d4586971bc8` |
| [evidence/before-menu.png](evidence/before-menu.png) | 未跟踪 | `e45cc0a5375392a153e0d0408dc500ac75ee3d57b88d4be1867fab0136fcc017` |
| [evidence/before-notices-460.png](evidence/before-notices-460.png) | 未跟踪 | `03bf788b0c2944197de27be0f1ec4bea9511e4e2b1c7af0816cadbffffd1bf02` |
| [evidence/before-notices-640.png](evidence/before-notices-640.png) | 未跟踪 | `cfee6c1cf6b6055595d831271d090ffe790cfbf5a48e269748428098684bbde7` |
| [evidence/before-notices.png](evidence/before-notices.png) | 未跟踪 | `530a13370effdba5b8522591095d612cddf251f25752ced0800a643c7c4b7d8a` |
| [evidence/diff-data.png](evidence/diff-data.png) | 未跟踪 | `c081e8138c17b7cca442a26a6023a2c79deb2ccf10ca5e53021e15c0ca03d804` |
| [evidence/diff-menu.png](evidence/diff-menu.png) | 未跟踪 | `50a3a3f5277a5a660e1ac5ce569ce39a24d443863449ebd02466d22460ee639b` |
| [evidence/geometry/after-data-1100.json](evidence/geometry/after-data-1100.json) | 未跟踪 | `6b4cd2310309b6102f0001453c2de684464e8bfa8532dd6a788a64afb8fad414` |
| [evidence/geometry/after-empty-1100.json](evidence/geometry/after-empty-1100.json) | 未跟踪 | `7a1a093d9c7359b12cc8a2e26c2a7e301092f579441988e6fd86d105e17d5b6b` |
| [evidence/geometry/after-menu-1100.json](evidence/geometry/after-menu-1100.json) | 未跟踪 | `8feef39fb2aedb14c2c02cafa7617159b344c3e828744a1575a89454d6b64185` |
| [evidence/geometry/after-notices-1100.json](evidence/geometry/after-notices-1100.json) | 未跟踪 | `6981ef604fa6d0843afd4d5e38012e2fccffc633bae4e71c4cd5e751a77f96d4` |
| [evidence/geometry/after-notices-460.json](evidence/geometry/after-notices-460.json) | 未跟踪 | `d26477aab3afd2f59b5ae05611b162005a9ac32c833d4ef93bbda4b607733ef2` |
| [evidence/geometry/after-notices-640.json](evidence/geometry/after-notices-640.json) | 未跟踪 | `37db215d1628dc5d68335f37cc8a0b664448f659a4d6857dfb766c63979517e1` |
| [evidence/geometry/before-data-1100.json](evidence/geometry/before-data-1100.json) | 未跟踪 | `6b4cd2310309b6102f0001453c2de684464e8bfa8532dd6a788a64afb8fad414` |
| [evidence/geometry/before-empty-1100.json](evidence/geometry/before-empty-1100.json) | 未跟踪 | `7a1a093d9c7359b12cc8a2e26c2a7e301092f579441988e6fd86d105e17d5b6b` |
| [evidence/geometry/before-menu-1100.json](evidence/geometry/before-menu-1100.json) | 未跟踪 | `8feef39fb2aedb14c2c02cafa7617159b344c3e828744a1575a89454d6b64185` |
| [evidence/geometry/before-notices-1100.json](evidence/geometry/before-notices-1100.json) | 未跟踪 | `6981ef604fa6d0843afd4d5e38012e2fccffc633bae4e71c4cd5e751a77f96d4` |
| [evidence/geometry/before-notices-460.json](evidence/geometry/before-notices-460.json) | 未跟踪 | `d26477aab3afd2f59b5ae05611b162005a9ac32c833d4ef93bbda4b607733ef2` |
| [evidence/geometry/before-notices-640.json](evidence/geometry/before-notices-640.json) | 未跟踪 | `37db215d1628dc5d68335f37cc8a0b664448f659a4d6857dfb766c63979517e1` |
| [evidence/harness/capture.sh](evidence/harness/capture.sh) | 未跟踪 | `3b3409d38f0c4af357b5438a339b2c52501c23ca2620cb80136ff1d550565d8a` |
| [evidence/harness/cdp.mjs](evidence/harness/cdp.mjs) | 未跟踪 | `c7d2b51e0b8f3e0f85a415fe10ec53b7964b30914e4a4fb39c956a930ab62b8f` |
| [evidence/harness/helpers.js](evidence/harness/helpers.js) | 未跟踪 | `362ce12de73a0274233ddbafbdc4d5d1e6f41ac85004d7d38411f7414e106a6c` |
| [evidence/harness/launch.sh](evidence/harness/launch.sh) | 未跟踪 | `9a7d56c672579b81fce252fabfd46c49ee4459022fcc5584e75c2792e954a574` |
| [evidence/harness/seed.sh](evidence/harness/seed.sh) | 未跟踪 | `410f0a2959df5b557c0d21c84d682e91ac78bb9ad6fb68c7c8a6604246c4ac53` |
| [evidence/region-report.txt](evidence/region-report.txt) | 未跟踪 | `ff5074bf4c098634202bffc68ced3a97d969a8c5dcf3ee280b212713869f94df` |
| [implement.jsonl](implement.jsonl) | 未跟踪 | `834db235ba31e0501fe16d5e82ada6a50c596e22d25dca657df80af2ce11c117` |
| [implement.md](implement.md) | 未跟踪 | `7f6d686d9dada779aa3f3f53a7806f7ce45948270c8e30a81fe5ce455b78e8b1` |
| [prd.md](prd.md) | 未跟踪 | `116c70e5c97d5e8848e68302ae8bdef4bd9d875035142d13e9c35a7a0bb2d86b` |
| [task.json](task.json) | 未跟踪 | `43e632adb0ee36b07bfc8eda02719aa18828ad7b687e24a76314c835139ff8a7` |
