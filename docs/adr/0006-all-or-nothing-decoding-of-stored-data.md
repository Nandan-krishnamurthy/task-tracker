# ADR-0006: All-or-nothing decoding of stored data

**Status:** Accepted
**Date:** 2026-09-23
**Station:** 3 — Architecture Decision Records
**Related:** ADR-0001, ADR-0003, ADR-0005

---

## Context

`NFR-SUP-001` states the supportability requirement plainly:

> Corrupted or unreadable local storage must degrade to an empty task list rather than crashing the app.

Station 1 expanded it into three criteria: the app must start and present an empty, usable list given malformed data (`AC-SUP.1`); must not crash when storage is unavailable or unreadable (`AC-SUP.2`); and must let the user create tasks immediately afterwards rather than being left permanently broken (`AC-SUP.3`). `AC-008.6` repeats the requirement from the persistence side.

Stored data is a **trust boundary**, even in an app with no server. The payload can be malformed for mundane reasons: a write interrupted by a crash, a browser extension writing to the same origin, a developer or user editing storage by hand, or a future version of the app writing a shape this version does not understand.

The design question is not *whether* to validate — ADR-0003 stores JSON strings, so a validating decode is unavoidable — but **what to do when validation fails for part of the payload**. If the envelope parses and contains ten tasks, three of which have a `priority` of `"urgent"` (not a valid level per C-04), does the app load the seven good ones, or none?

## Decision

**Decoding is total and all-or-nothing.**

The decoder never throws and always returns a valid `Task[]`. If *any* part of the payload fails validation — invalid JSON, wrong envelope shape, unrecognized `schemaVersion`, or **any single task failing any field check** — the entire result degrades to an empty array.

Field checks, per architecture §7.3:

| Field | Accepted |
| --- | --- |
| `id` | non-empty string |
| `title` | non-empty string |
| `dueDate` | `YYYY-MM-DD` string, or `null` (ADR-0005) |
| `priority` | `'low' \| 'medium' \| 'high'`, or `null` (C-04) |
| `completed` | boolean |
| `createdAt` | number |

Three distinct failure modes, all landing on a usable app (architecture §8):

| # | Failure | Behavior |
| --- | --- | --- |
| 1 | Malformed payload | Empty list; app fully usable |
| 2 | Storage unavailable (access throws) | `storageOk = false`; app runs in memory for the session |
| 3 | Write rejected (quota exceeded) | Same as #2; in-memory state stays correct |

All storage access sits inside `src/persistence/storage.ts`, wrapped in `try/catch` at every entry point — the ADR-0001 invariant that makes "no crash path" a single reviewable claim rather than a whole-codebase audit.

**No corrupt-data quarantine.** The unreadable payload is not copied to a backup key before being overwritten.

## Alternatives considered

### A. Partial recovery — load the valid tasks, drop the invalid ones

The intuitively kinder option, and the one most developers reach for.

**Rejected, and this is the substantive choice in this ADR.** Three reasons, in order of weight:

1. **It contradicts the requirement's wording.** `NFR-SUP-001` and `AC-SUP.1` both say *"degrade to an empty task list"* — not "to the recoverable subset". Partial recovery is unspecified behavior, and the standing instruction across these stations is not to invent product behavior.
2. **It produces a quietly wrong list instead of an obviously empty one.** A user who opens the app to an empty list knows immediately that something is wrong. A user who opens it to seventeen of their twenty tasks may never notice the three that vanished — and may act on a list they believe is complete. Silent partial data loss is the worse failure, even though it loses less data.
3. **It requires answering questions nobody has answered.** Is a task with a bad `priority` repairable by nulling the field, or discarded? What about a bad `title`? Each answer is an invented product rule, and each adds a branch that must be specified and tested.

### B. Repair in place — coerce invalid fields to defaults

Null out a bad `priority`, keep the task.

**Rejected.** Every coercion is an invented rule, and the result is a task the user never created presented as one they did. Strictly worse than A on the "quietly wrong" axis.

### C. Throw on invalid data and show an error screen

Fail loudly.

**Rejected — it is the behavior `NFR-SUP-001` exists to forbid.** "Rather than crashing the app" is the requirement's own phrasing, and an error screen fails `AC-SUP.3` because the user cannot create tasks from it.

### D. Quarantine the corrupt payload under a backup key before overwriting

Preserve the bytes in case manual recovery is ever wanted.

**Rejected, though it was genuinely tempting.** It is unspecified behavior; it introduces a second storage key and its own lifecycle questions (when is the backup cleared? what if it too is corrupt? does it count against quota?); and the PRD's risk table already accepts that local-only persistence has **no recovery path**. Adding a half-recovery mechanism that no UI exposes would be scope the product has not asked for.

### E. A schema-validation library (Zod, Valibot, …)

**Rejected on P2.** A runtime dependency for six field checks on one object shape, in an application whose runtime dependency count is otherwise zero (ADR-0002). Hand-written predicates are perhaps thirty lines and are themselves directly unit-testable.

## Consequences

**Positive**

- `AC-SUP.1` and `AC-008.6` hold literally and exactly, with no interpretation needed.
- Failure is **loud in the right way**: an empty list is immediately visible to the user, where a silently shortened list would not be.
- The decoder is a pure, total function of one string, so every failure mode is a cheap unit test with a fixture string — no browser, no mocking (architecture §10.1).
- The no-crash guarantee is auditable: one module, every entry wrapped, plus a test asserting no other module references `localStorage`.
- Fewer branches than any partial-recovery scheme, and no invented repair semantics to maintain or explain.

**Negative — stated plainly**

- **One bad byte loses every task.** A single malformed field in one task of two hundred discards all two hundred. This is the real cost of the decision, and it is accepted because the requirement chose it and because the alternative's failure mode is quieter and therefore worse.
- No recovery path once degraded: the next mutation overwrites the corrupt payload, and rejecting quarantine (alternative D) means the original bytes are gone. Consistent with the PRD's accepted risk, but it is a one-way door for that user's data.
- Strict field checking means a *future* version's payload is unreadable by this one. Acceptable in v1: C-06 confirms there is no prior format, and `schemaVersion` exists precisely so the mismatch is detected rather than misread.

**Neutral**

- Two user-communication gaps are left open and referred back to the product owner in architecture §8.1 — whether to tell the user their data could not be read (mode #1), and whether to tell them saving is unavailable (mode #2). The current default is **silence in both cases**, since the PRD specifies no such message and adding one would be inventing UI. Neither blocks implementation; both deserve a product decision, because silent non-saving sits awkwardly against DO-3.

## Requirement and acceptance-criteria references

| Reference | Relevance |
| --- | --- |
| `NFR-SUP-001` | The requirement, whose wording ("degrade to an empty task list") decides this |
| `AC-SUP.1`, `AC-SUP.2`, `AC-SUP.3` | Three failure modes, all landing usable |
| `AC-008.5`, `AC-008.6` | First visit and corrupt payload both yield an empty list without error |
| C-03, C-04, ADR-0005 | Define what "valid" means for each field |
| C-06 | No prior format to migrate from, so strict version checking is safe in v1 |
| PRD risk table ("no recovery path") | Basis for rejecting quarantine |
| Architecture §7.3, §8, §8.1 | Source of this decision |

## Revisit if

- Real corruption is observed in the field, and the "zero confirmed task data loss reports" success measure comes under pressure — partial recovery would then need a *product* decision first, not an engineering one.
