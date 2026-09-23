# ADR-0001: Layered architecture with inward-pointing dependencies

**Status:** Accepted
**Date:** 2026-09-23
**Station:** 3 — Architecture Decision Records
**Supersedes:** —
**Superseded by:** —
**Related:** ADR-0002, ADR-0003, ADR-0004, ADR-0006, ADR-0008

---

## Context

Task Tracker is a small client-side application with no server. Everything — the domain rules, the storage, and the rendering — runs in one browser process. The natural pull in an application of this size is to put everything in one file: read `localStorage` from a render function, sort inside a click handler, validate in the DOM.

That shape fails against two of the approved requirements in particular:

- `NFR-SUP-001` / `AC-SUP.1–3` require that corrupted or unreadable storage degrade to an empty list rather than crash. That guarantee is only reviewable if storage access lives in one auditable place.
- The bulk of the acceptance criteria — the whole of `AC-010.*` ordering, `AC-009.*` validation, `AC-007.1–3` filtering, `AC-002.*`/`AC-003.*` attribute handling — describe decisions, not pixels. If those decisions are entangled with the DOM, every test of them needs a browser.

The PRD adds a structural hint: all four user journeys are marked **Service boundary: No**. There is no service layer to build, so the only boundaries available are the ones we draw inside the client.

## Decision

Organize the application into **four layers with dependencies pointing inward only**:

| Layer | Directory | May import from |
| --- | --- | --- |
| **Core** | `src/core/` | *nothing* |
| **Persistence** | `src/persistence/` | Core types |
| **Store** | `src/store/` | Core, Persistence |
| **UI** | `src/ui/` | Core types, Store (dispatch + subscribe) |
| **Composition** | `src/main.ts` | all of the above |

Two invariants follow, and both are enforceable by review and by test:

1. **`core/` is pure.** No DOM access, no storage access, no side effects, no imports from sibling layers. It holds types, validation, the sort comparator, the filter selector, and task create/update/toggle/delete as pure functions.
2. **Storage is touched in exactly one module.** Only `src/persistence/storage.ts` may reference `localStorage`. No exceptions.

State flows one way: user event → UI dispatches an action → store applies it via core logic → store persists → store notifies → UI re-renders. The UI never mutates state and never reads storage. Storage never feeds the UI directly; it is read once at startup.

## Alternatives considered

### A. Single-file / flat application

Everything in `main.ts`, or a handful of files with no boundary rules.

**Rejected.** Defensible at a hundred lines, but it puts `localStorage` calls wherever they are convenient, which makes the `NFR-SUP-001` no-crash guarantee unverifiable — you would have to audit every file on every change. It also forces every ordering and validation test through a DOM, inverting the test pyramid for logic that has nothing to do with the DOM.

### B. Feature-sliced structure (`features/tasks/`, `features/filter/`)

Group by feature rather than by layer.

**Rejected.** Feature slicing pays off when features are numerous and independently owned. Here there is exactly one feature — a personal task list — and NG-04 forbids the grouping concepts (projects, boards, tags) that would ever produce a second one. The slices would be arbitrary, and the storage-isolation invariant would be harder to state.

### C. MVC / MVVM with observable models

Per-task model objects that notify views of their own changes.

**Rejected.** Object-level observability is machinery for fine-grained updates we do not need at this data size, and it distributes state across many objects, which sits badly with a single serialized payload (ADR-0003) and a single synchronous write (ADR-0004). It also tends to push logic into methods on entities, where it is less directly testable than free functions.

### D. Hexagonal / ports-and-adapters with formal interfaces

Define a `TaskRepository` port, inject adapters.

**Rejected as over-built.** The interesting part of hexagonal — isolating the domain from I/O — is already achieved by the `core/` purity rule, at a fraction of the ceremony. There is exactly one adapter and no prospect of a second, since NG-02 rules out sync and C-01 rules out a backend. The test seam that a port would provide is obtained more cheaply by faking one module (§10.2 of the architecture).

## Consequences

**Positive**

- Most acceptance criteria become testable with no browser at all, because the decisions they describe live in pure functions. This is what makes the bottom-heavy test pyramid in ADR-0008 possible.
- The `NFR-SUP-001` no-crash guarantee reduces to a single reviewable claim: *every entry point of `persistence/storage.ts` is wrapped*. An automated test asserts no other module references `localStorage`.
- Replacing a layer is bounded. Swapping the UI layer for a framework (ADR-0002) or `localStorage` for IndexedDB (ADR-0003) touches one directory and leaves the others' tests intact.
- Unidirectional flow removes the class of bug where storage and memory disagree, because storage is never an input after startup.

**Negative**

- More files than the app strictly needs. A reader encountering `core/sort.ts` containing one comparator may find the structure disproportionate.
- Crossing a layer requires a small amount of ceremony — a new action in `store/actions.ts` rather than an inline mutation.

**Neutral**

- The dependency rule is a convention. It is upheld by review, by the `localStorage` invariant test, and optionally by a lint rule; nothing in the language enforces it.

## Requirement and acceptance-criteria references

| Reference | Relevance |
| --- | --- |
| `NFR-SUP-001`, `AC-SUP.1`, `AC-SUP.2`, `AC-SUP.3` | The single-storage-module invariant is what makes the no-crash guarantee auditable |
| `AC-010.*`, `AC-009.*`, `AC-007.1–3`, `AC-002.*`, `AC-003.*` | Decision logic isolated in `core/`, testable without a DOM |
| `AC-008.4` | One store, one persistence trigger — every mutation is durably written |
| PRD user journeys J1–J4, "Service boundary: No" | Confirms no service layer; boundaries are internal only |
| Architecture §1.1, §1.2 | Source of this decision |

## Revisit if

- A second application surface appears (it would need an extracted shared core).
- The `core/` purity rule is repeatedly broken in review — a sign the boundary is in the wrong place.
