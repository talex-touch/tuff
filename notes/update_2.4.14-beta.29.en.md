# Tuff v2.4.14-beta.29 Release Notes

## Summary Notes

- OTA downloads now switch every affected chunk to the fallback URL after a signed URL returns HTTP 403, resuming each current Range instead of retrying an expired URL.
- Completed ranges and task-level fallback state are preserved, so concurrent chunks reuse the fallback URL.
- Non-403 permission failures still remain fail-closed without URL switching.

## What's Changed

- Fixed concurrent OTA downloads where only the first failed chunk switched to fallback while other chunks kept requesting the expired signed URL; each chunk now reuses the task fallback and preserves its downloaded progress after a confirmed 403.
