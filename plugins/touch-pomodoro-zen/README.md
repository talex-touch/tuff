# Touch Pomodoro Zen (`touch-pomodoro-zen`)

Wall-clock focus timer, Pomodoro streak tracker, and guided micro-break coach for Tuff CoreBox.

## Features

- **Wall-Clock Persistent Focus Timer**: Start, pause, resume, complete, or reset focus and break sessions using wall-clock timestamps persisted in `plugin.storage` (`pomodoro-state.json`). Accurate across CoreBox dismissals, sleep, and plugin reloads.
- **Presets & Natural Custom Input**: Launch `25/5` Classic Pomodoro, `50/10` Deep Flow, `15/3` Quick Sprint, or custom sessions such as `pomo 15m Deep Work`, `pomo 45m Architecture RFC`, or `pomo 30/5 Ship Release`.
- **Daily & Weekly Focus Streak Tracker**: Tracks daily focus minutes, completed session counts, rolling 7-day focus minutes with a visual bar overview, current consecutive-day streak, and all-time longest streak — with one-click Markdown report copy.
- **Guided Micro-Break Coach**: Four evidence-based recovery cards you can start as timed micro-breaks or copy as checklists:
  - **20-20-20 Eye Rest** (20s / 1m)
  - **Hydrate & Posture Reset** (1m)
  - **Desk Mobility Stretch** (2m)
  - **4-4-4-4 Box Breathing** (2m)
- **Optional Completion Alerts**: Sends desktop alerts via `system.notification` only when permitted (fail-closed if denied or unavailable), without ever blocking timer state or stats persistence.

## Commands

Activate via `pomo`, `pomodoro`, `focus`, `zen`, `microbreak`, `番茄计时`, or `专注计时`:

- `pomo` — Live timer dashboard, presets, daily/weekly stats & micro-break cards
- `pomo 15m Deep Work` — Start a custom 15-minute focus session labeled "Deep Work"
- `pomo 50/10 Architecture` — Start a 50-minute focus session paired with a 10-minute break
- `pomo pause` / `pomo resume` / `pomo reset` / `pomo complete`
- `pomo break` / `pomo breathe` / `pomo eye` — Open guided micro-break cards
- `pomo stats` / `pomo streak` — Inspect daily/weekly focus minutes & copy Markdown report

## Permissions

- `storage.plugin` (required): Persist wall-clock timer state, focus minutes, streak history, and alert preferences.
- `system.notification` (optional): Send optional completion alerts when permitted.
- `clipboard.write` (optional): Copy focus reports and guided micro-break checklists.

## Testing

```bash
node -c index.js && node --test index.test.cjs
```
