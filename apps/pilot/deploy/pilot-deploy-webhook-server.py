#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_text(raw: str, limit: int = 4000) -> str:
    text = raw.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 15] + "\n...<truncated>"


@dataclass
class WebhookState:
    started_at: str = field(default_factory=now_iso)
    last_request_at: str | None = None
    last_result_at: str | None = None
    last_status: str = "idle"
    last_http_status: int | None = None
    last_payload: dict[str, Any] | None = None
    last_stdout: str = ""
    last_stderr: str = ""
    running: bool = False
    run_count: int = 0


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEPLOY_WEBHOOK_SCRIPT = os.environ.get(
    "PILOT_WEBHOOK_HANDLER_SCRIPT",
    os.path.join(SCRIPT_DIR, "deploy-pilot-1panel-webhook.sh"),
)
LISTEN_HOST = os.environ.get("PILOT_WEBHOOK_SERVER_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("PILOT_WEBHOOK_SERVER_PORT", "19021"))
REQUEST_TIMEOUT_SECONDS = int(os.environ.get("PILOT_WEBHOOK_DEPLOY_TIMEOUT_SEC", "1800"))
EXPECTED_TOKEN = os.environ.get("PILOT_WEBHOOK_TOKEN", "").strip()

STATE = WebhookState()
STATE_LOCK = threading.Lock()
RUN_LOCK = threading.Lock()


def resolve_request_token(handler: BaseHTTPRequestHandler) -> str:
    token = handler.headers.get("x-pilot-token", "").strip()
    if token:
        return token
    return handler.headers.get("authorization", "").removeprefix("Bearer ").strip()


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def html_response(handler: BaseHTTPRequestHandler, status: int, content: str) -> None:
    body = content.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def run_deploy(payload: dict[str, Any], request_token: str) -> tuple[int, str, str, float]:
    cmd = [
        DEPLOY_WEBHOOK_SCRIPT,
        "--payload-json",
        json.dumps(payload, separators=(",", ":")),
    ]
    if request_token:
        cmd.extend(["--request-token", request_token])

    begin = time.time()
    completed = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=REQUEST_TIMEOUT_SECONDS,
        check=False,
    )
    cost = time.time() - begin
    return completed.returncode, completed.stdout, completed.stderr, cost


def render_index() -> str:
    with STATE_LOCK:
        payload_preview = json.dumps(STATE.last_payload or {}, ensure_ascii=False, indent=2)
        status = STATE.last_status
        running = "yes" if STATE.running else "no"
        last_http_status = STATE.last_http_status if STATE.last_http_status is not None else "-"
        last_stdout = STATE.last_stdout or "-"
        last_stderr = STATE.last_stderr or "-"
        run_count = STATE.run_count
        started_at = STATE.started_at
        last_request_at = STATE.last_request_at or "-"
        last_result_at = STATE.last_result_at or "-"

    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pilot Deploy Webhook</title>
    <style>
      body {{
        margin: 0;
        padding: 24px;
        font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
        background: #0e1116;
        color: #dce3f0;
      }}
      h1 {{
        margin-top: 0;
      }}
      .card {{
        background: #151a23;
        border: 1px solid #2b3442;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
      }}
      .muted {{
        color: #9aa7bd;
      }}
      pre {{
        white-space: pre-wrap;
        word-break: break-word;
      }}
      code {{
        color: #9cdcfe;
      }}
    </style>
  </head>
  <body>
    <h1>Pilot Deploy Webhook</h1>
    <div class="card">
      <div>Status: <strong>{status}</strong></div>
      <div>Running: <strong>{running}</strong></div>
      <div>Last HTTP status: <strong>{last_http_status}</strong></div>
      <div>Run count: <strong>{run_count}</strong></div>
      <div class="muted">Started at: {started_at}</div>
      <div class="muted">Last request at: {last_request_at}</div>
      <div class="muted">Last result at: {last_result_at}</div>
    </div>
    <div class="card">
      <h3>Last Payload</h3>
      <pre>{payload_preview}</pre>
    </div>
    <div class="card">
      <h3>Last Stdout</h3>
      <pre>{last_stdout}</pre>
    </div>
    <div class="card">
      <h3>Last Stderr</h3>
      <pre>{last_stderr}</pre>
    </div>
    <div class="card muted">
      POST <code>/deploy</code> with JSON payload and header <code>X-Pilot-Token</code>.
    </div>
  </body>
</html>
"""


class WebhookHandler(BaseHTTPRequestHandler):
    server_version = "pilot-deploy-webhook/1.0"

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/" or self.path == "/index.html":
            html_response(self, HTTPStatus.OK, render_index())
            return
        if self.path == "/health":
            with STATE_LOCK:
                payload = {
                    "ok": True,
                    "status": STATE.last_status,
                    "running": STATE.running,
                    "started_at": STATE.started_at,
                    "last_request_at": STATE.last_request_at,
                    "last_result_at": STATE.last_result_at,
                }
            json_response(self, HTTPStatus.OK, payload)
            return
        json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "message": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/deploy":
            json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "message": "not_found"})
            return

        content_length = int(self.headers.get("content-length", "0") or "0")
        if content_length <= 0 or content_length > 1024 * 1024:
            json_response(
                self,
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "message": "invalid_payload_size"},
            )
            return

        try:
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body)
        except Exception:
            json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "message": "invalid_json"})
            return

        request_token = resolve_request_token(self)
        if EXPECTED_TOKEN and request_token != EXPECTED_TOKEN:
            with STATE_LOCK:
                STATE.last_request_at = now_iso()
                STATE.last_status = "rejected"
                STATE.last_http_status = HTTPStatus.UNAUTHORIZED
            json_response(self, HTTPStatus.UNAUTHORIZED, {"ok": False, "message": "unauthorized"})
            return

        with STATE_LOCK:
            STATE.last_request_at = now_iso()
            STATE.last_payload = payload

        if not RUN_LOCK.acquire(blocking=False):
            with STATE_LOCK:
                STATE.last_status = "busy"
                STATE.last_http_status = HTTPStatus.CONFLICT
            json_response(self, HTTPStatus.CONFLICT, {"ok": False, "message": "deploy_in_progress"})
            return

        try:
            with STATE_LOCK:
                STATE.running = True
                STATE.last_status = "running"
                STATE.last_http_status = None

            code, stdout, stderr, elapsed = run_deploy(payload, request_token)
            status = "success" if code == 0 else "failed"
            http_status = HTTPStatus.OK if code == 0 else HTTPStatus.BAD_GATEWAY
            with STATE_LOCK:
                STATE.running = False
                STATE.last_result_at = now_iso()
                STATE.last_status = status
                STATE.last_http_status = http_status
                STATE.last_stdout = clean_text(stdout)
                STATE.last_stderr = clean_text(stderr)
                STATE.run_count += 1
            json_response(
                self,
                http_status,
                {
                    "ok": code == 0,
                    "status": status,
                    "exit_code": code,
                    "elapsed_sec": round(elapsed, 3),
                    "stdout": clean_text(stdout, 1200),
                    "stderr": clean_text(stderr, 1200),
                },
            )
        except subprocess.TimeoutExpired:
            with STATE_LOCK:
                STATE.running = False
                STATE.last_result_at = now_iso()
                STATE.last_status = "timeout"
                STATE.last_http_status = HTTPStatus.GATEWAY_TIMEOUT
                STATE.last_stdout = ""
                STATE.last_stderr = f"Timed out after {REQUEST_TIMEOUT_SECONDS}s"
                STATE.run_count += 1
            json_response(
                self,
                HTTPStatus.GATEWAY_TIMEOUT,
                {"ok": False, "status": "timeout", "message": "deploy_timeout"},
            )
        except Exception as exc:  # pragma: no cover
            with STATE_LOCK:
                STATE.running = False
                STATE.last_result_at = now_iso()
                STATE.last_status = "error"
                STATE.last_http_status = HTTPStatus.INTERNAL_SERVER_ERROR
                STATE.last_stdout = ""
                STATE.last_stderr = clean_text(str(exc))
                STATE.run_count += 1
            json_response(
                self,
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"ok": False, "status": "error", "message": "deploy_exception"},
            )
        finally:
            RUN_LOCK.release()

    def log_message(self, fmt: str, *args: Any) -> None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {self.address_string()} - {fmt % args}")


def main() -> None:
    if not os.path.isfile(DEPLOY_WEBHOOK_SCRIPT):
        raise SystemExit(f"deploy webhook script not found: {DEPLOY_WEBHOOK_SCRIPT}")
    if not os.access(DEPLOY_WEBHOOK_SCRIPT, os.X_OK):
        raise SystemExit(f"deploy webhook script is not executable: {DEPLOY_WEBHOOK_SCRIPT}")

    print(
        f"[pilot-webhook-server] listening on http://{LISTEN_HOST}:{LISTEN_PORT}, script={DEPLOY_WEBHOOK_SCRIPT}"
    )
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), WebhookHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
