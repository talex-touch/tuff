# 执行计划：剪贴板识别 SSH 与主机端点

按「先解耦、再识别、后展示」推进。第 1 步是其余全部的前置：在保留期解耦之前加任何 `host-ip` 命中，都会立刻让含 IP 的记录变成永不删除。

## 第 1 步 · 解耦掩码与保留期（前置）

- [ ] `content-classifier.ts` 加 `RETENTION_PROTECTING_KINDS`，列全现有七个 kind
- [ ] `retentionClass` 改由 `secrets.some(hit => RETENTION_PROTECTING_KINDS.has(hit.kind))` 推导
- [ ] `ClipboardSecretKind` 上补注释：它表达「要掩码的敏感片段」，不等于「凭据」
- [ ] 测试：现有七个 kind 每一个仍产出 `retentionClass: 'secret'`

**这一步必须零行为变化。** 验证方式不是「测试还是绿的」，而是：

```bash
cd packages/utils && ../../node_modules/.bin/vitest run __tests__/clipboard-content-classifier.test.ts
cd apps/core-app && ../../node_modules/.bin/vitest run src/main/modules/clipboard
```

**负控制**：从集合里删掉 `'api-key'`，`clipboard-retention-backfill` 与采集管线的用例必须变红。若不红，说明保留期根本没有被测到，先补测试再继续。

## 第 2 步 · 识别规则（纯函数，先于任何 UI）

- [ ] IPv4：私有段直接认；公网段需上下文（`user@` / `:port` / ssh 系命令 / 整条即是它）
- [ ] IPv6：仅 `[…]:port` 括号端点形式
- [ ] 端口：`host:port`、`-p|-P port`、`Port <n>`；范围 1–65535；**裸数字不产生端口**
- [ ] `user@host`
- [ ] SSH 公钥：算法前缀 + base64(≥32) + 可选注释；**不产出 secret 命中**
- [ ] `host-ip` 命中排在扫描顺序最末（连接串里的 IP 要归连接串）
- [ ] `ClipboardSshEndpoint` / `ClipboardSshPublicKey` 接入 `ClipboardClassification`

每条规则配一正一反用例。**逐条注入验证**：拆掉该规则本身，只有它对应的用例变红（AC10）。

必须显式覆盖的对抗样例：

| 输入 | 期望 |
|---|---|
| `8080` | 不是端口 |
| `123456` | 仍只是验证码候选，不是端口 |
| `1.2.3.4`（散文中） | 不是主机 |
| `1.2.3.4`（整条内容） | 是主机 |
| `10.0.3.14`（散文中） | 是主机（私有段） |
| `999.1.1.1` | 不是 IP |
| `postgres://u:p@10.0.0.1:5432/db` | 归 `connection-string`，**不**拆出 host-ip |
| `ssh-rsa` 出现在散文里 | 不是公钥 |
| `ssh deploy@build.example.com` | 是端点，`hostIsIp: false`，不掩码 |

## 第 3 步 · 设置

- [ ] `ClipboardClassificationSettings` 加 `maskHostIp`，默认 `true`
- [ ] 逐字段校验：非布尔值退默认，不让整块配置失效
- [ ] 测试：关掉之后识别与拆行不变，只有掩码消失（AC8）

## 第 4 步 · 插件展示

- [ ] `ClipboardShape` 加 `ssh`；列表图标与分类 chip
- [ ] `ClipboardInsightKind` 加 `ssh`；`selectClipboardInsight` 里排在 `command` 之前、`secret` 之后
- [ ] 详情 `.kv-row`：用户 / 主机 / 端口 / 算法 / 注释，逐行可复制
- [ ] IP 行接 `revealSecret` 揭示交互；复制写完整值
- [ ] `files` 记录的 SSH 路径识别（插件侧，分类器不处理 files）

**注意**：`ClipboardInsight.vue` 的 OCR 分支刚被移走（`c9f42a721`），新分支照它留下的结构写，不要复活 OCR。

## 第 5 步 · 验证

```bash
cd packages/utils && ../../node_modules/.bin/vitest run
cd apps/core-app && ../../node_modules/.bin/vitest run src/main/modules/clipboard
cd apps/core-app && ../../node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false
cd plugins/clipboard-history && ../../node_modules/.bin/vitest run && ./node_modules/.bin/vue-tsc --noEmit
cd packages/test && ../../node_modules/.bin/vitest run
```

lint 用**包内**配置，判 delta 不判零：

```bash
cd packages/utils && ../../node_modules/.bin/eslint --no-warn-ignored clipboard/
cd apps/core-app && ../../node_modules/.bin/eslint --no-warn-ignored src/main/modules/clipboard/
cd plugins/clipboard-history && ../../node_modules/.bin/eslint --no-warn-ignored src/
```

`tsc` 目前因另一会话在写的 ASR 代码而红（`intelligence-admin-surface-boundary.test.ts`、voice 套件 3 条）。**先记录基线**，只判本任务引入的增量，不要试图收掉别人的红。

## 审查门

- 第 1 步做完立刻停下来验证零行为变化，再进第 2 步。保留期回归不会自己冒出来，只会在几周后表现为「历史怎么删不掉」。
- 第 2 步全部规则完成后统一做注入验证，一次性确认没有假绿。

## 回滚点

- 第 1 步后：单独可 revert，且本就是零行为变化。
- 第 2/3/4 步后：均无 schema 与迁移，单个 revert 即回到当前行为。

## 并发注意

`packages/utils/clipboard/` 与 `plugins/clipboard-history/` 目前是本会话独占；`apps/core-app/src/main/modules/clipboard/` 也干净。但 `apps/core-app` 整体有另外两个会话在写（voice/ASR、nexus 计费）。提交前 `git diff --cached --name-only` 必须为空再 `git add`，且**只列文件名，不用目录**。
