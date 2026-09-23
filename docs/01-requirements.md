# Task Tracker — Requirements & Acceptance Criteria

**Station:** 1 — Requirements
**Source of truth:** `Task Tracker.pdf` (Product Requirements Document: Task Tracker, Status: Approved, Owner: chikkannasharath@gmail.com, Last updated: 2026-09-11)
**Artifact status:** Derived — this document restates and makes testable the approved PRD. It introduces no new product behavior.
**Last updated:** 2026-09-23

---

## 0. How to read this document

| Element | Meaning |
| --- | --- |
| `FR-0xx` | Functional requirement, carried over verbatim in intent from the PRD. All are **Must**. |
| `AC-0xx.y` | A testable acceptance criterion that, together with its siblings, fully verifies its parent `FR-0xx`. |
| `NFR-xxx` | Non-functional requirement from the PRD's "Non-functional requirements" section. |
| `NG-xx` | An explicit non-goal. Building it is out of scope and counts as a defect of scope. |
| `J1`–`J4` | The four approved user journeys. |
| `OQ-xx` | A gap the PRD leaves open. **Not** a decision — recorded here so Station 2 resolves it deliberately. |

**Rules of precedence.** Where this document and the PDF appear to disagree, the PDF wins and this document is corrected. Nothing here may add product behavior not present in the PDF; anything not stated by the PDF is logged as an `OQ-xx` rather than assumed.

---

## 1. Product summary

Task Tracker is a standalone, client-side web application for keeping one person's personal to-do list. It is deliberately the inverse of a team tool: there is no account, no sign-in, and no server. The user opens the page and begins capturing tasks immediately; tasks persist in the browser on that one device and are present, unchanged, on the next visit.

**Problem being solved.** People who want to track personal to-dos are forced into tools built for teams, where account creation, sign-in, and shared workspaces add friction before a single task is captured. There is no lightweight place to jot down tasks, mark them done, and have them still be there next time the same browser is opened, without setup cost.

### 1.1 Target user

| Persona | Context | Need |
| --- | --- | --- |
| Individual user | Using a single browser on a single device to manage their own to-dos | Capture, track, and complete personal tasks with zero setup |

This is the only persona. There is no administrator, no collaborator, and no second role.

### 1.2 Desired outcomes

| ID | Outcome |
| --- | --- |
| DO-1 | A user can start recording tasks within seconds of opening the app, with no sign-up or login step. |
| DO-2 | A user can tell at a glance which tasks are still open and which are done. |
| DO-3 | A user's tasks are still present, unchanged, the next time they open the app in the same browser. |

### 1.3 Success measures

| Measure | Baseline | Target | Evaluation period |
| --- | --- | --- | --- |
| Time from app open to first task created (new user) | N/A (no existing tool) | Under 15 seconds | First 30 days after launch |
| Task data loss reports (same-device reload) | N/A | Zero confirmed reports | First 30 days after launch |

These are post-launch product measures, not build-time test gates. `NFR-PERF-001` and `NFR-REL-001` are the build-time expressions of them.

---

## 2. Domain model (descriptive, not architectural)

The PRD fixes the task's attributes exactly. This section names them so acceptance criteria can refer to them precisely. It prescribes no storage format, type system, or implementation.

| Attribute | Required | Values | Source |
| --- | --- | --- | --- |
| Title | **Yes** | Free text, non-empty | FR-001, FR-009 |
| Due date | No | A calendar date, or absent | FR-002 |
| Priority | No | Exactly one of `Low`, `Medium`, `High`, or absent | FR-003, Decision "Priority levels" |
| Status | Yes | `active` (not done) or `completed` | FR-004, FR-007 |

The PRD confirms this list is closed: *"In-scope task attributes are limited to title, due date, priority, and complete/incomplete status (confirmed); notes/description are explicitly excluded."* No other attribute may be surfaced to the user. Internal identifiers or timestamps needed to satisfy a requirement are an implementation concern for Station 2, not user-facing product behavior.

**Terminology.** "Active" and "not-done" are the same state. "Completed" and "done" are the same state. A task is always in exactly one of the two.

---

## 3. User journeys

Each journey is reproduced from the PRD, with the observable outcome stated as the pass condition. All four are marked **UI impact: Yes / Service boundary: No** in the PRD — there is no service layer in scope.

### J1 — Capture a new task

1. User opens the app, with or without existing tasks present.
2. User enters a task title (and, optionally, a due date and/or priority) and submits.
3. The system adds the task to the active list immediately, without a page reload.
4. **Observable outcome:** the new task appears in the active task list with the entered title and any optional attributes.

*Covers:* FR-001, FR-002, FR-003, FR-009, FR-010.

### J2 — Complete or reopen a task

1. User has one or more tasks in their list.
2. User marks an active task as complete (e.g., via a checkbox).
3. The system updates the task's status and moves it out of the active view.
4. **Observable outcome:** the task appears in the completed view and no longer appears in the active view. Reversing the action (marking complete as incomplete) restores it to the active view.

*Covers:* FR-004, FR-007, FR-010.

### J3 — Edit or delete a task

1. User has an existing task, active or completed.
2. User edits the task's title, due date, or priority, or chooses to delete it.
3. The system applies the change (or removal) immediately.
4. **Observable outcome:** the task list reflects the updated title/due date/priority, or the task is no longer present anywhere in the list after deletion.

*Covers:* FR-002, FR-003, FR-005, FR-006, FR-010.

### J4 — Return to the app later

1. User previously created tasks and closes the browser tab or the browser itself.
2. User reopens the app in the same browser on the same device.
3. The system loads the previously saved tasks without any user action.
4. **Observable outcome:** all previously created tasks appear with the same titles, statuses, due dates, and priorities as when the user left.

*Covers:* FR-008.

---

## 4. Functional requirements and acceptance criteria

All ten requirements are priority **Must**. There is no lower tier; the full set is the v1 bar.

---

### FR-001 — Create a task with a required title

> User can create a task with a required title. *(Journey 1)*

| ID | Acceptance criterion |
| --- | --- |
| AC-001.1 | **Given** the app is open, **when** the user enters a non-empty title and submits, **then** a task with exactly that title is added to the list. |
| AC-001.2 | **Given** a task has just been created, **then** it appears in the **active** view (a newly created task is never created as completed). |
| AC-001.3 | **Given** a task has just been created, **then** it appears without a full page reload (J1 step 3). |
| AC-001.4 | **Given** the user submitted a title, **then** the title is stored and displayed exactly as entered, with no truncation or alteration of its visible content. |
| AC-001.5 | **Given** a task was created with only a title, **then** its due date and priority are absent, and the task is valid in that state. |
| AC-001.6 | **Given** a task has been created, **when** the user creates another task with an identical title, **then** both tasks exist independently (titles are not unique keys). |
| AC-001.7 | **Given** the app has just been opened for the first time with no stored tasks, **then** the user can create a task without any sign-up, login, or other setup step (DO-1). |

---

### FR-002 — Optional due date, at creation or via edit

> User can optionally set a due date on a task at creation or via edit. *(Journeys 1, 3)*

| ID | Acceptance criterion |
| --- | --- |
| AC-002.1 | **Given** the create form, **when** the user supplies a due date along with a title and submits, **then** the created task carries that due date. |
| AC-002.2 | **Given** the create form, **when** the user supplies no due date, **then** the task is created successfully with no due date (due date is optional, never blocking). |
| AC-002.3 | **Given** an existing task with no due date, **when** the user edits it and sets a due date, **then** the task thereafter carries that due date. |
| AC-002.4 | **Given** an existing task with a due date, **when** the user edits it and changes the due date, **then** the new value replaces the old. |
| AC-002.5 | **Given** an existing task with a due date, **when** the user edits it and clears the due date, **then** the task returns to having no due date and is sorted last per FR-010. |
| AC-002.6 | **Given** a task's due date was set, **then** the same due date is shown after reload (FR-008 interaction). |
| AC-002.7 | **Given** a task with a due date and a task without one, **then** both are valid, displayable states — absence of a due date is never rendered as an error. |

---

### FR-003 — Optional priority, at creation or via edit

> User can optionally set a priority (e.g., low/medium/high) on a task at creation or via edit. *(Journeys 1, 3)*

Per the approved decision "Priority levels", the scale is fixed at exactly **Low / Medium / High**.

| ID | Acceptance criterion |
| --- | --- |
| AC-003.1 | **Given** the create form, **when** the user selects a priority and submits, **then** the created task carries that priority. |
| AC-003.2 | **Given** the create form, **when** the user selects no priority, **then** the task is created successfully with no priority. |
| AC-003.3 | **Given** the priority control, **then** the only selectable values are Low, Medium, and High — no fourth level is offered. |
| AC-003.4 | **Given** an existing task, **when** the user edits it and sets or changes the priority, **then** the new value replaces the previous one. |
| AC-003.5 | **Given** an existing task with a priority, **when** the user edits it and clears the priority, **then** the task returns to having no priority. |
| AC-003.6 | **Given** a task carries a priority, **then** that priority is visible to the user in the task list without opening an edit view (DO-2 legibility). |
| AC-003.7 | **Given** tasks of differing priority, **then** priority does **not** change list order — the default order is due date ascending only (see FR-010 and `OQ-03`). |

---

### FR-004 — Mark a task complete, and reopen a completed task

> User can mark a task complete and reopen a completed task. *(Journey 2)*

| ID | Acceptance criterion |
| --- | --- |
| AC-004.1 | **Given** an active task, **when** the user marks it complete, **then** its status becomes completed. |
| AC-004.2 | **Given** a task was just marked complete, **then** it no longer appears in the active view and does appear in the completed view (J2 step 4). |
| AC-004.3 | **Given** a completed task, **when** the user marks it incomplete, **then** its status returns to active and it reappears in the active view. |
| AC-004.4 | **Given** a status toggle in either direction, **then** the task's title, due date, and priority are unchanged. |
| AC-004.5 | **Given** a status change, **then** the UI reflects it without a page reload and within the latency bound of `NFR-PERF-001`. |
| AC-004.6 | **Given** a status change, **when** the app is subsequently reloaded, **then** the task retains the status it was left in (FR-008 interaction). |
| AC-004.7 | **Given** the completed view, **then** a completed task is visually distinguishable as done, satisfying "tell at a glance" (DO-2). |

---

### FR-005 — Edit an existing task's title, due date, and priority

> User can edit an existing task's title, due date, and priority. *(Journey 3)*

| ID | Acceptance criterion |
| --- | --- |
| AC-005.1 | **Given** an existing task, **when** the user edits its title to a new non-empty value, **then** the list shows the updated title. |
| AC-005.2 | **Given** an existing task, **then** title, due date, and priority are each editable (all three attributes, not a subset). |
| AC-005.3 | **Given** an edit is applied, **then** the change is reflected immediately without a page reload (J3 step 3). |
| AC-005.4 | **Given** an edit that changes the due date, **then** the task's position in the list is re-evaluated against FR-010 ordering. |
| AC-005.5 | **Given** an edit is applied, **when** the app is reloaded, **then** the edited values persist (FR-008 interaction). |
| AC-005.6 | **Given** an edit in progress, **when** the user clears the title to empty and attempts to save, **then** the edit is rejected with a visible validation message and the task retains its previous title (FR-009 extends to edit — a task can never come to have an empty title). |
| AC-005.7 | **Given** a **completed** task, **then** it is editable on the same terms as an active task (J3 step 1: "active or completed"), and editing it does not change its completed status. |

---

### FR-006 — Delete a task

> User can delete a task. *(Journey 3)*

| ID | Acceptance criterion |
| --- | --- |
| AC-006.1 | **Given** an existing task, **when** the user deletes it, **then** it is removed immediately without a page reload. |
| AC-006.2 | **Given** a task was deleted, **then** it is absent from **both** the active and completed views ("no longer present anywhere in the list", J3 step 4). |
| AC-006.3 | **Given** a task was deleted, **when** the app is reloaded, **then** the task does not reappear. |
| AC-006.4 | **Given** a task was deleted, **then** all other tasks are unaffected in content, status, and relative order. |
| AC-006.5 | **Given** a **completed** task, **then** it can be deleted on the same terms as an active task. |
| AC-006.6 | **Given** the last remaining task is deleted, **then** the app renders an empty list without error. |

*Whether deletion is preceded by a confirmation step is not specified by the PRD — see `OQ-04`.*

---

### FR-007 — View active tasks separately from completed tasks

> User can view active (not-done) tasks separately from completed tasks. *(Journey 2)*

| ID | Acceptance criterion |
| --- | --- |
| AC-007.1 | **Given** a mix of active and completed tasks, **then** the user can view the active tasks without completed tasks mixed into that view. |
| AC-007.2 | **Given** a mix of active and completed tasks, **then** the user can view the completed tasks. |
| AC-007.3 | **Given** any task, **then** it is classified into exactly one of the two views at any moment, per its status. |
| AC-007.4 | **Given** a status toggle, **then** the task moves between the two views immediately, with no reload and no manual refresh. |
| AC-007.5 | **Given** a view containing no tasks, **then** that view renders an empty state rather than an error or a blank crash. |
| AC-007.6 | **Given** the filter controls, **then** they are keyboard-operable and carry accessible labels (`NFR-A11Y-001`). |
| AC-007.7 | **Given** either view, **then** the tasks shown within it obey the FR-010 default ordering. |

*Which view the app opens on, and whether a combined "all" view also exists, are not specified by the PRD — see `OQ-05`.*

---

### FR-008 — Persistence in the browser, reloaded automatically

> All task data persists in the browser and reloads automatically on return visits, on the same device/browser. *(Journey 4)*

| ID | Acceptance criterion |
| --- | --- |
| AC-008.1 | **Given** tasks were created, **when** the page is reloaded, **then** all tasks reappear with identical titles, statuses, due dates, and priorities (J4 step 4). |
| AC-008.2 | **Given** tasks were created, **when** the browser is fully closed and reopened to the app on the same device, **then** all tasks reappear identically. |
| AC-008.3 | **Given** stored tasks exist, **then** they load automatically on open, with **no** user action required — no import, unlock, or restore step (J4 step 3). |
| AC-008.4 | **Given** any create, edit, status toggle, or delete, **then** that change is durably persisted, not held only in memory. |
| AC-008.5 | **Given** no tasks have ever been created in this browser, **then** the app opens to an empty list without error. |
| AC-008.6 | **Given** the stored data is corrupted or unreadable, **then** the app degrades to an empty task list rather than crashing (`NFR-SUP-001`). |
| AC-008.7 | **Given** all persistence operations, **then** no task data is transmitted off the device (`NFR-SEC-001`). |

*Cross-device and cross-browser access is `NG-02` — persistence is expected to be scoped to one browser on one device, and loss on clearing browser data is an accepted, disclosed risk.*

---

### FR-009 — Empty title rejected with a visible validation message

> Task creation is rejected with a visible validation message if the title is empty. *(Journey 1)*

| ID | Acceptance criterion |
| --- | --- |
| AC-009.1 | **Given** the create form with an empty title, **when** the user submits, **then** no task is created. |
| AC-009.2 | **Given** that rejection, **then** a validation message is **visibly** displayed to the user — silent failure is a defect. |
| AC-009.3 | **Given** that rejection, **then** any due date or priority the user had already entered is not silently discarded in a way that forces re-entry from scratch. |
| AC-009.4 | **Given** a title consisting only of whitespace, **then** it is treated as empty and rejected on the same terms (a whitespace-only title is not a "required title" in any meaningful sense). |
| AC-009.5 | **Given** a validation message is displayed, **when** the user then supplies a valid title and submits, **then** the task is created and the validation message is cleared. |
| AC-009.6 | **Given** a validation message is displayed, **then** it is announced to assistive technology and associated with the title field (`NFR-A11Y-001`). |

*AC-009.4 reads "empty" as including whitespace-only. This is an interpretation of "required title", recorded as `OQ-06`; if Station 2 or the PRD owner disagrees, this document is corrected.*

---

### FR-010 — Default sort by due date ascending, no-due-date last

> Tasks are sorted by due date ascending by default (soonest first), with tasks lacking a due date sorted last. *(Journeys 1, 2, 3)*

| ID | Acceptance criterion |
| --- | --- |
| AC-010.1 | **Given** several tasks with due dates, **then** they are displayed soonest-first. |
| AC-010.2 | **Given** a mix of tasks with and without due dates, **then** every task lacking a due date appears after every task having one. |
| AC-010.3 | **Given** a new task is created, **then** it is inserted at its correct sorted position — not appended to the end regardless of due date. |
| AC-010.4 | **Given** a task's due date is edited, **then** the list re-sorts to the correct order immediately. |
| AC-010.5 | **Given** the ordering rule, **then** it applies within the active view and within the completed view alike (FR-010 is cited against Journeys 1, 2 and 3). |
| AC-010.6 | **Given** a due date in the past, **then** it sorts ahead of nearer-future due dates by the same ascending rule — overdue tasks are not special-cased (the PRD defines no overdue behavior). |
| AC-010.7 | **Given** the app is reloaded, **then** the same ordering is reproduced. |

*Tie-breaking between two tasks sharing a due date, and ordering among no-due-date tasks, are not specified — see `OQ-01` and `OQ-02`. The word "by default" implies no alternative sort is in scope for v1; user-selectable sorting is not a stated goal.*

---

## 5. Non-functional requirements

Each is stated with how it will be verified. The PRD's wording is preserved.

### NFR-A11Y-001 — Accessibility

> All interactive elements (add task, complete checkbox, edit, delete, filter controls) must be keyboard-operable and have accessible labels.

| ID | Acceptance criterion |
| --- | --- |
| AC-A11Y.1 | Every named control — add task, complete checkbox, edit, delete, filter controls — is reachable and operable using the keyboard alone, with no pointer required for any journey. |
| AC-A11Y.2 | Every such control exposes an accessible label that identifies both its action and the task it acts on, so that "delete" is not ambiguous among many tasks. |
| AC-A11Y.3 | Keyboard focus is visible at all times while tabbing through the interface. |
| AC-A11Y.4 | All four user journeys (J1–J4) are completable keyboard-only, end to end. |
| AC-A11Y.5 | The FR-009 validation message is perceivable to assistive technology, not conveyed by color or position alone. |

### NFR-SEC-001 — Security / privacy

> No task data leaves the user's browser; nothing is transmitted to a server. No personal data is collected.

| ID | Acceptance criterion |
| --- | --- |
| AC-SEC.1 | The application issues no network request carrying task data — inspecting network traffic during all four journeys shows none. |
| AC-SEC.2 | No analytics, telemetry, or tracking collects personal data. |
| AC-SEC.3 | No account, profile, email address, or other personal identifier is requested or stored (reinforces `NG-01`). |

### NFR-PERF-001 — Performance

> Creating, editing, completing, or deleting a task reflects in the UI in under 100ms perceived latency (no network round trip).

| ID | Acceptance criterion |
| --- | --- |
| AC-PERF.1 | Create, edit, complete/reopen, and delete each reflect in the UI in under 100ms perceived latency. |
| AC-PERF.2 | No operation in any journey depends on a network round trip. |
| AC-PERF.3 | The latency bound holds at a realistic list size; because v1 assumes an unbounded list (`OQ-07`), the size at which it is validated must be stated by the test. |

### NFR-REL-001 — Reliability

> A browser crash or unintentional tab close must not lose previously saved tasks; only data entered and not yet saved by the persistence mechanism may be at risk.

| ID | Acceptance criterion |
| --- | --- |
| AC-REL.1 | After an abrupt tab close or browser termination, all tasks saved before that moment are present on reopening. |
| AC-REL.2 | Only input entered but not yet committed by the persistence mechanism may be lost; committed changes may not. |
| AC-REL.3 | Persistence is not deferred to page-unload alone, since an unload handler is not guaranteed to run on a crash. |

### NFR-SUP-001 — Supportability

> Corrupted or unreadable local storage must degrade to an empty task list rather than crashing the app.

| ID | Acceptance criterion |
| --- | --- |
| AC-SUP.1 | Given stored data that is malformed, truncated, or of an unrecognized shape, the app starts and presents an empty, usable task list. |
| AC-SUP.2 | Given storage that is unavailable or unreadable (for example, blocked by browser settings), the app does not crash and remains usable within the session. |
| AC-SUP.3 | After degrading, the user can immediately create new tasks — the app is not left in a permanently broken state. |

---

## 6. Non-goals

These are out of scope for v1. Implementing one is a scope defect, not a bonus.

| ID | Non-goal |
| --- | --- |
| NG-01 | User accounts, sign-in, or authentication of any kind. |
| NG-02 | Syncing or accessing tasks from more than one device or browser. |
| NG-03 | Sharing tasks or workspaces with other users, or assigning tasks to anyone else. |
| NG-04 | Projects, boards, tags, or any grouping of tasks beyond a single personal list. |
| NG-05 | Notes or free-text descriptions on a task beyond its title. |
| NG-06 | Notifications or reminders for due dates. |
| NG-07 | Offline conflict resolution or multi-tab consistency guarantees. |

**Consequence of NG-07:** two tabs open on the app simultaneously may overwrite each other's stored state. Per the PRD this is accepted behavior for v1, not a defect.

---

## 7. Constraints and assumptions

### 7.1 Verified constraints (confirmed decisions, 2026-09-11)

| ID | Constraint |
| --- | --- |
| C-01 | No backend, account system, or API contract is in scope for v1 — local storage only, no login. |
| C-02 | Scope is a single user's personal task list, not a team or multi-user workspace. |
| C-03 | In-scope task attributes are limited to title, due date, priority, and complete/incomplete status; notes/description are explicitly excluded. |
| C-04 | Priority is a fixed three-level scale: Low, Medium, High. |
| C-05 | Default task list order is by due date ascending (soonest first), with no-due-date tasks last. |
| C-06 | Single-stage rollout as a standalone client-side web app. No migration is required — there is no prior version or stored data format to preserve. Rollback is reverting the deployed build; no server-side state exists to roll back. |

### 7.2 Assumptions requiring validation

| ID | Assumption |
| --- | --- |
| A-01 | Browser `localStorage` (or an equivalent client-side persistence API) is sufficient to meet FR-008. **No minimum browser support matrix has been specified.** |
| A-02 | No maximum task list size or archiving behavior for completed tasks has been specified; assumed unbounded for v1 unless UX/technical design surfaces a practical limit. |

### 7.3 Risks accepted by the PRD

| Risk | Impact | Mitigation (per PRD) |
| --- | --- | --- |
| Local-only persistence means clearing browser data or switching browsers/devices permanently loses all tasks | User data loss, no recovery path | Non-goal is explicit and disclosed; revisit account/sync in a future PRD if user feedback demands it |
| No due-date reminders may reduce usefulness for time-sensitive tasks | Lower perceived value | Explicitly scoped as a non-goal for v1; can be reconsidered in a later iteration |

---

## 8. Open questions for Station 2

The PRD records **no outstanding blocking questions** — priority levels and default sort order were resolved on 2026-09-11, and all four approval checkboxes are checked. The items below are therefore **non-blocking**: each is a point the PRD does not specify, surfaced so that design resolves it deliberately rather than by accident. None of them changes the approved scope, and none is decided here.

| ID | Question | Why it matters | Default if unresolved |
| --- | --- | --- | --- |
| OQ-01 | How are two tasks with the **same** due date ordered relative to each other? | FR-010 gives only the primary sort key; without a tie-break, order can vary between renders and violate AC-010.7. | A stable, deterministic tie-break, so ordering is reproducible across reloads. |
| OQ-02 | How are tasks **without** a due date ordered among themselves? | FR-010 places them last as a group but does not order the group. | Stable and deterministic, as OQ-01. |
| OQ-03 | Does priority influence ordering at all? | Decision "Default task list order" names due date only; this document reads priority as display-only (AC-003.7). | Priority does not affect sort. |
| OQ-04 | Does deletion require a confirmation step? | J3 says the change applies "immediately"; the PRD names no confirmation, and none is implied. Deletion is irreversible and there is no undo in scope. | Follow the PRD literally: immediate deletion, no confirmation. |
| OQ-05 | Which view does the app open on, and does a combined "all tasks" view exist? | FR-007 requires the two views be separable but does not name a landing view. | Open on the active view, since DO-1 and DO-2 centre on capturing and seeing open work. |
| OQ-06 | Is a whitespace-only title treated as empty? | FR-009 says "empty"; AC-009.4 reads whitespace-only as empty. Affects whether blank-looking tasks can exist. | Treat whitespace-only as empty and reject it. |
| OQ-07 | What is the minimum browser support matrix, and is there a practical list-size limit? | Restates A-01 and A-02, which the PRD flags as assumptions requiring validation. Needed to make `AC-PERF.3` measurable. | Modern evergreen browsers; unbounded list for v1. |

---

## 9. Traceability

### 9.1 Requirement → journey → acceptance criteria

| Requirement | Journeys | Acceptance criteria | Priority |
| --- | --- | --- | --- |
| FR-001 | J1 | AC-001.1 – AC-001.7 | Must |
| FR-002 | J1, J3 | AC-002.1 – AC-002.7 | Must |
| FR-003 | J1, J3 | AC-003.1 – AC-003.7 | Must |
| FR-004 | J2 | AC-004.1 – AC-004.7 | Must |
| FR-005 | J3 | AC-005.1 – AC-005.7 | Must |
| FR-006 | J3 | AC-006.1 – AC-006.6 | Must |
| FR-007 | J2 | AC-007.1 – AC-007.7 | Must |
| FR-008 | J4 | AC-008.1 – AC-008.7 | Must |
| FR-009 | J1 | AC-009.1 – AC-009.6 | Must |
| FR-010 | J1, J2, J3 | AC-010.1 – AC-010.7 | Must |
| NFR-A11Y-001 | All | AC-A11Y.1 – AC-A11Y.5 | Must |
| NFR-SEC-001 | All | AC-SEC.1 – AC-SEC.3 | Must |
| NFR-PERF-001 | All | AC-PERF.1 – AC-PERF.3 | Must |
| NFR-REL-001 | J4 | AC-REL.1 – AC-REL.3 | Must |
| NFR-SUP-001 | J4 | AC-SUP.1 – AC-SUP.3 | Must |

### 9.2 Journey → requirement coverage

| Journey | Requirements exercised |
| --- | --- |
| J1 — Capture a new task | FR-001, FR-002, FR-003, FR-009, FR-010 |
| J2 — Complete or reopen a task | FR-004, FR-007, FR-010 |
| J3 — Edit or delete a task | FR-002, FR-003, FR-005, FR-006, FR-010 |
| J4 — Return to the app later | FR-008 |

Every journey maps to at least one requirement, and every functional requirement maps to at least one journey. FR-008 is exercised indirectly by J1–J3 as well, since every mutation must survive a reload (AC-008.4).

### 9.3 Desired outcome → requirement

| Outcome | Satisfied by |
| --- | --- |
| DO-1 — Start recording within seconds, no sign-up | FR-001, FR-009, NG-01, NFR-PERF-001 |
| DO-2 — Tell open from done at a glance | FR-004, FR-007, FR-010 |
| DO-3 — Tasks present and unchanged next visit | FR-008, NFR-REL-001, NFR-SUP-001 |

### 9.4 Non-goal → guard

| Non-goal | How it is held | Guarded by |
| --- | --- | --- |
| NG-01 Accounts / auth | No sign-in surface exists anywhere in the app | AC-001.7, AC-SEC.3 |
| NG-02 Cross-device sync | Persistence is browser-local only; no sync surface | AC-008.2, AC-SEC.1 |
| NG-03 Sharing / assignment | No assignee attribute or share surface | C-03, §2 domain model |
| NG-04 Projects / boards / tags | A single flat list; no grouping attribute | C-03, §2 domain model |
| NG-05 Notes / descriptions | Title is the only free-text attribute | C-03, §2 domain model |
| NG-06 Reminders / notifications | Due date is data only; it triggers nothing | §2 domain model, AC-010.6 |
| NG-07 Multi-tab consistency | No cross-tab coordination is built or promised | §6 consequence note |

---

## 10. Definition of done for Station 1

- [x] Every FR-001 – FR-010 requirement carried forward, unaltered in intent, all at **Must**.
- [x] Every functional requirement has acceptance criteria sufficient to verify it.
- [x] All four user journeys included with their observable outcomes as pass conditions.
- [x] All five non-functional requirements included, each with verification criteria.
- [x] All seven non-goals recorded explicitly, with guards traced.
- [x] Bidirectional traceability: requirement → journey → acceptance criteria, and journey → requirement.
- [x] No new product behavior invented; every gap logged as an `OQ-xx` instead of assumed.
- [x] No architectural decisions made; no implementation code written.
- [x] `Task Tracker.pdf` unmodified.
