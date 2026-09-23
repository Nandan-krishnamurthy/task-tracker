# Task Tracker — Acceptance Criteria Coverage

**Station:** 4 — Implementation · **Task:** T-607 (traceability audit)
**Artifact status:** Generated. Produced by scanning `docs/01-requirements.md` for acceptance
criteria and `tests/` for the tests that cite them.
**Last updated:** 2026-09-23

---

## 1. How to read this

Every acceptance criterion in `docs/01-requirements.md` §4 and §5 appears below with the tier or
tiers that verify it and the test files that cite it by name. T-607's Definition of Done is that
**every `AC-*` maps to a named passing test**, and the plan is explicit that a criterion without a
test is a **defect**, not a documentation gap.

This table is not maintained by hand. `tests/unit/traceability.test.ts` re-runs the same scan on
every test run and fails if the suite and this document disagree — so a criterion cannot lose its
test, and this table cannot fall out of step, without a red build.

**Tiers** (ADR-0008): `unit` = Vitest, node, no DOM · `dom` = Vitest + jsdom, storage faked ·
`e2e` = Playwright, real browser against the production build.

**What this proves.** Each criterion is claimed by a named test in a passing suite. It does *not*
prove a given test is strong — no mechanical check can. It eliminates the failure mode that is
mechanical (a forgotten criterion) so that review effort goes to the one that needs judgement.

## 2. Totals

| | Count |
| --- | --- |
| Acceptance criteria defined | 85 |
| Criteria with at least one test | 85 |
| **Criteria with no test** | **0** |
| Covered at the unit tier | 55 |
| Covered at the dom tier | 76 |
| Covered at the e2e tier | 59 |

Tier counts overlap deliberately: a criterion proven exhaustively against pure logic at the unit
tier and demonstrated once in a real browser is covered at both, and that is the intended shape
(ADR-0008 §10.3 — tier 3 stays small and covers only what jsdom cannot honestly verify).

## 3. Coverage

| Criterion | Tier | Test files | Criterion text (abridged) |
| --- | --- | --- | --- |
| `AC-001.1` | unit, dom, e2e | `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts` | Given the app is open, when the user enters a non-empty title and submits, then a task with exactly that title is added to the list. |
| `AC-001.2` | unit | `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a task has just been created, then it appears in the active view (a newly created task is never created as completed). |
| `AC-001.3` | dom, e2e | `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts` | Given a task has just been created, then it appears without a full page reload (J1 step 3). |
| `AC-001.4` | unit, dom | `tests/dom/styling.test.ts`, `tests/dom/taskForm.test.ts`, `tests/dom/taskItem-display.test.ts`, `tests/dom/taskItem-edit.test.ts`, `tests/unit/fixtures.test.ts`, `tests/unit/schema.test.ts`, `tests/unit/store.test.ts`, `tests/unit/validation.test.ts` | Given the user submitted a title, then the title is stored and displayed exactly as entered, with no truncation or alteration of its visible content. |
| `AC-001.5` | unit, e2e | `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a task was created with only a title, then its due date and priority are absent, and the task is valid in that state. |
| `AC-001.6` | unit, dom, e2e | `tests/dom/taskForm.test.ts`, `tests/dom/taskItem-display.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a task has been created, when the user creates another task with an identical title, then both tasks exist independently (titles are not unique keys). |
| `AC-001.7` | dom | `tests/dom/main.test.ts`, `tests/dom/taskForm.test.ts` | Given the app has just been opened for the first time with no stored tasks, then the user can create a task without any sign-up, login, or other setup step (... |
| `AC-002.1` | unit, dom, e2e | `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given the create form, when the user supplies a due date along with a title and submits, then the created task carries that due date. |
| `AC-002.2` | unit, dom | `tests/dom/taskForm.test.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given the create form, when the user supplies no due date, then the task is created successfully with no due date (due date is optional, never blocking). |
| `AC-002.3` | unit, dom | `tests/dom/taskItem-edit.test.ts`, `tests/unit/tasks.test.ts` | Given an existing task with no due date, when the user edits it and sets a due date, then the task thereafter carries that due date. |
| `AC-002.4` | unit, dom | `tests/dom/taskItem-edit.test.ts`, `tests/unit/tasks.test.ts` | Given an existing task with a due date, when the user edits it and changes the due date, then the new value replaces the old. |
| `AC-002.5` | unit, dom, e2e | `tests/dom/taskItem-edit.test.ts`, `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given an existing task with a due date, when the user edits it and clears the due date, then the task returns to having no due date and is sorted last per FR... |
| `AC-002.6` | e2e | `tests/e2e/persistence.spec.ts` | Given a task's due date was set, then the same due date is shown after reload (FR-008 interaction). |
| `AC-002.7` | dom | `tests/dom/taskItem-display.test.ts` | Given a task with a due date and a task without one, then both are valid, displayable states — absence of a due date is never rendered as an error. |
| `AC-003.1` | unit, dom, e2e | `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given the create form, when the user selects a priority and submits, then the created task carries that priority. |
| `AC-003.2` | unit, dom | `tests/dom/taskForm.test.ts`, `tests/dom/taskItem-display.test.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given the create form, when the user selects no priority, then the task is created successfully with no priority. |
| `AC-003.3` | unit, dom | `tests/dom/taskForm.test.ts`, `tests/dom/taskItem-edit.test.ts`, `tests/unit/scope-guard.test.ts`, `tests/unit/types.test.ts` | Given the priority control, then the only selectable values are Low, Medium, and High — no fourth level is offered. |
| `AC-003.4` | unit, dom | `tests/dom/taskItem-edit.test.ts`, `tests/unit/tasks.test.ts` | Given an existing task, when the user edits it and sets or changes the priority, then the new value replaces the previous one. |
| `AC-003.5` | unit, dom, e2e | `tests/dom/taskItem-edit.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given an existing task with a priority, when the user edits it and clears the priority, then the task returns to having no priority. |
| `AC-003.6` | dom | `tests/dom/accessibility.test.ts`, `tests/dom/styling.test.ts`, `tests/dom/taskItem-display.test.ts` | Given a task carries a priority, then that priority is visible to the user in the task list without opening an edit view (DO-2 legibility). |
| `AC-003.7` | unit, dom | `tests/dom/taskList.test.ts`, `tests/unit/fixtures.test.ts`, `tests/unit/scope-guard.test.ts`, `tests/unit/sort.test.ts` | Given tasks of differing priority, then priority does not change list order — the default order is due date ascending only (see FR-010 and `OQ-03`). |
| `AC-004.1` | unit, dom | `tests/dom/taskItem-display.test.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given an active task, when the user marks it complete, then its status becomes completed. |
| `AC-004.2` | dom, e2e | `tests/dom/app.test.ts`, `tests/dom/taskItem-display.test.ts`, `tests/e2e/journeys.spec.ts` | Given a task was just marked complete, then it no longer appears in the active view and does appear in the completed view (J2 step 4). |
| `AC-004.3` | unit, dom, e2e | `tests/dom/taskItem-display.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a completed task, when the user marks it incomplete, then its status returns to active and it reappears in the active view. |
| `AC-004.4` | unit, dom, e2e | `tests/dom/taskItem-display.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a status toggle in either direction, then the task's title, due date, and priority are unchanged. |
| `AC-004.5` | dom, e2e | `tests/dom/taskItem-display.test.ts`, `tests/e2e/journeys.spec.ts` | Given a status change, then the UI reflects it without a page reload and within the latency bound of `NFR-PERF-001`. |
| `AC-004.6` | dom, e2e | `tests/dom/store-persistence.test.ts`, `tests/e2e/persistence.spec.ts` | Given a status change, when the app is subsequently reloaded, then the task retains the status it was left in (FR-008 interaction). |
| `AC-004.7` | dom, e2e | `tests/dom/accessibility.test.ts`, `tests/dom/page-skeleton.test.ts`, `tests/dom/styling.test.ts`, `tests/dom/taskItem-display.test.ts`, `tests/e2e/journeys.spec.ts` | Given the completed view, then a completed task is visually distinguishable as done, satisfying "tell at a glance" (DO-2). |
| `AC-005.1` | unit, dom, e2e | `tests/dom/app.test.ts`, `tests/dom/taskItem-edit.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given an existing task, when the user edits its title to a new non-empty value, then the list shows the updated title. |
| `AC-005.2` | unit, dom, e2e | `tests/dom/taskItem-edit.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given an existing task, then title, due date, and priority are each editable (all three attributes, not a subset). |
| `AC-005.3` | dom, e2e | `tests/dom/taskItem-edit.test.ts`, `tests/e2e/journeys.spec.ts` | Given an edit is applied, then the change is reflected immediately without a page reload (J3 step 3). |
| `AC-005.4` | unit, e2e | `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts` | Given an edit that changes the due date, then the task's position in the list is re-evaluated against FR-010 ordering. |
| `AC-005.5` | dom, e2e | `tests/dom/store-persistence.test.ts`, `tests/e2e/persistence.spec.ts` | Given an edit is applied, when the app is reloaded, then the edited values persist (FR-008 interaction). |
| `AC-005.6` | unit, dom, e2e | `tests/dom/store-persistence.test.ts`, `tests/dom/taskItem-edit.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/types.test.ts`, `tests/unit/validation.test.ts` | Given an edit in progress, when the user clears the title to empty and attempts to save, then the edit is rejected with a visible validation message and the ... |
| `AC-005.7` | unit, dom, e2e | `tests/dom/taskItem-edit.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a completed task, then it is editable on the same terms as an active task (J3 step 1: "active or completed"), and editing it does not change its comple... |
| `AC-006.1` | dom, e2e | `tests/dom/taskItem-display.test.ts`, `tests/e2e/journeys.spec.ts` | Given an existing task, when the user deletes it, then it is removed immediately without a page reload. |
| `AC-006.2` | unit, dom, e2e | `tests/dom/app.test.ts`, `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a task was deleted, then it is absent from both the active and completed views ("no longer present anywhere in the list", J3 step 4). |
| `AC-006.3` | dom, e2e | `tests/dom/storage.test.ts`, `tests/dom/store-persistence.test.ts`, `tests/e2e/persistence.spec.ts` | Given a task was deleted, when the app is reloaded, then the task does not reappear. |
| `AC-006.4` | unit, dom, e2e | `tests/dom/taskItem-display.test.ts`, `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a task was deleted, then all other tasks are unaffected in content, status, and relative order. |
| `AC-006.5` | unit, dom, e2e | `tests/dom/taskItem-display.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given a completed task, then it can be deleted on the same terms as an active task. |
| `AC-006.6` | unit, dom, e2e | `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/tasks.test.ts` | Given the last remaining task is deleted, then the app renders an empty list without error. |
| `AC-007.1` | unit, dom | `tests/dom/filterBar.test.ts`, `tests/dom/taskList.test.ts`, `tests/unit/filter.test.ts`, `tests/unit/store.test.ts` | Given a mix of active and completed tasks, then the user can view the active tasks without completed tasks mixed into that view. |
| `AC-007.2` | unit, dom | `tests/dom/filterBar.test.ts`, `tests/dom/taskList.test.ts`, `tests/unit/filter.test.ts`, `tests/unit/store.test.ts` | Given a mix of active and completed tasks, then the user can view the completed tasks. |
| `AC-007.3` | unit, dom, e2e | `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/filter.test.ts`, `tests/unit/store.test.ts` | Given any task, then it is classified into exactly one of the two views at any moment, per its status. |
| `AC-007.4` | unit, dom, e2e | `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts` | Given a status toggle, then the task moves between the two views immediately, with no reload and no manual refresh. |
| `AC-007.5` | unit, dom | `tests/dom/taskList.test.ts`, `tests/unit/filter.test.ts`, `tests/unit/store.test.ts` | Given a view containing no tasks, then that view renders an empty state rather than an error or a blank crash. |
| `AC-007.6` | dom, e2e | `tests/dom/filterBar.test.ts`, `tests/e2e/keyboard.spec.ts` | Given the filter controls, then they are keyboard-operable and carry accessible labels (`NFR-A11Y-001`). |
| `AC-007.7` | unit, dom | `tests/dom/taskList.test.ts`, `tests/unit/filter.test.ts`, `tests/unit/store.test.ts` | Given either view, then the tasks shown within it obey the FR-010 default ordering. |
| `AC-008.1` | unit, dom, e2e | `tests/dom/main.test.ts`, `tests/dom/storage.test.ts`, `tests/e2e/persistence.spec.ts`, `tests/unit/schema.test.ts` | Given tasks were created, when the page is reloaded, then all tasks reappear with identical titles, statuses, due dates, and priorities (J4 step 4). |
| `AC-008.2` | dom, e2e | `tests/dom/storage-isolation.test.ts`, `tests/e2e/persistence.spec.ts` | Given tasks were created, when the browser is fully closed and reopened to the app on the same device, then all tasks reappear identically. |
| `AC-008.3` | unit, dom, e2e | `tests/dom/main.test.ts`, `tests/dom/storage.test.ts`, `tests/e2e/keyboard.spec.ts`, `tests/e2e/persistence.spec.ts`, `tests/unit/store.test.ts` | Given stored tasks exist, then they load automatically on open, with no user action required — no import, unlock, or restore step (J4 step 3). |
| `AC-008.4` | dom, e2e | `tests/dom/main.test.ts`, `tests/dom/store-persistence.test.ts`, `tests/e2e/persistence.spec.ts` | Given any create, edit, status toggle, or delete, then that change is durably persisted, not held only in memory. |
| `AC-008.5` | unit, dom, e2e | `tests/dom/main.test.ts`, `tests/dom/storage.test.ts`, `tests/e2e/persistence.spec.ts`, `tests/unit/schema.test.ts`, `tests/unit/store.test.ts` | Given no tasks have ever been created in this browser, then the app opens to an empty list without error. |
| `AC-008.6` | unit, dom, e2e | `tests/dom/main.test.ts`, `tests/dom/storage-failure-modes.test.ts`, `tests/dom/storage.test.ts`, `tests/e2e/corrupt-storage.spec.ts`, `tests/unit/schema.test.ts` | Given the stored data is corrupted or unreadable, then the app degrades to an empty task list rather than crashing (`NFR-SUP-001`). |
| `AC-008.7` | e2e | `tests/e2e/network-silence.spec.ts` | Given all persistence operations, then no task data is transmitted off the device (`NFR-SEC-001`). |
| `AC-009.1` | unit, dom, e2e | `tests/dom/store-persistence.test.ts`, `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/e2e/persistence.spec.ts`, `tests/unit/store.test.ts`, `tests/unit/validation.test.ts` | Given the create form with an empty title, when the user submits, then no task is created. |
| `AC-009.2` | unit, dom, e2e | `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/types.test.ts` | Given that rejection, then a validation message is visibly displayed to the user — silent failure is a defect. |
| `AC-009.3` | unit, dom, e2e | `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts` | Given that rejection, then any due date or priority the user had already entered is not silently discarded in a way that forces re-entry from scratch. |
| `AC-009.4` | unit, dom | `tests/dom/taskForm.test.ts`, `tests/unit/fixtures.test.ts`, `tests/unit/schema.test.ts`, `tests/unit/store.test.ts`, `tests/unit/validation.test.ts` | Given a title consisting only of whitespace, then it is treated as empty and rejected on the same terms (a whitespace-only title is not a "required title" in... |
| `AC-009.5` | unit, dom, e2e | `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/store.test.ts` | Given a validation message is displayed, when the user then supplies a valid title and submits, then the task is created and the validation message is cleared. |
| `AC-009.6` | dom | `tests/dom/taskForm.test.ts` | Given a validation message is displayed, then it is announced to assistive technology and associated with the title field (`NFR-A11Y-001`). |
| `AC-010.1` | unit, dom, e2e | `tests/dom/taskList.test.ts`, `tests/e2e/keyboard.spec.ts`, `tests/unit/fixtures.test.ts`, `tests/unit/sort.test.ts` | Given several tasks with due dates, then they are displayed soonest-first. |
| `AC-010.2` | unit, dom | `tests/dom/taskList.test.ts`, `tests/unit/fixtures.test.ts`, `tests/unit/sort.test.ts` | Given a mix of tasks with and without due dates, then every task lacking a due date appears after every task having one. |
| `AC-010.3` | unit, dom, e2e | `tests/dom/app.test.ts`, `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/filter.test.ts`, `tests/unit/store.test.ts` | Given a new task is created, then it is inserted at its correct sorted position — not appended to the end regardless of due date. |
| `AC-010.4` | unit, dom, e2e | `tests/dom/focus.test.ts`, `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/filter.test.ts`, `tests/unit/store.test.ts` | Given a task's due date is edited, then the list re-sorts to the correct order immediately. |
| `AC-010.5` | unit, dom, e2e | `tests/dom/taskList.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/unit/filter.test.ts`, `tests/unit/sort.test.ts`, `tests/unit/store.test.ts` | Given the ordering rule, then it applies within the active view and within the completed view alike (FR-010 is cited against Journeys 1, 2 and 3). |
| `AC-010.6` | unit, dom | `tests/dom/taskList.test.ts`, `tests/unit/fixtures.test.ts`, `tests/unit/schema.test.ts`, `tests/unit/sort.test.ts` | Given a due date in the past, then it sorts ahead of nearer-future due dates by the same ascending rule — overdue tasks are not special-cased (the PRD define... |
| `AC-010.7` | unit, dom, e2e | `tests/dom/main.test.ts`, `tests/dom/taskList.test.ts`, `tests/e2e/persistence.spec.ts`, `tests/unit/fixtures.test.ts`, `tests/unit/sort.test.ts` | Given the app is reloaded, then the same ordering is reproduced. |
| `AC-A11Y.1` | dom, e2e | `tests/dom/accessibility.test.ts`, `tests/e2e/keyboard.spec.ts` | Every named control — add task, complete checkbox, edit, delete, filter controls — is reachable and operable using the keyboard alone, with no pointer requir... |
| `AC-A11Y.2` | dom | `tests/dom/accessibility.test.ts`, `tests/dom/taskItem-display.test.ts` | Every such control exposes an accessible label that identifies both its action and the task it acts on, so that "delete" is not ambiguous among many tasks. |
| `AC-A11Y.3` | dom, e2e | `tests/dom/accessibility.test.ts`, `tests/dom/app.test.ts`, `tests/dom/focus.test.ts`, `tests/dom/page-skeleton.test.ts`, `tests/e2e/keyboard.spec.ts` | Keyboard focus is visible at all times while tabbing through the interface. |
| `AC-A11Y.4` | dom, e2e | `tests/dom/focus.test.ts`, `tests/dom/taskForm.test.ts`, `tests/e2e/journeys.spec.ts`, `tests/e2e/keyboard.spec.ts` | All four user journeys (J1–J4) are completable keyboard-only, end to end. |
| `AC-A11Y.5` | dom | `tests/dom/accessibility.test.ts` | The FR-009 validation message is perceivable to assistive technology, not conveyed by color or position alone. |
| `AC-SEC.1` | unit, dom, e2e | `tests/dom/storage.test.ts`, `tests/e2e/network-silence.spec.ts`, `tests/unit/scope-guard.test.ts` | The application issues no network request carrying task data — inspecting network traffic during all four journeys shows none. |
| `AC-SEC.2` | e2e | `tests/e2e/network-silence.spec.ts` | No analytics, telemetry, or tracking collects personal data. |
| `AC-SEC.3` | unit, dom | `tests/dom/page-skeleton.test.ts`, `tests/unit/scope-guard.test.ts` | No account, profile, email address, or other personal identifier is requested or stored (reinforces `NG-01`). |
| `AC-PERF.1` | e2e | `tests/e2e/performance.spec.ts` | Create, edit, complete/reopen, and delete each reflect in the UI in under 100ms perceived latency. |
| `AC-PERF.2` | e2e | `tests/e2e/network-silence.spec.ts`, `tests/e2e/performance.spec.ts` | No operation in any journey depends on a network round trip. |
| `AC-PERF.3` | e2e | `tests/e2e/performance.spec.ts` | The latency bound holds at a realistic list size; because v1 assumes an unbounded list (`OQ-07`), the size at which it is validated must be stated by the test. |
| `AC-REL.1` | dom, e2e | `tests/dom/store-persistence.test.ts`, `tests/e2e/persistence.spec.ts` | After an abrupt tab close or browser termination, all tasks saved before that moment are present on reopening. |
| `AC-REL.2` | dom | `tests/dom/store-persistence.test.ts` | Only input entered but not yet committed by the persistence mechanism may be lost; committed changes may not. |
| `AC-REL.3` | unit, dom, e2e | `tests/dom/storage-isolation.test.ts`, `tests/dom/store-persistence.test.ts`, `tests/e2e/persistence.spec.ts`, `tests/unit/scope-guard.test.ts` | Persistence is not deferred to page-unload alone, since an unload handler is not guaranteed to run on a crash. |
| `AC-SUP.1` | unit, dom, e2e | `tests/dom/main.test.ts`, `tests/dom/storage-failure-modes.test.ts`, `tests/dom/storage-isolation.test.ts`, `tests/dom/storage.test.ts`, `tests/e2e/corrupt-storage.spec.ts`, `tests/unit/schema.test.ts` | Given stored data that is malformed, truncated, or of an unrecognized shape, the app starts and presents an empty, usable task list. |
| `AC-SUP.2` | unit, dom | `tests/dom/main.test.ts`, `tests/dom/storage-failure-modes.test.ts`, `tests/dom/storage.test.ts`, `tests/dom/store-persistence.test.ts`, `tests/unit/store.test.ts` | Given storage that is unavailable or unreadable (for example, blocked by browser settings), the app does not crash and remains usable within the session. |
| `AC-SUP.3` | dom, e2e | `tests/dom/main.test.ts`, `tests/dom/storage-failure-modes.test.ts`, `tests/dom/storage-isolation.test.ts`, `tests/dom/storage.test.ts`, `tests/e2e/corrupt-storage.spec.ts` | After degrading, the user can immediately create new tasks — the app is not left in a permanently broken state. |
