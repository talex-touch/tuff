# Tuff v2.4.14-beta.40 Release Notes

## Summary Notes

- Folder projects: treat an existing directory as a project, run Local AI CLI work inside it, and continue the original native session across tasks, terminals, panel close and app restart — without copying or replaying provider transcripts.
- Voice providers now arrive as a signed cloud pack: endpoint, model list and limits can change from Nexus without a client release. The download is declarative parameters only — no executable code, no credentials — and is fetched only while signed in.
- The skill library reads the agent directories already on the machine (Codex, Claude Code) in place, so nothing has to be imported and an edit on disk lands on the next turn.
- The administrator console moved out of `/dashboard` into its own `/admin` layout with rail navigation.
- New TuffEx components: `TxIconMorph` for icon morphing and `TxIconPicker`. A model channel can now carry a user-picked icon, so two channels on the same adapter no longer draw the same glyph.

## What's Changed

- Projects and sessions: SQLite holds project metadata and local-only session pointers; provider transcripts stay in provider storage. A resume validates its pointer, live provider capability, and a process-wide lease — missing, conflicting, busy or unsupported state fails closed and never silently opens a fresh session. Archived projects keep their conversations and can be restored; Forget removes only Tuff's pointer.
- Voice: packs are verified against the pinned RSA trust root, with the AES-256-GCM envelope covering transport and at-rest confidentiality only. Pack limits may only tighten the local hard caps, and the built-in Nexus route still works when no pack is active. Signed out, status and local rollback remain available while a remote check is refused with `CATALOG_AUTH_REQUIRED` before any network call. Voice input is off by default and an activated pack cannot change that.
- Speech recognition: added an authenticated Qwen ASR egress relay, fixed parsing of modern Qwen response bodies, and bound `fetch` explicitly under Workers.
- Intelligence settings: capability prompts autosave on a 900 ms debounce and flush before the selection changes, so switching no longer drops an unsaved edit. Writes take an explicit capability id, closing a race that wrote one capability's prompt onto another.
- The workflows page moved behind Developer Mode. The route carries `requiresAdvanced` too, so it is unreachable by URL rather than merely unlisted.
- Interface: drawer slot content is deferred until first open; a closed drawer no longer paints a dark band down the window edge; number inputs no longer show native spin buttons; standalone busy indicators use `TxSpinner` and buttons use `TxButton`'s own loading state.
- Fixes: copied preview history is persisted; `PI_CLI_PROVIDER_ID` is forwarded through the type barrel (`export type *` carried only types, leaving the constant unreachable in the renderer); the icon picker demo uses a collection this app actually installs, having previously rendered as an empty box.
