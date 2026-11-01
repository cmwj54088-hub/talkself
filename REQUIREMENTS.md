# Confirmed behavior · 0.11.0

1. Each project has one persistent composer draft shared by message and task
   modes. Switching modes never clears or swaps the content. Projects have
   independent drafts. Older separate drafts merge without discarding text.
   Message Enter is a line break; task Enter starts the next task entry.
2. Tasks remain independent records and are fused with messages for project-stream
   display, sorted by original creation time and stable ID. Stream bubbles reference
   existing task IDs: no duplicated messages, migration or external re-import.
   Both new and historical tasks expose a completion control and strike-through,
   reversible in the stream; drawer/global list/garden/reminders share the same state.
   Multiple non-empty composer lines save as separate tasks; images attach to the
   first. Saving preserves drawer state and returns to note mode.
3. The project task drawer stays below the chat header. When expanded, its close
   control is at the list bottom. It collapses upward with a curtain animation.
   It shows incomplete tasks only; completing a task removes it immediately from
   this drawer without deleting it. Completed tasks remain on the global task page.
4. Task text is directly editable on tap. A full task editor additionally edits
   images and an optional due date. Creation time is generated automatically and
   never changes when editing. No default deadline. Dates expire at local day's
   end. The global task page sorts incomplete tasks by earliest deadline, overdue
   first, undated last; items due within three calendar days or overdue use red
   text. Completed tasks are not red. On the global task page, toggling completion does not move the row
   or reset the scroll position. Fresh navigation/filtering reapplies ordering.
5. Project avatars show the number of incomplete tasks in red badges; zero is
   hidden. Red is limited to these badges and deadline urgency. Otherwise use
   neutral black/grey surfaces, white/grey text and one WeChat green (#3cb474).
6. The chat initially renders the latest 60 records at the bottom without a
   smooth scroll from the top. Older records prepend with an anchored viewport.
   Late image loading stays pinned only until the user scrolls/interacts.
7. Home swipes switch Projects ↔ Tasks ↔ Settings with a follow-finger preview,
   completion transition and insufficient-distance rebound. Only content slides;
   the bottom navigation and its buttons stay fixed throughout the gesture and
   animation. In chat, right
   returns home and left opens handwriting. Form controls, media controls and
   editor canvases do not trigger navigation. Vertical scrolling stays vertical.
8. Project rows have a thin divider starting to the right of the avatar. No top
   English slogans. No light mode in this release.
9. Long press or right click shows a nearby dark, vertical context menu. Projects:
   pin/unpin, edit, delete. Text messages: copy, edit, select partial text, convert
   to task, delete. Images/videos: save/delete. Ink: edit, save preview/delete.
   Task context menus are available too. Partial text selection is a menu action.
10. Existing text-note edits use a full-page editor, not a small dialog. It supports
    body/heading, bold, ordered/unordered lists, undo/redo and inline local images.
    Images and paragraphs belong to one note; the independent chat image/video
    import remains. Editing preserves the original note ID and creation time.
    Editor drafts autosave. Existing-note Back also commits valid edits; new-note
    Back retains an unpublished editor draft. No audio recording or transcription.
11. Keep five-minute chat grouping: first record and cross-day show a centered
    date/time; later adjacent records show time only if their gap exceeds five
    minutes, not exactly five. Exact times remain available in task metadata.
12. Preserve earlier local media, search, project management, templates and
    multi-page vector handwriting (eraser, lasso, pressure where supported,
    undo/redo, paper types, pinch/pan, editable originals plus preview).
13. JSON full backups include messages, deadlines, task images, rich note images,
    all editable ink, templates and drafts. Import versions 1/2/3 with validation
    and atomic replacement. Reopening the same HTML in another browser plus
    importing a backup restores editable content. Never persist blob URLs.
14. Deliver a signed offline APK and complete editable/buildable source in a ZIP.
    Include setup instructions, dependency lock, tests, known limits and a private
    upgrade-signing backup so another AI can continue and sign compatible updates.
15. Notes can be forwarded from their context menu to another local project.
    Keep the original and create a new independent record with a new ID/time.
    Copy image/video files, rich-text image references, and editable handwriting
    originals atomically. Editing/deleting either project must not break the copy.
16. Home search supports keyword, project, type and inclusive local creation-date
    ranges. Project search supports keyword, type and dates. Show escaped matching
    snippets and record times; selecting a result locates and highlights the
    original, including older chat history. Completed task results open the
    global task page, preserving the incomplete-only project drawer.

17. Android system SEND / SEND_MULTIPLE receives plain text, links, images and
    videos; content-URI VIEW supports opening these types from other apps. Cold
    start and a running activity both show an independent preview with editable
    text, a destination project and explicit save/cancel. Preserve existing
    composer and editor drafts, including when cancelled or saving fails. Copy
    granted source URIs into private staging, enforce the existing 200 MB limit
    per attachment, and commit all records/media atomically to the existing
    storage and version 3 JSON backup. Pending previews survive reopening;
    committed batches cannot be replayed after interrupted staging cleanup.
    Remain offline with no added permissions or runtime dependency. WeChat/QQ
    require a system share/open entry. WeChat plain chat ZIP exports are supported
    as described below; mini-app/private formats remain unsupported. No accounts
    or chat database access.

18. Receive one WeChat plain chat ZIP per share. Combine exports split on explicit
    sender/timestamp headings, individual exports on explicit leading-dot entry
    markers; blank lines alone are never boundaries. Keep equal-sender/equal-time
    entries separate. Display origin.sender/time independently; missing values are
    null and visibly unknown. Preserve raw time strings without guessing timezone.
    origin also records format, batch, order and importedAt. Creation time is import
    sequence, independent of origin time. Inline image references and attached videos
    belong to the same original message, not extra send actions. Preview total count,
    at most 20 summaries per page, and edit the selected message. Unknown grammar or
    unreferenced media requires explicit whole-text fallback confirmation. Edited
    broken references reject the whole batch. Persist records/media/project/share
    marker atomically and prevent replay after interrupted native cleanup.
    Limits: ZIP/file 200MB, unpacked 512MB, 256 entries, transcript 8MB UTF-8,
    20000 original messages, 2000000 characters per original record, rich HTML
    16000000 characters. Never truncate or split on character count. Native staging
    parses ZIPs off the UI thread and streams transcript/media in 192KB chunks;
    frontend parsing/conversion yields between blocks. Long stream bodies collapse
    without changing their ID; editor/export/v3 restore accept the same limits.
    Keep schema 2 and backup v3, including validated origin and video references;
    accept old backups without these fields. Retain missing/unsupported archive
    checks, no private database access, diagnostics UI or runtime network.
19. Drawer animation, keyboard/viewport resize and late media preserve a bottom
    reader at the bottom and a historical reader at their visible message/line.
    Opening the drawer clips the chat from above without pushing visible text
    down; preserve its screen position throughout both drawer animations.
    Displayed messages and context menus suppress native selection; the explicit
    partial-selection view, inputs and editors retain normal selection. Real
    touch double-tap and desktop double-click open text/rich note editing without
    changing the original ID/time or interfering with media, long press or swipes.
20. Forwarding uses a full-screen searchable project picker, recent destinations
    and multiple selection. One confirmation creates independent copies of one
    note in every selected project, with one atomic transaction for all targets.
    Cancel/failure leave no partial copy; submissions cannot overlap.
21. Composer actions stay visible above the keyboard and are disabled when empty.
    Manual mode switches keep one draft per project; saving tasks returns to note
    mode only after a successful atomic task/draft commit. Full-page note and
    template editors use consistent dark headers, readable bodies and reachable
    completion controls in short viewports.
22. Optional reminderTime (HH:mm) is independent of dueDate. Project/global task
    rows, context menus and the full task editor expose system alarm creation.
    Saving a time does not claim an alarm is enabled. Opening the system clock
    passes time and bounded task label with confirmation UI; clock state is not
    read. Task completion/deletion, clearing the preference and backup restore do
    not alter system alarms. V3 backups retain validated task/editor reminder
    times, older backups default to none. The original system-clock interface uses SET_ALARM;
    no network permission is requested. Application reminders in item 24 add explicit notification/exact-alarm authorization.

23. Composer expansion opens the existing full-page note/task editor, using its
    header, body and reachable completion controls. Back preserves one project draft
    and images without sending. Shared composer draft snapshots retain task dates
    and reminder preferences across note/task modes; bottom sending also retains
    expanded rich content and images. Task mode offers relevant fields without note
    formatting controls. Existing-task edits retain ID/time/done state. Saving and
    draft clearing are atomic and guarded against duplicate completion.
24. Task reminders have optional local reminderDate, reminderTime and explicit
    reminderEnabled. Older backups default disabled, without inventing dates.
    Enabling a future single-shot application reminder requires notification and
    exact-alarm authorization; Android 13+ notification permission is requested
    only on user action. Android 12+ uses SCHEDULE_EXACT_ALARM special access.
    App alarms use notification sound, respecting notification channels, silent
    mode and DND; no full-screen alarm or guaranteed audible bypass is promised.
    Completion/deletion/clearing cancels application alarms. Reboot/timezone/time
    change restores future enabled tasks; past times are not replayed. System-clock
    alarms remain independent. Denied permissions preserve preferences without
    claiming scheduling. Android device behavior remains subject to verification.
25. Task rows expose reminder editing through the existing more menu and editor,
    with a concise summary instead of a repeated reminder action on every row.
26. Home header/navigation, ordinary projects and pinned projects use three dark
    neutral grey levels. Link cards derive only http/https URLs and domains from
    local text; native ACTION_VIEW with browser selector and explicit chooser
    opens externally. No INTERNET permission, web metadata request or remote WebView.
27. Project menus export chronological Markdown including task states and times.
    Sharing preview exports edited received text and files without first saving
    a project. Shared UTF-8 exporter returns .md or ZIP with relative attachments;
    missing/empty attachments fail. Rich styling downgrades to readable text;
    handwriting exports previews, not editable originals. JSON remains full backup.
28. Global tasks have one project filter combined with status. The top garden
    shows completed/total and percentage for that project or all projects, independent
    of status filter. Empty scope shows an empty garden and 暂无待办. Completion
    updates the garden without reordering rows. Double tapping Projects cycles
    through badge-bearing projects in list order and briefly highlights each.

29. Reminder permission and effectiveness status live in Settings: notification,
    channel, exact alarm access, scheduled future count and scheduling error.
    Task dialogs/editors direct missing permission to Settings, never request there.
    Denied notification prompts have an app-notification-settings fallback.
30. Project rows remain contiguous with subtle inset hairlines, no row gaps.
    Project task filtering has a searchable single-selection picker. Compact link
    cards truncate domain/path within bounded dimensions and retain full source URL.
31. Garden movement uses foreground task-page accelerometer samples, bounded spring
    animation and reduced-motion support. Stop sensor listening on pause/other pages;
    absent sensors leave a static garden. No new sensor permission or network.

32. Task context menus, including stream bubbles, reuse the multi-project forwarding
    picker with search/recents. Source remains unchanged. Every destination gets an
    independent new task ID/time, incomplete status, copied text/images/due date and
    reminder preferences with reminderEnabled=false. All destinations/media commit
    atomically; cancellation/failure leaves no partial copy. Derived bubbles never
    duplicate task counts in exports/backups. Imported notes with attached video are
    kept as notes when conversion to task cannot preserve those videos.
33. Android single clipboard copy is bounded at 200000 characters for system IPC;
    larger records remain editable/exportable and can use partial text selection.
