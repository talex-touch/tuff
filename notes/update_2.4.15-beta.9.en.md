# Tuff v2.4.15-beta.9 Release Notes

## Summary Notes

- Browser workspace (Beta): the top tab strip moved into the app shell. Tab actions on non-browser pages open the Browser page first, and tab errors appear on the strip.
- Miko desk pet: a roaming Miko joins the Home screen and can be turned off in Settings. Its state stays on this device and never records what you type.
- AI and local CLIs: some OpenAI models (the gpt-5.6 series, codex, and -pro) now use the Responses API, and local AI CLIs run only while their master switch is on.
- Accounts and security: an interrupted browser sign-in can be resumed or cancelled, and desktop sign-in waits are shorter. Plugins can no longer reach the host secure store or privileged capabilities.
- Search and index: cached results drop deleted files and uninstalled apps, and file-index parsing truncates output at its budget instead of failing.

## What's New

- Conversation spaces (Spaces): a new spaces sidebar, file permissions for conversations without a project, and a notice that temporary spaces are deleted when the app restarts.
- On Home, Miko walks along the top of the composer, rebounds when dropped, starts a mini-game on a triple click (Enter three times from the keyboard), and reacts to a few fixed keywords and the local time.
- Code blocks of html, svg, and xml in chat open in the side panel's Preview tab.

## What's Changed

- The default clipboard history shortcut is Alt+V on all three platforms.
- CoreBox footer hints now fit the bar width: hints that do not fit are dropped, and outcome messages use the full bar.
- Terminal output is paced by acknowledgements, so large output stays smooth.
- Image preview: a double-click zooms once around the pointer, and the zoom action text is localized.
- Import candidates for local AI CLIs: candidates the apply step rejects are hidden, and the choice survives rescans.
- Persistent pi sessions refuse a second turn while busy, bound their RPC waits, and escalate their close.
- Claude adaptive-only models no longer send a temperature parameter; reasoning effort is passed to Chat Completions through modelKwargs.
- The LangChain-based model providers moved to LangChain 1.x.
- Accounts without a sign-in method no longer receive long device grants, and renewals check the sign-in method.
- Windows packaged builds: fixed how the Everything SDK wrapper is resolved.
- File-index stats and enrichment run on the read worker, reducing main-process work.

## Known Limitations

- The browser workspace, including the tab strip, is still a Beta feature and is off by default. Its layout and drag region on macOS and Windows still need feedback.
- Miko's lazily loaded chunks were checked only in development builds, and its keyword reactions have not yet been checked on a real send.
