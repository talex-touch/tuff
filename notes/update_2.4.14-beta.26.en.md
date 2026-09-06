# Tuff v2.4.14-beta.26 Release Notes

## Summary Notes

- This is the official follow-up to Beta25 after the signed Nexus download URL expiry fix.
- Official update assets retain the Nexus signed URL as the primary path and can resume the verified GitHub fallback after an HTTP 403 expiry.
- The fallback is limited to signed-URL expiry; unrelated permission failures remain fail-closed.

## What's Changed

- Carries forward the Beta25 bounded worker-pool scheduling and terminal-failure handling.
- Preserves partial ranged chunks when switching from an expired signed URL to the fallback asset.
- Enables the next official Beta25 → Beta26 OTA N→N+1 acceptance attempt.
- Does not relax checksum, detached-signature, release-gate, or startup health-ack requirements.
