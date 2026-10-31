# Confirmed behavior · 0.9.1

1. Each project has one persistent composer draft shared by message and task
   modes. Switching modes never clears or swaps the content. Projects have
   independent drafts. Older separate drafts merge without discarding text.
   Message Enter is a line break; task Enter starts the next task entry.
2. Tasks are independent records, never extra chat bubbles. Multiple non-empty
   lines can be saved together. Saving preserves the drawer's open/closed state.
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

18. Remove the diagnostic activity, UI and bridge. Receive one WeChat chat ZIP
    per share (Chat history.txt plus supported image/video files), preview with
    editable text, and save only on confirmation. Preserve the exported sender,
    original timestamps and order in the note body; creation time is import time.
    Keep inline images in the text note and video attachments as video records.
    Commit everything atomically into existing stores and v3 backups. Reject
    missing references, encrypted/corrupt ZIPs, unknown attachments and unsafe
    paths; enforce 200 MB per ZIP/file, 512 MB unpacked total, 256 entries and
    50,000 text characters. Do not infer missing sender/time from unmerged text.

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
    times, older backups default to none. Only SET_ALARM permission is added;
    no network, notification or exact-alarm scheduling permission is requested.
