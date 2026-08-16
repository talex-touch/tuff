# Tuff v2.4.14-beta.10 Release Notes

## Summary Notes

- Typing in the search box returns results promptly again; background maintenance can no longer stall the app for seconds at a time.
- The sidebar's back row and search field keep their height when a long conversation or settings list is open.
- The focus ring no longer leaves a stray light halo around selected sidebar items.

## What's Changed

- Fixed the search box taking seconds to show results. The cause was not the search itself but background work blocking the main process: periodic tasks had no time limit and shared a single-slot queue, so one long sweep could hold up everything behind it, and telemetry uploads against an unreachable server cost one full timeout per queued item. Every periodic task now has an upper bound, and upload rounds stop instead of retrying an endpoint that is already down.
- Stopped a failing macOS foreground-app lookup from relaunching a doomed helper process every 1.5 seconds. Repeated timeouts now back off, while a single transient hang still retries immediately.
- Opening the launcher or typing no longer waits indefinitely on the app index. Waits that a user is sitting behind are now bounded and proceed with slightly older data rather than hanging, and the first batch of search providers runs wider so more of them land in the first frame.
- Fixed the sidebar's back row and search entry being squeezed to nothing by a long list below them. Only the history list gives ground now.
- Removed the outer band of the focus ring. On accent-filled surfaces the inner band blended into the fill and left the outer one reading as a stray halo rather than as focus.
