# 利用 GitHub 实现发布日志与 AI 评审自动化

本文档提供一个基于 GitHub 平台的思路，帮助你把 PR 模板里关于「包含更新日志」与「AI 评审」的选项真正落地成自动化流程。所有示例均以仓库已有的 CI 体系为例，可按需调整。

## 总体策略

1. **结构化 PR 信息**：继续使用模板中约定的「☑」符号，自动化脚本通过正则表达式即可判断用户是否勾选。
2. **触发 GitHub Actions**：借助 `pull_request_target` 或 `pull_request` 事件，在 PR 打开 / 更新时运行脚本解析勾选状态。
3. **根据勾选结果执行后续动作**：
   - 勾选「需要写入 Release」时，将 PR 信息写入 Release 草稿或专用 changelog 文件。
   - 勾选「需要 AI 分析」时，调用第三方模型（例如 OpenAI、Azure OpenAI、Moonshot 等）生成评审结果并以评论形式反馈。

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
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: release-drafter/release-drafter@v6
        with:
          config-name: release-drafter.yml
```

在 `.github/release-drafter.yml` 中可以自定义 Release 草稿标题与条目格式；再结合下方的解析脚本，仅当 PR 选择了「需要写入 Release」时才写入。

### 2. 基于 PR 模板的自定义解析

```yaml
# .github/workflows/pr-flags.yml
name: Parse PR flags

on:
  pull_request_target:
    types: [opened, edited, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  scan-body:
    runs-on: ubuntu-latest
    steps:
      - name: 检查是否需要写入 Release
        id: release
        uses: actions/github-script@v7
        with:
          script: |
            const body = github.event.pull_request.body || "";
            const needRelease = /☑\s*需要将此 PR 的提交包含进下一次 Release 更新日志/.test(body);
            core.setOutput('need-release', needRelease);

      - name: 标记标签便于后续处理
        if: steps.release.outputs['need-release'] == 'true'
        uses: actions-ecosystem/action-add-labels@v1
        with:
          labels: needs-release-note
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

`scripts/ci/append-changelog.mjs` 可以读取 PR 模板里的「Release Notes」段落，将内容插入 `CHANGELOG.md` 或 Release 草稿。

## AI 评审 / 分析

### 1. 准备模型凭证

在仓库或组织级别的 Secrets 中配置：

- `OPENAI_API_KEY`（或其他模型厂商的密钥）
- 如果使用 Azure OpenAI，还需要 `OPENAI_ENDPOINT`、`OPENAI_DEPLOYMENT` 等。

### 2. 工作流示例

```yaml
# .github/workflows/ai-review.yml
name: AI review

on:
  pull_request_target:
    types: [opened, reopened, ready_for_review, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  request-review:
    runs-on: ubuntu-latest
    steps:
      - name: 判断是否需要 AI 评审
        id: need
        uses: actions/github-script@v7
        with:
          script: |
            const body = github.event.pull_request.body || "";
            const needAI = /☑\s*需要触发 AI 对此 PR 的自动分析/.test(body);
            core.setOutput('need-ai', needAI);

      - name: 生成 AI 评审
        if: steps.need.outputs['need-ai'] == 'true'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx ts-node scripts/ci/ai-review.ts \
            --pr ${GITHUB_EVENT_PATH}
```

`scripts/ci/ai-review.ts` 大致流程：

1. 读取触发事件 JSON（`GITHUB_EVENT_PATH`），获取 PR 编号、标题、变更文件等。
2. 使用 `@octokit/rest` 拉取 `diff` 或 `files` 数据。
3. 把关键信息整理成 Prompt，调用模型生成分析结论。
4. 使用 `octokit.rest.issues.createComment` 把结果作为评论发布到 PR。

示例伪代码：

```ts
import { Octokit } from "octokit";
import OpenAI from "openai";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const { pull_request } = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));

const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
  owner, repo, pull_number: pull_request.number,
});

const prompt = buildPrompt({ pull_request, files });
const aiResult = await openai.responses.create({
  model: "gpt-4.1-mini",
  input: prompt,
});

await octokit.rest.issues.createComment({
  owner, repo,
  issue_number: pull_request.number,
  body: formatResult(aiResult),
});
```

### 3. 控制频率与成本

- 通过标签、评论指令、或 PR 标题前缀进一步限制触发条件。
- 使用 `pull_request_target` 事件可以访问仓库的 Secrets，但要注意安全（例如校验 PR 的作者是否有权限）。
- 对体积较大的 PR 进行分段摘要，避免直接把整个 diff 传给模型导致 Token 开销过大。

## 整体流程回顾

1. 作者在 PR 模板中勾选需要的自动化选项，并填写「Release Notes」等信息。
2. `pr-flags` 工作流解析 PR 内容，自动加上 `needs-release-note` 等标签。
3. 其他工作流根据标签和勾选状态触发 Release 草稿更新或 AI 评审。
4. 合并后，Release Drafter 自动整理 changelog；如需，可追加脚本同步更新仓库内的 `CHANGELOG.md`。

通过以上配置，就能把 PR 模板中的信息和 GitHub Actions 串联起来，实现「包含更新日志」与「AI 评审」的全自动闭环。
