# 利用 GitHub 实现发布日志与 AI 评审自动化

本文档提供一个基于 GitHub 平台的思路，帮助你把 PR 模板里关于「包含更新日志」与「AI 评审」的选项真正落地成自动化流程。所有示例均以仓库已有的 CI 体系为例，可按需调整。

## 总体策略

1. **结构化 PR 信息**：继续使用模板中约定的「☑」符号，自动化脚本通过正则表达式即可判断用户是否勾选。
2. **触发 GitHub Actions**：借助 `pull_request_target` 或 `pull_request` 事件，在 PR 打开 / 更新时运行脚本解析勾选状态。
3. **根据勾选结果执行后续动作**：
   - 勾选「需要写入 Release」时，将 PR 信息写入 Release 草稿或专用 changelog 文件。
   - 勾选「需要 AI 分析」时，调用第三方模型（例如 OpenAI、Azure OpenAI、Moonshot 等）生成评审结果并以评论形式反馈。

本仓库已经按上述思路准备好了一整套工作流，开箱即可使用：

- `.github/workflows/pr-flags.yml`：读取 PR 模板并自动同步 `needs-release-note`、`needs-ai-review` 标签（缺失时会自动创建标签）。
- `.github/workflows/release-drafter.yml` + `.github/release-drafter.yml`：仅将带有 `needs-release-note` 标签的 PR 写入 Release 草稿。
- `.github/workflows/ai-review.yml`：当作者勾选 AI 分析时调用 `scripts/ci/ai-review.mjs` 生成「AI 评审结果」评论。
- `.github/workflows/pr-translation.yml`：自动识别 PR 描述的主要语种并在评论区附上目标语言翻译，实现中英文双语可读。

启用前别忘了在仓库或组织级别配置文末列出的 Secrets / Variables。

## 自动维护 Release Notes

### 1. 配置 Release Drafter（推荐）

GitHub 官方维护的 [release-drafter](https://github.com/release-drafter/release-drafter) Action 可以自动把合并的 PR 整理进 Release 草稿。示例工作流：

```yaml
# .github/workflows/release-drafter.yml
name: Update release draft

on:
  push:
    branches:
      - main
  pull_request_target:
    types:
      - closed

permissions:
  contents: write
  pull-requests: read

jobs:
  update-release-draft:
    if: github.event_name == 'push' || (github.event_name == 'pull_request_target' && github.event.pull_request.merged == true)
    runs-on: ubuntu-latest
    steps:
      - uses: release-drafter/release-drafter@v6
        with:
          config-name: release-drafter.yml
```

Release Drafter 的行为由 `.github/release-drafter.yml` 控制。配置里通过 `filter-by-labels.include: [needs-release-note]` 保证只有明确勾选「需要写入 Release」的 PR 才会进入草稿；同时可以结合 `categories`、`change-template` 等字段自定义展示效果。

### 2. 基于 PR 模板的自定义解析

```yaml
# .github/workflows/pr-flags.yml
name: Parse PR template flags

on:
  pull_request_target:
    types:
      - opened
      - edited
      - reopened
      - ready_for_review
      - synchronize

permissions:
  pull-requests: write
  issues: write
  contents: read

jobs:
  apply-labels:
    runs-on: ubuntu-latest
    steps:
      - name: Sync labels based on PR template
        uses: actions/github-script@v7
        with:
          script: |
            const body = github.event.pull_request.body || '';
            const needRelease = /☑\s*需要将此 PR 的提交包含进下一次 Release 更新日志/.test(body);
            const needAi = /☑\s*需要触发 AI 对此 PR 的自动分析/.test(body);

            const labelDefinitions = [
              {
                name: 'needs-release-note',
                color: '1d76db',
                description: 'PR 请求写入下一版 Release Notes',
                wanted: needRelease,
              },
              {
                name: 'needs-ai-review',
                color: 'a371f7',
                description: 'PR 请求触发 AI 自动评审',
                wanted: needAi,
              },
            ];

            async function ensureLabel(label) {
              try {
                await github.rest.issues.getLabel({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  name: label.name,
                });
              } catch (error) {
                if (error.status !== 404) throw error;
                await github.rest.issues.createLabel({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  name: label.name,
                  color: label.color,
                  description: label.description,
                });
              }
            }

            const { data: existingLabels } = await github.rest.issues.listLabelsOnIssue({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: github.event.pull_request.number,
            });

            for (const label of labelDefinitions) {
              const hasLabel = existingLabels.some(item => item.name === label.name);

              if (label.wanted && !hasLabel) {
                await ensureLabel(label);
                await github.rest.issues.addLabels({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: github.event.pull_request.number,
                  labels: [label.name],
                });
              }

              if (!label.wanted && hasLabel) {
                await github.rest.issues.removeLabel({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: github.event.pull_request.number,
                  name: label.name,
                }).catch(error => {
                  if (error.status !== 404) throw error;
                });
              }
            }
```

有了 `needs-release-note` 标签后，你可以：

- 在合并后追加一个工作流，把 PR 标题与 Release Notes 段落写进 `CHANGELOG.md`。
- 或在 Release Drafter 的模板里限定只有包含该标签的 PR 才被加入草稿。

### 3. 合并后写入 changelog（可选）

```yaml
# .github/workflows/release-changelog.yml
name: Append changelog entry

on:
  pull_request_target:
    types: [closed]

permissions:
  contents: write
  pull-requests: read

jobs:
  append-changelog:
    if: github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'needs-release-note')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      - name: 追加 changelog
        run: |
          node scripts/ci/append-changelog.mjs \
            --pr "${{ github.event.pull_request.number }}" \
            --title "${{ github.event.pull_request.title }}" \
            --body "${{ github.event.pull_request.body }}"
      - name: 推送更新
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -am "chore: update changelog for #${{ github.event.pull_request.number }}" || echo "no changes"
          git push
```

> 提示：上述示例仅作为参考，仓库默认并未提供 `scripts/ci/append-changelog.mjs`。如需同步更新仓库内的 `CHANGELOG.md`，请按需自定义脚本并调整工作流。

## AI 评审 / 分析

### 1. 准备模型凭证

在仓库或组织级别的 Secrets / Variables 中至少配置以下内容（Secrets 可在 `Actions secrets and variables > Secrets` 中新增，Variables 位于同一页面的 `Variables` 页签）：

- `AI_REVIEW_API_KEY`（Secret，必填）：OpenAI 兼容服务的 API Key，同时供 AI 评审与 PR 翻译共用。
- `AI_REVIEW_API_BASE`（Secret，可选）：OpenAI 兼容服务的基础 URL，结尾可带或不带 `/v1`。
- `AI_REVIEW_COMPLETIONS_PATH`（Secret，可选）：当接口路径不是默认的 `/chat/completions` 时设置，例如 Azure OpenAI 可填写 `/openai/deployments/<deployment>/chat/completions?api-version=2024-02-15-preview`。
- `AI_REVIEW_MODEL`（Variable，可选）：默认模型名称，默认为 `gpt-4o-mini`，PR 翻译流程在未单独指定时同样回退到该值。
- `AI_REVIEW_TEMPERATURE`、`AI_REVIEW_MAX_OUTPUT_TOKENS`、`AI_REVIEW_PATCH_CHARACTER_LIMIT`（Variable，可选）：调整生成风格及 diff 截断长度。
- `AI_REVIEW_ALLOWED_ASSOCIATIONS`（Variable，可选）：允许触发 AI 评审的 `author_association` 列表，逗号分隔。默认仅允许 `MEMBER,OWNER,COLLABORATOR`，如需覆盖到外部贡献者可设置为 `MEMBER,OWNER,COLLABORATOR,CONTRIBUTOR` 或 `*`。
- `PR_TRANSLATION_MODEL`、`PR_TRANSLATION_TEMPERATURE`、`PR_TRANSLATION_MAX_OUTPUT_TOKENS`（Variable，可选）：若希望翻译与评审使用不同的模型或采样参数，可通过这些变量覆盖。

### 2. 工作流示例

仓库已提供完整工作流（见 `.github/workflows/ai-review.yml`），以下节选展示关键步骤：

```yaml
# .github/workflows/ai-review.yml（节选）
on:
  pull_request_target:
    types:
      - opened
      - reopened
      - ready_for_review
      - synchronize
      - edited

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.base.ref }}
      - name: Run AI review script
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.AI_REVIEW_API_KEY }}
          OPENAI_BASE_URL: ${{ secrets.AI_REVIEW_API_BASE }}
          OPENAI_COMPLETIONS_PATH: ${{ secrets.AI_REVIEW_COMPLETIONS_PATH }}
          AI_REVIEW_MODEL: ${{ vars.AI_REVIEW_MODEL }}
          AI_REVIEW_TEMPERATURE: ${{ vars.AI_REVIEW_TEMPERATURE }}
          AI_REVIEW_MAX_OUTPUT_TOKENS: ${{ vars.AI_REVIEW_MAX_OUTPUT_TOKENS }}
          AI_REVIEW_ALLOWED_ASSOCIATIONS: ${{ vars.AI_REVIEW_ALLOWED_ASSOCIATIONS }}
          AI_REVIEW_PATCH_CHARACTER_LIMIT: ${{ vars.AI_REVIEW_PATCH_CHARACTER_LIMIT }}
        run: node scripts/ci/ai-review.mjs "$GITHUB_EVENT_PATH"
```

`scripts/ci/ai-review.mjs` 会：

1. 检查 PR 模板中的复选框，确认作者确实请求了 AI 评审，且作者身份在允许列表中。
2. 调用 GitHub API 汇总文件改动，并按可配置的字符上限截取 patch 片段。
3. 将 PR 摘要、Release Notes、作者关注点与差异片段整合为 Prompt。
4. 通过 OpenAI 兼容接口（默认 `/chat/completions`，可用 `OPENAI_COMPLETIONS_PATH` 覆盖）生成评审结论。
5. 在 PR 中创建或更新 `### 🤖 AI 评审结果` 评论，避免重复刷屏。

### 3. 控制频率与成本

- 通过标签、评论指令、或 PR 标题前缀进一步限制触发条件。
- 使用 `pull_request_target` 事件可以访问仓库的 Secrets，但要注意安全（例如校验 PR 的作者是否有权限）。
- 对体积较大的 PR 进行分段摘要，避免直接把整个 diff 传给模型导致 Token 开销过大。

## 整体流程回顾

1. 作者在 PR 模板中勾选需要的自动化选项，并填写「Release Notes」等信息。
2. `pr-flags` 工作流解析 PR 内容，自动加上 `needs-release-note`、`needs-ai-review` 等标签。
3. 其他工作流根据标签和勾选状态触发 Release 草稿更新或 AI 评审。
4. 合并后，Release Drafter 自动整理 changelog；如需，可追加脚本同步更新仓库内的 `CHANGELOG.md`。

通过以上配置，就能把 PR 模板中的信息和 GitHub Actions 串联起来，实现「包含更新日志」与「AI 评审」的全自动闭环。

## PR 描述双语翻译

为保证中英文贡献者都能快速理解 PR 描述，仓库提供了 `.github/workflows/pr-translation.yml` 工作流与 `scripts/ci/pr-translation.mjs` 脚本：

1. 工作流在 PR 打开、更新或重新打开时运行，读取事件载荷中的 PR 描述。无需检出仓库代码。
2. 脚本会清理模板注释与换行符，并根据中英文字频估算主要语种：
   - 若判定为中文，则调用模型翻译为英文；
   - 若判定为英文，则翻译为中文；
   - 若内容混合或无法判定，则跳过，避免生成错误翻译。
3. 翻译结果以 `### 🌐 PR 内容翻译` 的固定标题写入（或更新） PR 评论，始终保持一条最新的翻译记录。

### 自定义提示与模型

- 默认沿用 AI 评审所需的 Secrets / Variables，无需重复配置。
- 如需单独指定模型或温度，可设置 `PR_TRANSLATION_MODEL`、`PR_TRANSLATION_TEMPERATURE`、`PR_TRANSLATION_MAX_OUTPUT_TOKENS` 变量。
- 若翻译质量需要进一步调优，可直接在脚本中调整系统提示，或在调用层新增上下文（例如自动追加 PR 标题）。
