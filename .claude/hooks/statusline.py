#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Project StatusLine — Claude Code session metrics and the selected Comet Native change.

Reads Claude Code session JSON from stdin and read-only Native status through the pinned CLI.
Outputs a change line when selected, followed by model, context, branch, duration and rate limits.
When COLUMNS (injected by Claude Code v2.1.153+) is too narrow for the info
line, the rate-limit segments move to their own line via an explicit "\n".
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Fix: Windows Python defaults to GBK encoding, which corrupts UTF-8
# characters like the middle dot (·). Wrap stdout/stderr with UTF-8.
if sys.platform == "win32":
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except (FileNotFoundError, PermissionError, OSError):
        return ""


def _read_json(path: Path) -> dict:
    text = _read_text(path)
    if not text:
        return {}
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return {}


def _find_project_root() -> Path | None:
    current = Path.cwd()
    for parent in [current, *current.parents]:
        if (parent / ".comet" / "config.yaml").is_file():
            return parent
    return None


def _get_current_change(root: Path) -> dict | None:
    selection = _read_json(root / ".comet" / "current-change.json")
    name = selection.get("change")
    if selection.get("workflow") != "native" or not isinstance(name, str) or not name:
        return None
    try:
        result = subprocess.run(
            ["mise", "exec", "npm:@rpamis/comet@0.4.4", "--", "comet", "native", "status", name, "--json"],
            cwd=root, capture_output=True, text=True, timeout=3,
        )
        state = json.loads(result.stdout).get("data", {})
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, ValueError):
        return None
    if state.get("name") != name:
        return None
    return {"title": name, "phase": state.get("phase", "unknown"), "status": state.get("status", "unknown")}


def _count_active_changes(root: Path) -> int:
    changes = root / "docs" / "comet" / "changes"
    if not changes.is_dir():
        return 0
    return sum(1 for entry in changes.iterdir() if entry.is_dir() and (entry / "comet-state.yaml").is_file())


def _get_git_branch() -> str:
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, timeout=3,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""


def _format_ctx_size(size: int) -> str:
    if size >= 1_000_000:
        return f"{size // 1_000_000}M"
    if size >= 1_000:
        return f"{size // 1_000}K"
    return str(size)


def _format_duration(ms: int) -> str:
    secs = ms // 1000
    hours, remainder = divmod(secs, 3600)
    mins = remainder // 60
    if hours > 0:
        return f"{hours}h{mins}m"
    return f"{mins}m"


def _format_remaining(secs: int) -> str:
    if secs <= 0:
        return ""
    days, remainder = divmod(secs, 86400)
    hours, remainder = divmod(remainder, 3600)
    mins = remainder // 60
    if days > 0:
        return f"{days}d{hours}h"
    if hours > 0:
        return f"{hours}h{mins}m"
    return f"{mins}m"


def _parse_resets_at(value: object) -> int:
    """`resets_at` is epoch seconds (int/float, possibly stringified) or an
    ISO-8601 timestamp depending on Claude Code version. Return epoch
    seconds, or 0 when absent/unparseable (countdown is then omitted)."""
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and value:
        try:
            return int(float(value))
        except ValueError:
            pass
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return int(parsed.timestamp())
        except ValueError:
            pass
    return 0


def _rate_limit_part(label: str, window: dict, now: int) -> str:
    try:
        pct = int(float(window.get("used_percentage")))  # pyright: ignore[reportArgumentType]
    except (TypeError, ValueError):
        return ""
    part = f"{label} {pct}%"
    remaining = _format_remaining(_parse_resets_at(window.get("resets_at")) - now)
    if remaining:
        part += f" \033[90m(reset {remaining})\033[0m"
    return part


_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def _visible_len(s: str) -> int:
    """Length of s with ANSI escape sequences stripped."""
    return len(_ANSI_RE.sub("", s))


def _terminal_width() -> int | None:
    """Terminal width from the COLUMNS env var, or None.

    The statusline stdin JSON has no width field and stdout is a pipe, so
    the COLUMNS env var (injected by Claude Code v2.1.153+) is the only
    width signal. Absent or malformed values return None."""
    try:
        width = int(os.environ.get("COLUMNS", ""))
    except ValueError:
        return None
    return width if width > 0 else None


def main() -> None:
    # Read Claude Code session JSON from stdin
    try:
        cc_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, ValueError):
        cc_data = {}

    SEP = " \033[90m·\033[0m "

    # --- Project Native state ---
    root = _find_project_root()
    change = _get_current_change(root) if root else None
    change_count = _count_active_changes(root) if root else 0

    # --- CC session data ---
    model = cc_data.get("model", {}).get("display_name", "?")
    ctx_pct = int(cc_data.get("context_window", {}).get("used_percentage") or 0)
    ctx_size = _format_ctx_size(cc_data.get("context_window", {}).get("context_window_size") or 0)
    duration = _format_duration(cc_data.get("cost", {}).get("total_duration_ms") or 0)
    branch = _get_git_branch()

    # Avoid "Opus 4.6 (1M context) (1M)"
    if re.search(r"\d+[KMG]\b", model, re.IGNORECASE):
        model_label = model
    else:
        model_label = f"{model} ({ctx_size})"

    # Context % with color
    if ctx_pct >= 90:
        ctx_color = "\033[31m"
    elif ctx_pct >= 70:
        ctx_color = "\033[33m"
    else:
        ctx_color = "\033[32m"

    # Build info line: model · ctx · branch · duration · changes [· rate limits]
    parts = [
        model_label,
        f"ctx {ctx_color}{ctx_pct}%\033[0m",
    ]
    if branch:
        parts.append(f"\033[35m{branch}\033[0m")
    parts.append(duration)
    if change_count:
        parts.append(f"{change_count} change(s)")

    now = int(time.time())
    rate_limits = cc_data.get("rate_limits", {})
    rate_parts: list[str] = []
    for label, key in (("5h", "five_hour"), ("7d", "seven_day")):
        part = _rate_limit_part(label, rate_limits.get(key) or {}, now)
        if part:
            rate_parts.append(part)

    info_line = SEP.join(parts + rate_parts)

    # Output: selected change (only if available) + session information.
    if change:
        print(f"\033[36m[{change['phase']}]\033[0m {change['title']} \033[33m({change['status']})\033[0m")

    # Claude Code's status-bar height counts only "\n" characters, so a
    # visually wrapped long line misaligns rows. When the host provides a
    # terminal width and the info line would overflow, split the rate-limit
    # segments onto their own line with an explicit "\n" instead.
    width = _terminal_width()
    if width is not None and rate_parts and _visible_len(info_line) > width:
        print(SEP.join(parts))
        print(SEP.join(rate_parts))
    else:
        print(info_line)


if __name__ == "__main__":
    main()
