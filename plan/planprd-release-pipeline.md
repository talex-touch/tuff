# PRD: 自动发布与 Nexus 同步（OIDC + RSA + Notes/Assets）

## 背景
- 需要 GitHub Actions 构建发布后自动向 Nexus 上报，官网可直接下载 GitHub release 的 artifacts。
- 要保证“官方构建”可信：CI 私钥签名、客户端/服务端公钥验签。
- Release notes 必须 `{ zh, en }`，支持 CMS 编辑与修订历史。

## 目标
- CI 发布完成后自动同步 Nexus（release + assets + notes）。
- 使用 GitHub OIDC，无需静态密钥；audience 统一为 `tuff.tagzxia.com`。
- 使用 RSA 签名验证官方构建（app 与 Nexus 均可验证）。
- Release notes 基础稿由提交记录生成，CMS 可编辑并保留完整修订快照。
- Assets 必传（含 sha256/size/contentType），并区分 channel。

## 非目标
- 不在本阶段落地 AI 翻译（仅保留接口/流程位置）。
- 不重构现有 GitHub Release 流程，仅追加同步步骤。

## 现状与关联逻辑
- GitHub Release 创建：`.github/workflows/build-and-release.yml` 使用 `softprops/action-gh-release@v1`。
- Nexus Release & Assets API：
  - `POST /api/releases`（需 admin）
  - `POST /api/releases/:tag/link-github`（创建 GitHub 资源关联）
- Release notes 结构已升级为 `{ zh, en }`，并支持修订记录。

## 方案设计
### 1) GitHub Actions → Nexus 同步流程
1. Build & Release（现有）
2. 生成 Release notes 基础稿
   - 根据 tag 范围收集 commit list，生成 `notes.json`：
     ```
     {
       "notes": { "zh": "...", "en": "..." },
       "notesHtml": { "zh": "...", "en": "..." } // 可选
     }
     ```
   - 初期可让 zh/en 内容相同，留给 CMS 二次编辑。
3. 创建/更新 Nexus release
   - `POST /api/releases`（含 channel、notes、notesHtml、version、tag 等）
4. 同步 assets
   - 对每个 GitHub asset 调 `POST /api/releases/:tag/link-github`
   - 必传字段：`platform / arch / filename / downloadUrl / size / sha256 / contentType`
5. 发布状态
   - `POST /api/releases/:tag/publish` 或 `PATCH /api/releases/:tag` 设置 `status=published`

### 2) OIDC 验证（Nexus）
- 通过 GitHub OIDC JWT 认证 CI 请求。
- 校验规则（建议）：
  - `iss = https://token.actions.githubusercontent.com`
  - `aud = tuff.tagzxia.com`
  - `sub` 格式匹配 `repo:OWNER/REPO:ref:refs/tags/<tag>`
  - `repository`、`ref`、`workflow`、`job_workflow_ref` 进入白名单
- 通过后允许访问 Nexus 的发布接口（替代 admin token）。

### 3) 官方构建校验（RSA）
- CI 使用私钥对 build info 签名，生成 `signature.json`：
  ```
  {
    "version": "...",
    "buildTime": 123,
    "buildType": "release|snapshot|beta",
    "gitCommitHash": "...",
    "signature": "base64..."
  }
  ```
- App 使用公钥验证：
  - 通过 `BuildVerificationModule` 判断是否官方构建。
  - 结果可上报 Nexus 进行统计/校验。
- Nexus 使用同一公钥验证 app 上报的签名，标记官方客户端。

### 4) Release notes 与 CMS 修订
- notes/notesHtml 始终使用 `{ zh, en }`。
- CMS 修改发布说明时：
  - 保存更新内容
  - 自动生成修订快照（包含完整 release snapshot）
  - 可查询修订历史列表

### 5) Channel 统一
- `channel` 统一枚举：`release | snapshot | beta`
- CI 与 Nexus 按 channel 归档，官网按 channel 展示。

## 数据结构（关键字段）
### Release
- `tag`, `name`, `version`, `channel`, `status`
- `notes`: `{ zh, en }`
- `notesHtml`: `{ zh, en } | null`
- `publishedAt`, `createdAt`, `updatedAt`

### ReleaseAsset
- `platform`, `arch`, `filename`
- `downloadUrl`, `size`, `sha256`, `contentType`
- `sourceType = github`

### ReleaseRevision
- `releaseId`, `tag`, `editorId`, `snapshot`, `createdAt`

## 风险与缓解
- OIDC token 被滥用：严格校验 aud/iss/sub/workflow 白名单。
- 资产与 notes 不一致：CI 同步以 tag 为主键，失败可重试。
- 本地篡改：RSA 公钥验证失败即标记非官方构建。

## 验收标准
- CI 发布完成后 Nexus 自动同步 release + assets。
- Nexus 不再依赖静态密钥，OIDC 验证通过即可写入。
- App 与 Nexus 可验证官方构建签名。
- notes/notesHtml 仅使用 `{ zh, en }`，CMS 更新有修订历史。

## 里程碑
1. OIDC 验证与 CI 同步接口落地。
2. RSA 签名生成与 app/Nexus 验证落地。
3. Release notes 基础稿生成与 CMS 修订流程对齐。
