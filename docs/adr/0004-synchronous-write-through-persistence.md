# ADR-0004: Synchronous write-through persistence on every mutation

**Status:** Accepted
**Date:** 2026-09-23
**Station:** 3 — Architecture Decision Records
**Related:** ADR-0001, ADR-0003

---

## Context

`NFR-REL-001` is unusually specific about *when* data must be safe:

> A browser crash or unintentional tab close must not lose previously saved tasks; only data entered and not yet saved by the persistence mechanism may be at risk.

Station 1 sharpened this into `AC-REL.3`: *"Persistence is not deferred to page-unload alone, since an unload handler is not guaranteed to run on a crash."* That criterion rules out the most common implementation of browser persistence — batching writes and flushing on `beforeunload` — before design begins. A process killed by the OS, a tab crash, or a forced quit never runs an unload handler, and the tasks would be gone.

The second success measure in the PRD reinforces it: **zero confirmed task-data-loss reports** in the first 30 days.

Pulling the other way is `NFR-PERF-001`: every create, edit, complete, and delete must reflect in the UI in under 100 ms. Any persistence strategy must not spend that budget.

## Decision

The store writes the full `tasks` array to storage **synchronously, immediately, inside `dispatch`** — after the reducer produces the next state and **before** subscribers are notified — for every action that changed `tasks`.

There is:

- **no debounce or throttle**
- **no `beforeunload` / `pagehide` / `visibilitychange` handler**
- **no idle callback, timer, or microtask deferral**
- **no dirty flag or write queue**

The invariant is plain enough to state in one line and to test: **an action that has been dispatched has been persisted.** There is no window in which the UI shows a change that storage does not have.

Ordering matters. Persisting *before* notifying subscribers means the UI can never paint a state that is not already durable — the failure mode where a user sees their task appear, the tab dies, and the task is gone cannot occur.

Actions fire on submit and on button press — never per keystroke — so the write frequency is bounded by user actions, not by typing.

## Alternatives considered

### A. Debounced write (e.g. 300–500 ms after the last change)

The conventional optimization: coalesce bursts of changes into one write.

**Rejected.** It creates precisely the loss window `AC-REL.3` forbids. A user who checks off a task and immediately closes the tab loses it. The optimization also has no beneficiary here: writes are triggered by discrete user actions, not by a high-frequency event stream, so there are no bursts to coalesce.

### B. Flush on `beforeunload` / `pagehide`

Keep state in memory; write once on the way out.

**Rejected explicitly by `AC-REL.3`.** Unload handlers are not guaranteed to run on a crash, an OS kill, or a forced quit, and their reliability on mobile is notoriously poor. This is the single alternative the acceptance criteria name and exclude by name.

### C. Periodic autosave on a timer

Write every N seconds if dirty.

**Rejected.** Smaller loss window than A or B, but still a nonzero one, and `NFR-REL-001` draws the line at "previously saved tasks" — a timer makes "saved" a matter of luck. It also adds a lifecycle (start, stop, clear on teardown) with no compensating benefit.

### D. Asynchronous write (IndexedDB, or `localStorage` wrapped in a promise)

**Rejected.** Reintroduces the gap between "user acted" and "data is durable" that this ADR exists to close, and would require the UI to reason about in-flight writes. This is the same objection that ruled IndexedDB out in ADR-0003 — the two decisions stand or fall together.

### E. Incremental per-task writes (one storage key per task)

Write only the task that changed.

**Rejected.** Faster in theory, but multi-key writes are not atomic: a crash between two `setItem` calls can leave storage internally inconsistent — a task deleted from one key but still referenced by an index. Whole-array rewrite is atomic from any reader's perspective. At this payload size the performance argument is moot in any case.

## Consequences

**Positive**

- `AC-REL.1` and `AC-REL.2` hold by construction: after an abrupt close, everything saved before that moment is present, and only never-committed *input* — text typed into the create form but not submitted — can be lost. That is exactly the exemption `NFR-REL-001` grants.
- `AC-008.4` ("every mutation is durably persisted, not held only in memory") is structural rather than a matter of care.
- Simple to reason about and to test: no timers to advance, no flush to await, no lifecycle to tear down. A DOM test asserts the storage fake was written after each mutating action.
- Directly serves the "zero confirmed data loss reports" success measure.

**Negative**

- Synchronous `localStorage.setItem` blocks the main thread. At this payload size the cost is sub-millisecond and invisible against the 100 ms budget of `AC-PERF.1`, but it is real, and it would grow with list size (see ADR-0003's quota note and A-02).
- The entire array is serialized on every change, including single-field edits. O(n) work per mutation, which is only acceptable because n is small — `AC-PERF.3` validates the bound at 500 tasks.
- A rapid sequence of actions produces a write per action with no coalescing. Acceptable because actions are user-paced.

**Neutral**

- Every `setItem` is wrapped in `try/catch` per ADR-0006 and architecture §8. A failed write (quota exceeded, storage blocked) sets `storageOk = false` and never throws into the UI; in-memory state stays correct and the session remains usable (`AC-SUP.2`).
- This decision depends on ADR-0003's choice of a synchronous storage API. Changing to an asynchronous store reopens this ADR.

## Requirement and acceptance-criteria references

| Reference | Relevance |
| --- | --- |
| `NFR-REL-001`, `AC-REL.1`, `AC-REL.2` | The requirement this decision serves |
| **`AC-REL.3`** | Names and excludes the unload-handler alternative outright |
| `AC-008.4` | Every mutation durably persisted |
| `NFR-PERF-001`, `AC-PERF.1`, `AC-PERF.3` | The budget this must fit inside; validated at 500 tasks |
| `AC-SUP.2` | Write failure degrades without crashing |
| Success measure: zero confirmed data-loss reports | Product-level motivation |
| Architecture §3.3, §7.4 | Source of this decision |

## Revisit if

- Profiling at realistic list sizes shows `setItem` consuming a meaningful share of the 100 ms budget — in which case the answer is a faster storage mechanism, not a delayed write, since `AC-REL.3` is not negotiable.
