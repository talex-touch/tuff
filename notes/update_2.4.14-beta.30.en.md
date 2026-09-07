# Tuff v2.4.14-beta.30 Release Notes

## Summary Notes

- OTA chunk downloads now use an idle timeout, so an update that keeps receiving data is not aborted merely because the full transfer exceeds 30 seconds.
- If a signed download URL returns HTTP 403 during the HEAD size probe, the task switches to its fallback URL before creating or resuming chunks.
- Download errors now normalize status, statusCode, and standard network status markers, so expired-URL recovery does not depend on one error shape.

## What's Changed

- Fixed macOS OTA chunk downloads repeatedly hitting a total-request timeout on slow or unstable links; app updates now allow at least a 120-second idle window and reset it whenever data arrives.
- Fixed signed URLs expiring during the file-size probe without a fallback path, preserving task-level fallback state for subsequent Range requests.
