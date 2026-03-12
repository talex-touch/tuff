# Pilot 部署指南（1Panel + GHCR）

本目录提供 Pilot 在 1Panel 上的标准化部署资产：

- `deploy-pilot-1panel.sh`：主部署脚本（支持健康检查 + 自动回滚 + 仅拉取镜像模式）
- `deploy-pilot-1panel-cron.sh`：定时执行封装（自动加载 env + 防并发）
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
- 1Panel 中有一个用于 Pilot 的项目目录（是否已有 compose 文件都可）
- 若 GHCR 包是私有：准备 GHCR 凭据（建议 PAT，最小权限 `read:packages`）

---

## 3. 上传文件到服务器

将以下文件上传到服务器（示例路径 `/opt/1panel/scripts/pilot-deploy`）：

- `apps/pilot/deploy/deploy-pilot-1panel.sh`
- `apps/pilot/deploy/deploy-pilot-1panel-cron.sh`
- `apps/pilot/deploy/deploy-pilot-1panel.env.example`

然后执行：

```bash
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
```

---

## 4. 配置环境变量

编辑 `pilot-deploy.env`：

```bash
# 可留空；脚本会在当前目录和 /opt/1panel 下自动探测 compose。
PILOT_PROJECT_DIR=
PILOT_COMPOSE_FILE=docker-compose.yml
PILOT_SERVICE_NAME=pilot

PILOT_IMAGE_REPO=ghcr.io/talex-touch/tuff-pilot
PILOT_IMAGE_TAG=pilot-latest
PILOT_DB_DRIVER=sqlite
PILOT_DB_FILE=/app/data/pilot.sqlite
PILOT_POSTGRES_URL=
PILOT_REDIS_URL=redis://redis:6379/0

PILOT_HEALTHCHECK_URL=http://127.0.0.1:3300/api/auth/status
PILOT_HEALTHCHECK_ATTEMPTS=20
PILOT_HEALTHCHECK_INTERVAL_SEC=3
PILOT_ROLLBACK_ON_FAILURE=true

PILOT_GHCR_USERNAME=
PILOT_GHCR_TOKEN=
```

关键字段说明：

- `PILOT_PROJECT_DIR`：Compose 项目目录（可选，留空自动探测）
- `PILOT_SERVICE_NAME`：需要更新的服务名，默认 `pilot`
- `PILOT_IMAGE_TAG`：默认 `pilot-latest`，也可指定某次发布标签（例如 `pilot-a1b2c3d`）
- `PILOT_DB_DRIVER`：`sqlite` / `postgres`，默认 `sqlite`
- `PILOT_DB_FILE`：SQLite 模式下运行时数据库文件（建议 `/app/data/pilot.sqlite`）
- `PILOT_POSTGRES_URL`：Postgres 连接串（仅 `postgres` 模式使用）
- `PILOT_REDIS_URL`：Redis 连接串（当前先做运行时保留配置）
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

> 现在支持自动检测：不传 `--project-dir/--image/--service` 时，脚本会优先从 compose 推断目标服务和镜像。

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

### 5.4 仅拉取镜像（不重启服务）

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-latest" \
  --pull-only
```

适用于你要先预拉取镜像层、等维护窗口再重启服务的场景。

### 5.5 首次部署（没有 compose 文件时自动初始化）

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --compose-file "docker-compose.yml" \
  --service "pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-latest" \
  --bootstrap-compose \
  --bootstrap-http-port "3300" \
  --health-url "http://127.0.0.1:3300/api/auth/status"
```

行为说明：

- 如果 compose 不存在，脚本会先生成一份最小可运行 compose 文件；
- 生成的 compose 默认包含 `./data:/app/data` 挂载，用于持久化运行时数据库；
- 然后继续执行正常部署（拉取 + 重启 + 健康检查 + 失败回滚）；
- `--bootstrap-http-port` 用于控制宿主机端口映射（`<hostPort>:3300`）。

---

## 6. 定时自动部署（每日一次）

推荐用 cron 调度封装脚本：

```bash
0 4 * * * /opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh >> /var/log/pilot-deploy.log 2>&1
```

封装脚本行为：

1. 自动加载 `pilot-deploy.env`
2. 自动加锁，避免并发重复部署
3. 调用 `deploy-pilot-1panel.sh` 执行拉取 + 重启 + 健康检查 + 失败回滚

如果你希望强制某个镜像标签，可在 cron 命令前覆盖变量：

```bash
PILOT_IMAGE_TAG=pilot-latest /opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh
```

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

### Q4: 报错 `Compose file not found: .../docker-compose.yml`

这通常是 `PILOT_PROJECT_DIR` 指到了脚本目录，而不是 1Panel 应用目录。建议明确配置：

- `PILOT_PROJECT_DIR=/opt/1panel/apps/<你的应用目录>`
- `PILOT_COMPOSE_FILE=docker-compose.yml`（或 compose 绝对路径）

现在脚本会在常见 1Panel 根目录下自动探测 compose 文件，但只会接受能命中 Pilot 服务/镜像特征的候选，避免误命中其它项目。

如果是首次部署且确实没有 compose 文件，直接使用 `--bootstrap-compose` 初始化一次即可。

### Q5: 报错 `Cloudflare D1 binding "DB" is required for Pilot runtime`

这表示你当前是 Node 服务器部署，但没有配置本地数据库文件。  
请设置 `PILOT_DB_FILE=/app/data/pilot.sqlite`，并确保有持久化挂载（例如 `./data:/app/data`）。

---

## 9. 安全建议

- 仅授予 GHCR 最小权限（`read:packages`）
- 不要把 GHCR Token 写入 Git 仓库
- 生产环境建议固定部署不可变标签（`pilot-<sha>`），避免 `latest` 漂移
