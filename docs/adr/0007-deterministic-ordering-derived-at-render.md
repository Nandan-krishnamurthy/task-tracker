# ADR-0007: Deterministic ordering, derived at render time

**Status:** Accepted
**Date:** 2026-09-23
**Station:** 3 — Architecture Decision Records
**Related:** ADR-0001, ADR-0005

---

## Context

`FR-010` fixes the default order:

> Tasks are sorted by due date ascending by default (soonest first), with tasks lacking a due date sorted last.

It is cited against three of the four journeys, and the PRD's decision log confirms it as a settled choice. But the rule specifies only a **primary key**, and Station 1 recorded three gaps it leaves open:

- `OQ-01` — how are two tasks sharing a due date ordered relative to each other?
- `OQ-02` — how are undated tasks ordered among themselves?
- `OQ-03` — does priority influence ordering at all?

These are not cosmetic. `AC-010.7` requires that reloading the app reproduce the same order. A comparator that returns `0` for ties hands ordering to the engine's sort implementation, which can differ between the freshly-loaded array and the in-session array — producing a list that visibly reshuffles on reload for no reason the user can see.

Two further criteria constrain *when* sorting happens: `AC-010.3` (a newly created task appears in its correct sorted position, not appended) and `AC-010.4` (editing a due date re-sorts immediately).

## Decision

### Ordering is derived at render, never stored

`AppState.tasks` is held in **insertion order**. The visible list is computed on each render:

```
visible = sort( tasks.filter( byCurrentFilter ) )
```

Filter first, then sort. The result is never written back to state or to storage.

### A four-key comparator

| # | Key | Rule | Purpose |
| --- | --- | --- | --- |
| 1 | Has due date | dated before undated | `AC-010.2` |
| 2 | `dueDate` | ascending lexicographic on `YYYY-MM-DD` (= chronological, per ADR-0005) | `AC-010.1`, `AC-010.6` |
| 3 | `createdAt` | ascending — older first | resolves `OQ-01`, `OQ-02` |
| 4 | `id` | ascending lexicographic | final determinism guard |

Key 3 resolves both tie-break questions the same way: fall through to creation order, which is stable, intuitive ("first added, first listed"), and identical across reloads. Key 4 exists because two tasks created in the same millisecond are possible; without it the comparator could still return `0`, and `AC-010.7` would rest on engine behavior rather than on our code.

### Priority does not participate

`OQ-03` is resolved **no**. The approved decision "Default task list order" names due date only. Priority is display metadata (`AC-003.7`).

### Past dates are not special-cased

`AC-010.6`: an overdue task sorts ahead of nearer-future ones by the same ascending rule. No overdue grouping, badge, or styling rule — the PRD specifies none, and inventing one would brush against NG-06.

The comparator lives in `src/core/sort.ts` as a pure function, per ADR-0001.

## Alternatives considered

### A. Maintain a sorted array in state and in storage

Insert each new task at its sorted position; keep storage pre-sorted.

**Rejected.** It creates a cached ordering that must be re-derived on every due-date edit (`AC-010.4`) and kept consistent with storage, which is a class of drift bug with no upside. It also welds the sort rule into the persisted data: changing the rule later would require a data migration rather than a one-line comparator change. Deriving at render makes `AC-010.3` and `AC-010.4` fall out automatically — there is no cached order that *can* drift.

### B. Return `0` for ties (no tie-break keys)

The minimal comparator that satisfies the literal text of FR-010.

**Rejected.** `Array.prototype.sort` is specified as stable in modern engines, but stability only preserves the *input* order — and the input order after a page reload is whatever the decoder produced, which need not match the in-session array after edits and deletions. Two tasks sharing a due date could therefore swap places on reload, visibly violating `AC-010.7`. Keys 3 and 4 make order a property of the data, not of the array's history.

### C. Tie-break on title (alphabetical)

Also deterministic, and arguably friendlier to scan.

**Rejected.** It would reorder the list when a user edits a title — a surprising side effect of an unrelated action — and it makes ordering depend on locale collation. Creation order changes only when tasks are created.

### D. Sort by priority, then due date

A common reading of what a to-do list "should" do.

**Rejected outright.** It contradicts an approved PRD decision. If priority ordering is wanted, it is a PRD change, not an engineering one.

### E. User-selectable sort options

**Rejected as out of scope.** FR-010 says "by default", which in context describes the single order the app applies; no alternative sort is listed among FR-001–FR-010, and no journey mentions choosing one. Adding it would be inventing product behavior.

## Consequences

**Positive**

- Ordering is **fully deterministic**: the same task set always produces the same order, in-session and after reload (`AC-010.7`).
- `AC-010.3` and `AC-010.4` need no dedicated mechanism — a new or edited task lands correctly because order is recomputed from scratch every render.
- The comparator is a pure function over plain data: exhaustively unit-testable with no DOM, no store, and no storage (architecture §10.1).
- The sort rule can change later without touching stored data, because stored order carries no meaning.
- The same comparator applies inside both the active and completed views (`AC-010.5`), with no duplication.

**Negative**

- Sorting runs on every render rather than once per mutation. O(n log n) per render, which is irrelevant at the sizes contemplated (`AC-PERF.3` validates the latency bound at 500 tasks) but is genuinely wasted work that a cached order would avoid.
- `createdAt` exists on the model **only** to serve key 3. It is an internal field with no product meaning — permitted by §2 of `01-requirements.md`, but it is a field the PRD did not ask for and a reader may wonder about.

**Neutral**

- Key 4 (`id`) will essentially never be reached in practice. It is a correctness guard, not a behavior, and should be tested as such.
- Undated tasks sort last as a group (key 1) and by creation order within it (key 3) — the two tie-break gaps resolve identically, which keeps the rule easy to state.

## Requirement and acceptance-criteria references

| Reference | Relevance |
| --- | --- |
| `FR-010`, `AC-010.1–7` | The requirement, in full |
| `AC-010.7` | Reproducible order across reloads — the criterion that forces keys 3 and 4 |
| `AC-010.2` | Undated tasks last (key 1) |
| `AC-010.6` | Overdue not special-cased |
| `AC-010.5` | Same ordering inside both views |
| `AC-003.7` | Priority does not affect order |
| `OQ-01`, `OQ-02`, `OQ-03` | The three Station 1 gaps this ADR closes |
| PRD decision "Default task list order" | The approved rule being implemented |
| ADR-0005 | Why lexicographic comparison is chronological |
| Architecture §5.1, §5.2, §5.3, §12 | Source of this decision |

## Revisit if

- The PRD owner introduces priority-aware ordering or user-selectable sorting — both are product changes that would supersede this ADR.
