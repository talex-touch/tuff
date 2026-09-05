# Tuff v2.4.14-beta.25 Release Notes

## Summary Notes

- This is the official follow-up to Beta24 for validating repaired macOS OTA download, replacement, and startup health acknowledgement.
- Large update downloads retain bounded worker-pool scheduling to avoid bursts of Range requests.
- Terminal chunk failure prevents queued work from being claimed and waits for in-flight lanes to settle.

## What's Changed

- Carries forward the Beta24 bounded-concurrency and terminal-failure download behavior.
- Provides a consecutive official Beta release for real Beta24 → Beta25 OTA N→N+1 acceptance.
- Does not relax signing verification, release gates, or health-ack requirements.
