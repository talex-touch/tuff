# Pilot 部署指南（1Panel + Docker Compose）

本目录提供 Pilot 在 1Panel 的标准部署脚本：

- `deploy-pilot-1panel.sh`：拉镜像 + 重启 + 健康检查 + 自动回滚
- `deploy-pilot-1panel-cron.sh`：定时封装（自动加载 env + 并发锁）
- `deploy-pilot-1panel.env.example`：环境变量模板

## 1）快速开始

1. 上传以下文件到服务器（示例：`/opt/1panel/scripts/pilot-deploy`）：
   - `deploy-pilot-1panel.sh`
   - `deploy-pilot-1panel-cron.sh`
   - `deploy-pilot-1panel.env.example`
2. 赋予执行权限：

```bash
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
```

3. 编辑 `pilot-deploy.env`，填入生产环境配置。

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

### 部署变量

- `PILOT_IMAGE_TAG`（默认 `pilot-latest`）
- `PILOT_HEALTHCHECK_URL`
- `PILOT_HEALTHCHECK_ATTEMPTS`
- `PILOT_HEALTHCHECK_INTERVAL_SEC`
- `PILOT_ROLLBACK_ON_FAILURE`

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

## 5）回滚机制

- 记录当前运行镜像
- 部署目标镜像
- 执行健康检查
- 检查失败且允许回滚时，自动回滚到上一版本镜像

## 6）说明

- 当前部署链路仅支持 Node Server（不再使用 Cloudflare runtime）
- 运行时强制依赖 PostgreSQL + Redis
- 管理员邮箱默认 `admin@pilot.local`；管理员密码必须通过 `PILOT_BOOTSTRAP_ADMIN_PASSWORD` 提供（至少 6 位）
- 生产环境首次部署后请立即修改管理员密码
