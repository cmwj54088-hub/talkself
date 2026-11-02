# Development handoff

Read README.md, REQUIREMENTS.md and android/README.md first. The user wants an
Android-first, completely offline, WeChat-style personal notebook and task app.
Canonical editable source is dist/*.js, dist/style.css and android/app/src/.
Do not edit generated APK assets or a bundled standalone HTML as the source.

Read docs/PROJECT_STATUS.md for current decisions and pending clarifications;
record implemented changes in docs/CHANGELOG.md. Keep pending requests distinct
from approved behavior and verified releases. These two records live in docs/.
The active batch is docs/tasks/CHAT_RECORDS_AND_TASK_STREAM.md. Read it before changing
features in that batch and write back actual checks and handoff status there.
The previous batch and its delivery history remain in docs/tasks/OFFLINE_EXPERIENCE.md.
Read docs/TOOLCHAIN.md before building or running browser checks. It records
verified local SDK/JDK/Python/Node/browser paths and PowerShell commands;
reuse existing tools rather than rediscovering or downloading them each time.
For user-authorized new execution chats, explicitly use gpt-6.1-sol with medium
reasoning (the user's standing preference). Do not repeatedly ask for the same
model preference or silently substitute another model.

## Coordination and acceptance

The user adopted the applicable coordination rules from their V3.0 product-manager
prompt on 2026-11-02. Project-specific rules live here; do not require that external
desktop file or third-party reference repositories for routine development.

- A task is persistent; a chat is its current executor. Keep stable task IDs and
  one current owner. Follow-ups stay with that owner unless the user requests a
  new chat or an explicit handoff is recorded. Do not create replacement chats
  merely because a chat is idle or a tool call failed.
- Distinguish task states: pending, dispatched/awaiting acceptance, in progress,
  awaiting an answer, blocked, awaiting coordinator review, awaiting user
  acceptance, accepted, cancelled. Record evidence date, owner and next action;
  chat active/idle and delivery/send failures are separate facts.
- Default flow: scope and dispatch -> implementation/self-check -> saved handoff
  -> coordinator review -> user acceptance in the main coordination chat ->
  state writeback. An explicit acceptance of a particular scope/version in the
  development chat remains valid and must be synchronized, not requested again.
- Before dispatch save task scope, baseline, owner, acceptance steps and handoff
  path. Define who receives the report and how. Direct cross-chat messages need
  the user's corresponding authorization and tool support. Otherwise save the
  handoff in the task file for the coordinator to read; files do not notify chats
  by themselves. Do not imply persistent monitoring or add background automation.
- At delivery report type/status, task IDs, source commit, artifact/version/hash,
  installed/not installed, actual passed/failed/not-run checks, decisions,
  limitations and next action. The coordinator reads the handoff and relevant
  evidence, checks commit/artifact relationships and writes review/sync status
  before presenting concrete acceptance steps to the user.
- Re-read target files before writing and preserve others' updates. On recovery
  inspect existing dispatch, commits, dirty files and receipts before retrying.
  Separate request parameters from independently verified runtime settings.
- Reuse sufficient existing technical evidence when only documentation or Git
  ownership changes; do not rebuild unchanged artifacts just to repeat checks.
  Keep user acceptance, technical verification, merge, push and installation
  distinct. Never upgrade a known technical failure to a pass based on approval.
- Retain external toolchain paths, signing dependencies and actual delivered
  versions for reproducibility. Existence/hash checks are not verified backups
  or recovery rehearsals. Cleanup still needs explicit scoped authorization.

Preserve all requirements in REQUIREMENTS.md. There is no light mode, recording,
AI service, telemetry, remote font, CDN, cloud sync or account integration.
The Android manifest requests SET_ALARM for the separate system clock plus user-authorized POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM and RECEIVE_BOOT_COMPLETED for local date reminders.
It intentionally has no INTERNET permission. Do not add a network permission or
external runtime dependency. Saving a reminder time does not enable a system alarm.

Use the existing app ID local.ziyan.notes and signing certificate for updates.
Restore android/signing from the delivery ZIP's private/upgrade-signing.zip if
necessary. Never regenerate the upgrade key, print the signing password, or put
signing material in Git/public uploads. Signing tools take passwords from a file.
Only increment versionCode/versionName when preparing a new release.

IndexedDB name is ziyan-local-v1, schema version 2. New record fields use the
existing stores. JSON backup version is 3 and imports versions 1, 2 and 3.
Preserve original created timestamps and IDs when editing. Keep updates and
imports atomic; validate image references and all imported rich text.

Run `python3 tests/check_v5.py` with a localhost server on 4173. After APK
assembly run `python3 tests/check_native_adapter.py`. Relevant previous ink and
legacy checks are retained under tests/legacy/ for reference and must be adapted
to changed requirements before running them. Do not mistake historical failures
caused by superseded UI behavior for current acceptance criteria.

Build with `python3 android/build.py`. It uses local tools; initialize missing
tools with android/setup_toolchain.py (development download only). Normal build
disables WebView debugging. ZIYAN_ANDROID_QA=1 creates an internal diagnostic APK
only and must not be delivered as the release.

Do not claim Android device checks passed unless they actually did. The earlier
Android 15 software emulator could install the app, but its System UI and WebView
renderer failed without hardware acceleration; physical-device verification is
still separate from browser, bridge, signing and packaging checks.
