# Tuff v2.4.14-beta.9 Release Notes

## Summary Notes

- Plugin packages may now be up to 200MB, and each plugin's storage quota is raised to 100MB.
- The plugin store's top row can drag the window again instead of being a dead strip.
- Adds json-formatter as an official plugin, covering JSON formatting, minifying, validation, and conversion.

## What's Changed

- Raised the plugin archive limit from 30MB to 200MB and the expanded-size limit to 512MB, so a package can no longer be accepted on upload and then rejected on expansion; the per-plugin storage quota moves from 10MB to 100MB.
- Fixed the store header row not dragging the window. That row is the only drag handle the top of the main area has, and the tabs and source controls stay clickable.
- Onboarded the json-formatter plugin and removed the redundant build stack it carried over from its template; clipboard reads and writes now go through the plugin clipboard SDK and its permission gate.
- Build-time plugin security scanning accepts named waivers. A waiver is bound to the contents of the file it covers, stops applying the moment that file changes, and anything it does not name still blocks the build.
