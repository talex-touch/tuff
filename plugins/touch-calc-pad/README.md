# Touch Calc Pad (`@talex-touch/touch-calc-pad-plugin`)

Soulver-style natural math, percentage expressions, programmer base & bitwise arithmetic, unit conversions, transfer-time estimates, aspect ratios, and date math — built with a safe recursive-descent parser (zero `eval`, zero `new Function`) and local calculation history.

## Triggers / 触发词

`calc`, `calcpad`, `math`, `unit`, `conv`, `计算`, `算式`, `换算`

## Capabilities / 功能一览

### 1. Natural Math & Percentages / 自然语言数学与百分比
- `15% off 249` → `211.65` (savings `-37.35`)
- `249 + 13%` → `281.37` (`+32.37`)
- `20% of 1850` → `370`
- `45 as % of 180` → `25%`
- `% change from 80 to 100` → `+25%`
- `sqrt(144) + 2^10 - 3!` → `1030`
- `sin(rad(30)) + log10(1000)` → `3.5`

### 2. Programmer Bases & Bitwise Ops / 程序员进制与位运算
- `0xff & 0x0f` → `15` (`0xF`, `0b1111`, `0o17`)
- `(1 << 16) - 1` → `65535` (`0xFFFF`)
- `0b1101_0110 xor 0x0f` → `217` (`0xD9`)
- `255 to hex` / `0xff to bin` / `0o755 to dec`

### 3. Unit Conversions / 单位换算
- **Length**: `12.5 km to mi`, `180 cm to ft`, `5 in to mm`
- **Mass**: `72 kg to lb`, `16 oz to g`
- **Temperature**: `100 c to f`, `-40 f to c`, `25 c to k`
- **Data Size (SI & IEC)**: `2.5 GB to MiB`, `1024 KiB to MB`, `128 Mb to MB`
- **Speed / Area / Volume / Time**: `100 km/h to mph`, `3.5 h to min`

### 4. Transfer Time / 传输时间估算
- `2.5 GB at 80 Mbps` → `4m 10s` (`250 s`, `10 MB/s`)
- `10 GiB at 1 Gbps` → `1m 25.9s`

### 5. Aspect Ratio & Scaling / 分辨率比例
- `1920x1080` → `16:9` (`1.778`, `2.07 MP`, `Full HD 1080p`)
- `1920x1080 at width 1280` → `1280×720`
- `16:9 at 720h` → `1280×720`

### 6. Date Arithmetic / 日期计算
- `today + 45 days` / `today - 2 weeks` / `today + 10 workdays`
- `2026-01-15 + 3 months`
- `days between 2026-01-01 and 2026-12-31` → `364 days`

### 7. Local History / 本地历史
- Stored in `plugin.storage` (`calc-history.json`, up to 30 entries).
- Leave the query empty or type `history` / `历史` to view recent calculations; copy any result or clear history.

## Permissions / 权限说明

- `storage.plugin` (required): Save and load local calculation history.
- `clipboard.write` (optional): Copy results to the system clipboard (fail-closed if denied or unavailable).

## Testing

```bash
node -c index.js && node --test index.test.cjs
```
