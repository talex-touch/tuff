# Real TPEX Upload Acceptance - Implementation Plan

## Preconditions

- [ ] Package Policy, Security Scan, Signing Trust Chain and Nexus Display Gate are deployed to the selected environment.
- [ ] Operator confirms environment, channel, test identity and cleanup/retention policy.
- [ ] Credentials are available only through named environment variables with minimum scopes.
- [ ] Evidence collector/verifier is ready before the mutation.

## Run Checklist

1. [ ] Record environment health and prove deployed D1/R2 (or declared equivalent) with memory fallback disabled.
2. [ ] Select/create a dedicated acceptance plugin identity and unique SemVer/channel.
3. [ ] Clean build from canonical source; run strict validate, source audit, policy, scan and publisher signing.
4. [ ] Run `tuff publish --dry-run` and confirm the planned endpoint/identity/version/digest.
5. [ ] Run one real non-dry-run `tuff publish`; capture sanitized request/plugin/version/object ids.
6. [ ] Verify pending version exists in D1/timeline, object exists in R2, and public Store/download deny it.
7. [ ] Apply the approved review action for the selected environment; verify eligibility and intended channel visibility.
8. [ ] Download through the public/authorized Nexus route and byte-compare SHA-256/size.
9. [ ] Install through official CoreApp TPEX provider in a fresh isolated profile; verify identity/version and one minimal feature.
10. [ ] Retry duplicate upload and confirm no duplicate row/object; inspect orphan state.
11. [ ] Apply cleanup/retention policy and verify resulting D1/R2/timeline state.
12. [ ] Run strict evidence verifier.

## Verification Commands

Exact commands depend on the deployed environment and must be recorded in the evidence checklist without credentials. Required command classes:

```text
canonical plugin clean build/audit
tuff validate --strict
tuff publish --dry-run
tuff publish (non-dry-run)
Nexus authorized state/evidence collector
Nexus redownload digest verifier
CoreApp isolated-profile install smoke
plugin release strict evidence verifier
```

## Safety Gates

- Never print auth headers, tokens, cookies or private keys.
- Never use a personal production plugin identity for the test.
- Do not perform production RELEASE without explicit operator confirmation.
- Stop on environment ambiguity or memory fallback; mark blocked rather than substituting local evidence.

## Rollback/Cleanup

Use supported API/admin deletion or rejection flows. Confirm both metadata and object outcomes and retain timeline evidence. If cleanup cannot complete, report exact orphan ids as blockers without direct destructive database commands.
