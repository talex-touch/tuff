# Tuff v2.4.14-beta.11 Release Notes

## Summary Notes

- Desktop sign-in can now persist in short- or long-term mode and renew safely as access tokens approach expiry.
- The local Nexus publish, catalog install, and runtime permission paths have been verified for three official plugins.
- Catalog installation keeps actionable failure state instead of marking an incomplete install as usable.

## What's Changed

- Added renewable desktop sessions: access tokens remain short-lived, while refresh tokens determine a 30-day or 180-day sign-in window. Startup restoration, imminent expiry, and the first authentication failure coalesce into a single refresh; refresh tokens cannot call business APIs, and account disablement, device revocation, or a token-version change invalidates the session immediately.
- Completed Nexus publish-path verification for the official `clipboard-history`, `json-formatter`, and `touch-translation` plugins. Clipboard history observes read/write permission gates; the JSON formatter reports valid and invalid input clearly; translation reaches providers through the controlled network capability, with secrets excluded from ordinary plugin storage.
- Hardened Nexus catalog installation and CoreApp runtime boundaries: plugin-event and package-size contracts are enforced again, while an install or enablement failure retains the correct failed state instead of leaving a seemingly usable partial install.
- Corrected an obsolete Trellis task reference in the maintenance audit so the main-branch documentation gate only states claims verifiable from the committed task tree.
