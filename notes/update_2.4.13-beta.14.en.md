# Tuff v2.4.13-beta.14 Release Notes

## Highlights

- Pinned the packaged CoreApp executable name to `tuff`, preventing Linux AppImage and other targets from deriving invalid or inconsistent entry names from the scoped workspace package name.
- Preserved the real beta release identity so the Windows setup installer and `latest.yml` no longer rewrite `-beta.N` versions to `-SNAPSHOT.N`.
- Added version and architecture to the postprocessed macOS app ZIP name, allowing the release manifest and Nexus to identify the Apple Silicon package as `darwin/arm64` instead of falling back to x64.
- Kept the preferred download matrix aligned with the actual outputs: Windows x64 setup, macOS arm64 app ZIP, and Linux x64 AppImage.

## Validation

- GitHub Release and Nexus both resolve to `v2.4.13-beta.14`, and the three preferred platform assets are downloadable through the user-facing paths.
- GitHub and Nexus downloads produce identical SHA-256 values for all three preferred assets; the downloaded macOS arm64 ZIP also matches the manifest and GitHub digest.
- The downloaded macOS bundle version, arm64 Mach-O architecture, executable mode, and isolated-profile packaged runtime were verified; Settings, File Index diagnostics, and the required audit fields were visible.

## Known Limitations

- The published manifest does not satisfy the final release gate: Linux AppImage and deb entries duplicate `linux/x64`, and the workflow-prefixed filenames were rejected by the validator used for this release.
- GitHub and Nexus assets have no detached `.sig`/`.asc` sidecars, and the Nexus signing-key endpoint has no configured public key, so the update signature chain is incomplete.
- The macOS bundle is ad-hoc signed and has no TeamIdentifier; the native Gatekeeper trust chain did not pass. A passing runtime smoke does not make this release fully trusted.
- These limitations require a newly built and newly tagged release; the already-published `v2.4.13-beta.14` binaries will not be replaced in place.
