# Tuff v2.4.14-beta.35 Release Notes

## Summary Notes

- Fixed older search snapshots overwriting results during rapid updates.
- Improved search progress and failure feedback with an explicit retry action.
- Simplified Voice Insights headings and made yearly activity and reports available earlier.

## What's Changed

- Search snapshots, incremental results, and completion notifications are applied in arrival order, preventing disappearing results and stuck loading states.
- Replacing a query or leaving search promptly cancels requests still starting; failures from older requests no longer affect the current results.
- Recommendations that take longer to arrive remain deliverable instead of being cancelled by the presentation timeout.
- Prolonged searches show a compact progress indicator, while a failed current query offers a keyboard-accessible retry button.
- Streaming requests finish and release resources correctly even when completion arrives before the start acknowledgement.
- Voice Insights now uses one page heading and shows yearly activity and reports without requiring a month of records; weekly comparisons still appear after one week.
