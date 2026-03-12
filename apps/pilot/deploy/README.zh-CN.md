# Pilot 部署指南（1Panel + GHCR）

本目录提供 Pilot 在 1Panel 上的标准化部署资产：

- `deploy-pilot-1panel.sh`：主部署脚本（支持健康检查 + 自动回滚）
- `deploy-pilot-1panel.env.example`：环境变量模板

---

## 1. 部署目标

推荐发布链路：

1. GitHub Actions 构建并推送镜像到 GHCR（标签如 `pilot-<short_sha>`、`pilot-latest`）
2. 1Panel 服务器执行本目录脚本
3. 脚本拉取目标镜像并重启 `pilot` 服务
4. 健康检查失败时自动回滚到上一版本镜像

---

## 2. 前置条件

服务器需满足：

- 已安装 Docker（`docker`）
- 已安装 Compose（`docker compose` 或 `docker-compose`）
- 1Panel 中已有 Pilot 的 Compose 项目
- 若 GHCR 包是私有：准备 GHCR 凭据（建议 PAT，最小权限 `read:packages`）

---

## 3. 上传文件到服务器

将以下文件上传到服务器（示例路径 `/opt/1panel/scripts/pilot-deploy`）：

- `apps/pilot/deploy/deploy-pilot-1panel.sh`
- `apps/pilot/deploy/deploy-pilot-1panel.env.example`

然后执行：

```bash
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
```

---

## 4. 配置环境变量

编辑 `pilot-deploy.env`：

```bash
PILOT_PROJECT_DIR=/opt/1panel/apps/tuff-pilot
PILOT_COMPOSE_FILE=docker-compose.yml
PILOT_SERVICE_NAME=pilot

PILOT_IMAGE_REPO=ghcr.io/talex-touch/tuff-pilot
PILOT_IMAGE_TAG=pilot-latest

PILOT_HEALTHCHECK_URL=http://127.0.0.1:3300/api/auth/status
PILOT_HEALTHCHECK_ATTEMPTS=20
PILOT_HEALTHCHECK_INTERVAL_SEC=3
PILOT_ROLLBACK_ON_FAILURE=true

PILOT_GHCR_USERNAME=
PILOT_GHCR_TOKEN=
```

关键字段说明：

- `PILOT_PROJECT_DIR`：Compose 项目目录（必须）
- `PILOT_SERVICE_NAME`：需要更新的服务名，默认 `pilot`
- `PILOT_IMAGE_TAG`：默认 `pilot-latest`，也可指定某次发布标签（例如 `pilot-a1b2c3d`）
- `PILOT_HEALTHCHECK_URL`：建议配置，用于部署后探活

---

## 5. 手动执行部署

### 5.1 使用 env 文件部署（推荐）

```bash
set -a
source "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
set +a
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
```

### 5.2 直接命令行传参部署

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-latest" \
  --health-url "http://127.0.0.1:3300/api/auth/status"
```

### 5.3 按特定版本部署（推荐用于回滚/灰度）

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-a1b2c3d"
```

---

## 6. 在 1Panel 中配置自动执行

可选方式 A（推荐）：1Panel 脚本任务

1. 在 1Panel 创建脚本任务
2. 命令写入：

```bash
set -a
source "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
set +a
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
```

3. 先手动执行验证通过，再挂 webhook 或定时

可选方式 B：1Panel Webhook + GitHub Actions 调用

推荐使用本目录的 webhook 入口脚本：

- `deploy-pilot-1panel-webhook.sh`
- `deploy-pilot-1panel-webhook.env.example`

它会自动做这些事：

1. 验证 webhook token（可选）
2. 校验仓库与分支（`PILOT_WEBHOOK_ALLOWED_REPOSITORY` / `PILOT_WEBHOOK_ALLOWED_BRANCH`）
3. 从 payload 读取 `image/tag/sha`
4. 若没有 `tag` 但有 `sha`，自动映射为 `pilot-<short_sha>`
5. 调用 `deploy-pilot-1panel.sh` 执行真正部署

### 6.1 Webhook 入口脚本初始化

```bash
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-webhook.env"
```

编辑 `pilot-webhook.env`：

```bash
PILOT_WEBHOOK_TOKEN=replace-with-secure-token
PILOT_WEBHOOK_ALLOWED_BRANCH=master
PILOT_WEBHOOK_ALLOWED_REPOSITORY=talex-touch/tuff
PILOT_WEBHOOK_DEFAULT_IMAGE=ghcr.io/talex-touch/tuff-pilot
PILOT_WEBHOOK_DEFAULT_TAG=pilot-latest
PILOT_WEBHOOK_DEPLOY_SCRIPT=/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh
```

### 6.2 1Panel 脚本任务命令（Webhook 场景）

> 以下示例假设 1Panel 会把 webhook body 写到 `/tmp/pilot-webhook.json`，并把请求头 token 写到环境变量 `ONEPANEL_WEBHOOK_TOKEN_IN`。  
> 如果你的 1Panel 字段名不同，替换成你实际变量即可。

```bash
set -a
source "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
source "/opt/1panel/scripts/pilot-deploy/pilot-webhook.env"
set +a
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.sh" \
  --payload-file "/tmp/pilot-webhook.json" \
  --request-token "${ONEPANEL_WEBHOOK_TOKEN_IN:-}"
```

### 6.3 GitHub Actions 到 Webhook 的 payload 建议

推荐发送：

```json
{
  "repository": "talex-touch/tuff",
  "branch": "master",
  "sha": "abcdef1234567890",
  "image": "ghcr.io/talex-touch/tuff-pilot",
  "tag": "pilot-abcdef1"
}
```

兼容规则：

- 若存在 `image_ref`，优先按完整引用部署（如 `ghcr.io/talex-touch/tuff-pilot@sha256:...`）
- 若存在 `image + tag`，按标签部署
- 若只有 `sha`，自动转成 `pilot-<short_sha>`
- 若都没有，回退到 `PILOT_WEBHOOK_DEFAULT_IMAGE + PILOT_WEBHOOK_DEFAULT_TAG`

---

## 7. 回滚策略说明

脚本默认行为：

1. 记录当前运行镜像（旧版本）
2. 部署新镜像
3. 执行健康检查
4. 失败则自动回滚旧镜像并再次健康检查

关闭自动回滚：

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-latest" \
  --no-rollback
```

---

## 8. 常见问题

### Q1: 报错 `docker compose / docker-compose is not available`

服务器未安装 compose，先在 1Panel 服务器补齐 Docker Compose 环境。

### Q2: 报错 GHCR 鉴权失败

检查：

- `PILOT_GHCR_USERNAME` / `PILOT_GHCR_TOKEN` 是否正确
- Token 是否有 `read:packages` 权限
- GHCR 包是否属于当前账号/org

### Q3: 健康检查失败但服务实际上可用

检查 `PILOT_HEALTHCHECK_URL` 是否为容器可访问地址。可先临时去掉健康检查验证部署链路，再恢复。

---

## 9. 安全建议

- 仅授予 GHCR 最小权限（`read:packages`）
- 不要把 GHCR Token 写入 Git 仓库
- 1Panel webhook 建议配置签名校验或 Token 校验
- 生产环境建议固定部署不可变标签（`pilot-<sha>`），避免 `latest` 漂移
