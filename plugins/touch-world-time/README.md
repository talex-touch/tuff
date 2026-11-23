# Touch World Time (`@talex-touch/touch-world-time-plugin`)

DST-aware World Clock covering 52 global cities & timezone aliases, natural-language timezone conversion, a Golden-Hours team meeting overlap planner, and persistent pinned cities.

## Triggers / 触发词

`wt`, `tz`, `world-time`, `worldtime`, `clock`, `timezone`, `meeting-time`, `世界时间`, `世界时钟`, `时区`, `会议时间`

## Capabilities / 功能一览

### 1. World Clock & 52 Global Cities / 全球城市实时时钟
- Leave the query empty to see your pinned clocks (defaults: Shanghai, Tokyo, London, New York, San Francisco, UTC) with live DST offsets, day/night indicator, and working-hours status.
- Search by city, country, IANA zone, Chinese name, or shorthand alias:
  - `tokyo`, `nyc`, `sf`, `london`, `berlin`, `sg`, `shanghai`, `sydney`, `utc`, `pst`, `est`, `cet`, `jst`, `东京`, `纽约`, `伦敦`, `旧金山`

### 2. Natural Time Conversion / 自然语言时区换算
- `14:00 PST to CST/UTC/Tokyo` → converts simultaneously into China CST (UTC+8), UTC, and Tokyo (JST), showing day rollover (`+1d` / `-1d`).
- `9:30am nyc to london, berlin, sg`
- `2pm sf in shanghai`
- `2026-07-15 15:00 london to nyc` (uses summer DST rules for the specified date)
- `18:00 utc` (converts against all pinned cities)

### 3. Golden-Hours Team Meeting Planner / 跨时区黄金会议时段
- `meet sf nyc london berlin` / `overlap tokyo shanghai sf` / `meeting london, nyc, sg`
- Type `meet` or `overlap` alone to plan across your currently pinned cities.
- Ranks contiguous working-hour windows (09:00–17:59 golden, 08:00/18:00–20:59 flexible), surfaces the best compromise windows when no strict overlap exists, and copies a shareable multi-timezone invite line.

### 4. Pinned Cities Persistence / 置顶城市管理
- Stored in `plugin.storage` (`world-time.json`, up to 16 cities).
- Use secondary action `pin-city` / `unpin-city` or type `pin <city>`, `unpin <city>`, `reset`.

## Permissions / 权限说明

- `storage.plugin` (required): Persist your pinned world clock cities locally.
- `clipboard.write` (optional): Copy formatted time conversions and meeting summaries (fail-closed when denied or unavailable).

## Testing

```bash
node -c index.js && node --test index.test.cjs
```
