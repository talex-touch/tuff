# tuff-nexus-maintenance

The scheduled maintenance Worker for the Nexus Pages project. Pages Functions have no cron triggers;
this Worker calls `POST /api/internal/maintenance/<task>` on the Nexus origin on a schedule
(`wrangler.toml`), authenticated by the shared `MAINTENANCE_SECRET`.

Deploy (from this directory):

```sh
wrangler deploy
wrangler secret put MAINTENANCE_SECRET   # the same value as the Pages production secret
```

The Pages side keeps its traffic-triggered fallback: while this Worker runs, it holds the maintenance
leases ahead and traffic schedules nothing; if it stops, the leases lapse and traffic takes over again.
