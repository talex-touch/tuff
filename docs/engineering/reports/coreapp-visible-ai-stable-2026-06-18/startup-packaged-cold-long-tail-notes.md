# Packaged Cold Startup Long-Tail Notes

> Date: 2026-06-21
> Scope: `startup-packaged-cold` evidence for CoreApp `2.4.12-beta.8`.

## Summary

- Cold benchmark summary: `../startup-packaged-cold-runs-2026-06-21/汇总报告.md`
- Long-tail sample: 原第08次逐次运行报告已按 reports 卫生口径移除，长尾数据见汇总报告与本文件下方记录。
- Isolated userData sample: stored locally under ignored evidence, not committed.

## Result

- Packaged artifact version: `2.4.12-beta.8`
- Expected package version: `2.4.12-beta.8`
- Version match: yes
- Total cold runs: 10
- Pass count: 10
- Startup health P50: 572ms
- Startup health P95: 615ms
- Long-tail startup health: 615ms
- Long-tail renderer ready: 533ms
- WARN total: 0
- ERROR total: 0

## Notes

- Each cold run used a per-run isolated `userData` directory; raw profiles are local-only evidence.
- No WAL or startup-health warning was observed in the long-tail sample before the startup health marker.
- The long-tail sample remains comfortably below the 3500ms startup health budget.
