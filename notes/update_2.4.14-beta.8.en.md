# Tuff v2.4.14-beta.8 Release Notes

## Summary Notes

- Appearance settings are visible again, including theme materials, wallpapers, accent colors, and motion options.
- CoreBox recommendations once again show each application's real icon instead of a shared empty placeholder.
- Local resource access remains least-privilege and exposes only the dedicated application-icon cache directory.

## What's Changed

- Fixed the appearance page nesting `ThemeStyle` as a standalone page shell, which prevented its settings content from rendering correctly.
- Fixed the `tfile` resource protocol omitting the `app-icons` cache path and rejecting application icon requests; neighboring cache directories remain inaccessible.
