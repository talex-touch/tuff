# Tuff v2.4.14-beta.47 Release Notes

## Summary Notes

- Reduce duplicate Nexus credit requests during startup and scan files only when the index source is eligible.
- Fix unreleased file-index connections and stale mutation leases during long-running sessions, reducing repeated scans and database lock contention.
- Reconcile update lifecycle state so stale attempts cannot interfere with a new update.
- Polish the plugin overview, home logo sizing, and tab layout.

## What's Changed

- Coalesce concurrent Nexus credit summary and read requests to avoid duplicate network work.
- Check index-source eligibility before startup scans and recover stale mutation leases for correct rescheduling.
- Upgrade libSQL to 0.18, migrate manual transactions, and stop transaction connections from accumulating.
- Reconnect contaminated index writers after SQLite busy-lock failures so later writes can recover.
- Reconcile stale UpdateService lifecycle attempts and classify SQLite errors more accurately.
- Refine plugin overview Markdown, home logo sizing, and tab layout details.
