# Tuff v2.4.14-beta.27 Release Notes

## Summary Notes

- The Beta26 updater preserves Nexus-signed URLs as primary and switches once to the signed asset's GitHub fallback after HTTP 403 expiry while resuming the current ranged chunk.
- The release remains subject to checksum, detached-signature, and startup health acknowledgement gates.

## What's Changed

- Provides the official Beta26 → Beta27 acceptance pair after the signed URL recovery fix.
- Retains bounded ranged-download scheduling, terminal failure propagation, and cancellation handling.
- Does not relax update integrity or release quality requirements.
