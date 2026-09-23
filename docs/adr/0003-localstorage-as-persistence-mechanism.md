# ADR-0003: `localStorage` as the persistence mechanism

**Status:** Accepted
**Date:** 2026-09-23
**Station:** 3 — Architecture Decision Records
**Related:** ADR-0001, ADR-0004, ADR-0005, ADR-0006

---

## Context

`FR-008` requires that all task data persist in the browser and reload automatically on return visits, on the same device and browser. Journey J4 makes the bar concrete: the user closes the tab or the whole browser, reopens the app, and finds every task with the same title, status, due date, and priority — with **no user action** to restore it (`AC-008.3`).

The surrounding constraints are unusually tight, and they eliminate most of the option space before it is examined:

- **C-01:** no backend, account system, or API contract in v1 — local storage only, no login.
- **`NFR-SEC-001`:** no task data leaves the browser; nothing is transmitted to a server.
- **NG-02:** no syncing or access across more than one device or browser.
- **`NFR-REL-001` / `AC-REL.3`:** a crash or abrupt tab close must not lose saved tasks, and persistence may not depend on an unload handler.
- **`NFR-PERF-001`:** every mutation reflects in the UI under 100 ms.

The PRD names the expected mechanism directly in assumption A-01: *"Browser `localStorage` (or an equivalent client-side persistence API) is assumed sufficient to meet FR-008."* It also flags that no minimum browser support matrix has been specified, and (A-02) that no list-size limit has been set.

## Decision

Persist to **`window.localStorage` under a single key: `task-tracker.v1`**.

The stored value is one JSON envelope containing a `schemaVersion` and the full `tasks` array:

```json
{ "schemaVersion": 1, "tasks": [ … ] }
```

The whole array is rewritten on each mutation rather than maintaining per-task records. At the data sizes this product contemplates, whole-array rewrite is simpler, is atomic from any reader's point of view, and is fast enough to be invisible.

Only the `tasks` slice is persisted. Session state — the current filter, which task is being edited, validation messages, and the storage-availability flag — is deliberately not stored (architecture §2.3): persisting it would resurrect a half-finished edit or a stale error on reload, which J4 never asks for.

Access is confined to `src/persistence/storage.ts` by ADR-0001's single-storage-module invariant.

## Alternatives considered

### A. IndexedDB

The other real browser database. Larger quotas, structured queries, transactions.

**Rejected.** It is **asynchronous**, which is the disqualifying property here. ADR-0004 depends on writing synchronously inside `dispatch` to satisfy `AC-REL.3`; an async write reintroduces exactly the window between "user acted" and "data is safe" that `NFR-REL-001` exists to close. Beyond that, its query and transaction machinery is aimed at data volumes and access patterns a personal to-do list will never reach — a clear P2 violation. Its one genuine advantage, quota headroom, only matters if A-02's unbounded assumption turns out to bite; see *Revisit if*.

### B. `sessionStorage`

Same synchronous API, same shape.

**Rejected outright.** It is cleared when the browsing session ends, so it fails `AC-008.2` ("browser is fully closed and reopened … all tasks reappear identically") by definition. It cannot satisfy J4.

### C. Cookies

**Rejected.** Cookies are transmitted with HTTP requests, which directly violates `NFR-SEC-001`'s "nothing is transmitted to a server". They also carry a ~4 KB practical limit. Wrong tool on both counts.

### D. File System Access API / Origin Private File System

Real file handles, large capacity.

**Rejected.** Asynchronous (same objection as IndexedDB), materially narrower browser support than the evergreen baseline settled in architecture §12, and the user-facing variant requires an explicit permission gesture — which would break `AC-008.3`'s "no user action required" and undercut DO-1's zero-setup promise.

### E. A thin abstraction over several backends, chosen at runtime

**Rejected as speculative generality.** There is exactly one mechanism and no prospect of a second: C-01 forbids a backend and NG-02 forbids sync. ADR-0001's single-module rule already provides the seam needed to swap implementations later or to fake storage in tests (architecture §10.2). An abstraction layer would add indirection with no present beneficiary.

## Consequences

**Positive**

- **Synchronous API**, which is what makes ADR-0004's write-through model possible and `AC-REL.3` satisfiable without an unload handler.
- Survives tab close and full browser restart on the same device — `AC-008.1`, `AC-008.2`.
- Available on first load with no permission prompt and no user gesture — `AC-008.3`, DO-1.
- Origin-scoped and never transmitted, satisfying `NFR-SEC-001` by construction. Data physically cannot leave the browser through this mechanism.
- Matches the PRD's own stated assumption (A-01), so it introduces no divergence from the approved document.

**Negative**

- **~5 MB practical quota.** At a conservative ~200 bytes per task this is on the order of 25,000 tasks — far past any realistic personal list, but it is a ceiling, and A-02 explicitly assumes the list is unbounded. A quota-exceeded write is therefore possible in principle and is handled as failure mode #3 in architecture §8 (in-memory state stays correct, `storageOk` goes false, no crash).
- Synchronous writes block the main thread. At this payload size the cost is sub-millisecond and irrelevant to `AC-PERF.1`, but it would not scale to a much larger dataset.
- **Clearing browser data destroys everything, with no recovery path.** This is not a defect introduced here: it is the risk the PRD names first in its risk table and accepts, with NG-02 disclosed as an explicit non-goal.
- String-only storage requires JSON serialization on every write and a validating decode on every read (ADR-0006).

**Neutral**

- `schemaVersion` earns its place now by making unrecognized data *detectable* rather than silently misread — any value other than `1` is treated as unreadable (ADR-0006). C-06 confirms there is no prior format to migrate from, so no migration code is written in v1.
- No `storage` event listener is registered. Cross-tab synchronization is NG-07; adding a listener would be building an explicit non-goal.

## Requirement and acceptance-criteria references

| Reference | Relevance |
| --- | --- |
| `FR-008`, `AC-008.1–5` | The requirement this decision exists to satisfy |
| J4 (Return to the app later) | The journey it must carry end to end |
| `AC-008.3` | No permission prompt, no user action on load |
| `NFR-REL-001`, `AC-REL.3` | Synchronous API is the enabling property (see ADR-0004) |
| `NFR-SEC-001`, `AC-SEC.1` | Origin-scoped, never transmitted |
| C-01, A-01, A-02 | Constraint and assumptions this decision sits on |
| NG-02, NG-07 | Bounds: no sync, no cross-tab coordination |
| Architecture §7.1, §7.2, §7.4, §7.5 | Source of this decision |

## Revisit if

- A-02's unbounded-list assumption meets a real user whose list approaches the quota (IndexedDB becomes the natural successor, at the cost of reopening ADR-0004).
- The PRD owner ever reverses NG-02 and asks for sync, which would reopen C-01 and this ADR together.
