# Pilot 部署指南（1Panel + Docker Compose）

本目录提供 Pilot 在 1Panel 的标准部署脚本：

- `deploy-pilot-1panel.sh`：拉镜像 + 重启 + 健康检查 + 自动回滚
- `deploy-pilot-1panel-cron.sh`：定时封装（自动加载 env + 并发锁）
- `deploy-pilot-1panel.env.example`：环境变量模板
- `deploy-pilot-1panel-webhook.sh`：解析 webhook payload 并转发到主部署脚本
- `deploy-pilot-1panel-webhook.env.example`：webhook token 与仓库/分支限制模板
- `pilot-deploy-webhook-server.py`：轻量 HTTP webhook 服务（含状态页）
- `pilot-deploy-webhook.service.example`：systemd 单元模板

## 1）快速开始

1. 上传以下文件到服务器（示例：`/opt/1panel/scripts/pilot-deploy`）：
  - `deploy-pilot-1panel.sh`
  - `deploy-pilot-1panel-cron.sh`
  - `deploy-pilot-1panel.env.example`
  - `deploy-pilot-1panel-webhook.sh`
  - `deploy-pilot-1panel-webhook.env.example`
  - `pilot-deploy-webhook-server.py`
2. 赋予执行权限：

```bash
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh"
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.sh"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.env.example" "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.env"
```

3. 编辑 `pilot-deploy.env` 与 `deploy-pilot-1panel-webhook.env`，填入生产环境配置。

## 2）环境变量

### 运行时必填

- `PILOT_POSTGRES_URL`
- `PILOT_REDIS_URL`
- `PILOT_JWT_ACCESS_SECRET`
- `PILOT_JWT_REFRESH_SECRET`
- `PILOT_COOKIE_SECRET`
- `PILOT_CONFIG_ENCRYPTION_KEY`
- `PILOT_BOOTSTRAP_ADMIN_PASSWORD`（必须显式配置，至少 6 位）

### 运行时可选

- `PILOT_BOOTSTRAP_ADMIN_EMAIL`（默认 `admin@pilot.local`）
- `PILOT_EXECUTOR_DEBUG`
- `NUXT_PUBLIC_NEXUS_ORIGIN`
- `PILOT_NEXUS_OAUTH_CLIENT_ID`
- `PILOT_NEXUS_OAUTH_CLIENT_SECRET`
- `PILOT_ATTACHMENT_PROVIDER`（`memory|auto|s3`，默认 `memory`，建议先用 `memory` 跑通）
- `PILOT_ATTACHMENT_PUBLIC_BASE_URL`
- `PILOT_ATTACHMENT_SIGNING_SECRET`（可选；为空时回退 `PILOT_COOKIE_SECRET`）
- 启用 `s3` 时再配置：
- `PILOT_MINIO_ENDPOINT`
- `PILOT_MINIO_BUCKET`
- `PILOT_MINIO_ACCESS_KEY`
- `PILOT_MINIO_SECRET_KEY`
- `PILOT_MINIO_REGION`（默认 `us-east-1`）
- `PILOT_MINIO_FORCE_PATH_STYLE`（默认 `true`）
- `PILOT_MINIO_PUBLIC_BASE_URL`（可选，bucket 根地址）

### 部署变量

- `PILOT_IMAGE_TAG`（默认 `pilot-latest`）
- `PILOT_HEALTHCHECK_URL`
- `PILOT_HEALTHCHECK_ATTEMPTS`
- `PILOT_HEALTHCHECK_INTERVAL_SEC`
- `PILOT_ROLLBACK_ON_FAILURE`

### Webhook 变量

- `PILOT_WEBHOOK_TOKEN`（必填，请求密钥校验）
- `PILOT_WEBHOOK_ALLOWED_BRANCH`（默认 `master`）
- `PILOT_WEBHOOK_ALLOWED_REPOSITORY`（可选，例如 `talex-touch/tuff`）
- `PILOT_WEBHOOK_DEFAULT_IMAGE`
- `PILOT_WEBHOOK_DEFAULT_TAG`
- `PILOT_WEBHOOK_SERVER_HOST`（默认 `127.0.0.1`）
- `PILOT_WEBHOOK_SERVER_PORT`（默认 `19021`）

> compose 路径/服务名/镜像仓库默认自动探测。若首次部署没有 compose 文件，可手动执行
> `deploy-pilot-1panel.sh --bootstrap-compose --bootstrap-http-port 3300` 生成最小模板。

## 3）手动部署

```bash
set -a
source "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
set +a
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
```

## 4）每日定时部署

推荐 cron：

```bash
0 4 * * * /opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh >> /var/log/pilot-deploy.log 2>&1
```

封装脚本会自动：

1. 加载 `pilot-deploy.env`
2. 加并发锁（避免重复部署）
3. 执行主部署脚本

## 5）Webhook 自动部署（GitHub -> 1Panel）

1. 安装 systemd 单元：

```bash
cp "/opt/1panel/scripts/pilot-deploy/pilot-deploy-webhook.service.example" "/etc/systemd/system/pilot-deploy-webhook.service"
systemctl daemon-reload
systemctl enable --now pilot-deploy-webhook.service
```

2. 校验 webhook 服务状态：

```bash
curl "http://127.0.0.1:19021/health"
```

3. 通过 FRP 暴露 webhook（remote 端口建议使用 `20000-30000` 且避免冲突），然后重启 FRPC。
4. 配置 GitHub 仓库密钥：
   - `ONEPANEL_WEBHOOK_URL`（例如 `http://<frp-host>:23301`）
   - `ONEPANEL_WEBHOOK_TOKEN`（与 `PILOT_WEBHOOK_TOKEN` 保持一致）
5. `pilot-image.yml` 在镜像发布后会自动 `POST /deploy` 触发重建。

## 6）回滚机制

- 记录当前运行镜像
- 部署目标镜像
- 执行健康检查
- 检查失败且允许回滚时，自动回滚到上一版本镜像

## 7）说明

- 当前部署链路仅支持 Node Server（不再使用 Cloudflare runtime）
- 运行时强制依赖 PostgreSQL + Redis
- 管理员邮箱默认 `admin@pilot.local`；管理员密码必须通过 `PILOT_BOOTSTRAP_ADMIN_PASSWORD` 提供（至少 6 位）
- 生产环境首次部署后请立即修改管理员密码
