import { getQuery, setResponseHeader } from 'h3'
import { readPilotSessionUserId } from '../../utils/pilot-session'

function sanitizeReturnTo(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/')) {
    return '/'
  }
  if (raw.startsWith('//')) {
    return '/'
  }
  return raw
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const returnTo = sanitizeReturnTo(query.returnTo)
  const sessionUserId = readPilotSessionUserId(event)
  const authorizePath = `/auth/authorize?returnTo=${encodeURIComponent(returnTo)}`
  const continuePath = returnTo
  const statusLabel = sessionUserId
    ? '当前已登录，可继续发起授权同步。'
    : '当前为访客模式，聊天历史仅绑定本地设备 ID。'

  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pilot 登录授权</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(160deg, #f7f8fa 0%, #eef3f9 100%);
      }
      .card {
        width: min(460px, calc(100vw - 32px));
        border-radius: 16px;
        background: #fff;
        border: 1px solid #dce6f5;
        box-shadow: 0 18px 46px rgba(18, 32, 54, 0.12);
        padding: 22px 20px 18px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 20px;
        color: #0f172a;
      }
      p {
        margin: 0;
        line-height: 1.55;
        color: #334155;
        font-size: 14px;
      }
      .tip {
        margin-top: 8px;
        font-size: 12px;
        color: #64748b;
      }
      .actions {
        display: flex;
        gap: 10px;
        margin-top: 18px;
        flex-wrap: wrap;
      }
      .btn {
        appearance: none;
        border-radius: 10px;
        border: 1px solid transparent;
        padding: 9px 14px;
        font-size: 14px;
        text-decoration: none;
        cursor: pointer;
      }
      .btn-primary {
        background: #0f67ff;
        color: #fff;
      }
      .btn-primary:hover {
        background: #0c59df;
      }
      .btn-ghost {
        background: #fff;
        color: #0f172a;
        border-color: #d1d9e6;
      }
      .btn-ghost:hover {
        background: #f8fafc;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Pilot 账号授权</h1>
      <p>${escapeHtml(statusLabel)}</p>
      <p class="tip">未登录也可继续使用。访客历史仅保留 3 天，且与本地设备 ID 绑定。</p>
      <div class="actions">
        <a class="btn btn-primary" href="${escapeHtml(authorizePath)}">授权并登录 Nexus</a>
        <a class="btn btn-ghost" href="${escapeHtml(continuePath)}">继续访客使用</a>
      </div>
    </main>
  </body>
</html>`
})
