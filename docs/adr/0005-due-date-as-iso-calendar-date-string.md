# ADR-0005: Represent due dates as `YYYY-MM-DD` calendar-date strings

**Status:** Accepted
**Date:** 2026-09-23
**Station:** 3 — Architecture Decision Records
**Related:** ADR-0003, ADR-0006, ADR-0007

---

## Context

`FR-002` gives every task an optional due date, settable at creation or via edit. `FR-010` makes that date the primary sort key — ascending, with undated tasks last. `AC-008.1` requires the date to survive a reload unchanged.

The PRD is precise about what a due date *is*, by what it omits. NG-06 rules out notifications and reminders, so the date never triggers anything. `AC-010.6` confirms that overdue dates are not special-cased — they simply sort ahead of nearer-future ones. C-03 closes the attribute list at title, due date, priority, and status; there is no time-of-day field and no timezone field.

So a due date here is a **calendar day**, not an instant in time. That distinction is the whole of this decision, and getting it wrong is a classic source of off-by-one bugs: a task due "March 3" rendering as March 2 for a user whose local clock sits west of UTC.

## Decision

Represent `Task.dueDate` as `string | null`, where the string is an **ISO 8601 calendar date: `YYYY-MM-DD`**. No time component. No timezone. No offset.

`null` means the task has no due date — a first-class, valid state per `AC-002.2` and `AC-002.7`, never an error and never rendered as one.

The same representation is used in memory, in the stored JSON payload (ADR-0003), and at the DOM boundary. The native `<input type="date">` control both produces and consumes exactly this format, so **no conversion happens anywhere** — there is no parse/format boundary at which a timezone can be applied by accident.

Validation on decode is a shape check against `YYYY-MM-DD` or `null` (ADR-0006). No range restriction: past dates are legal, because `AC-010.6` assumes their existence.

## Alternatives considered

### A. JavaScript `Date` object

The obvious default.

**Rejected — this is the alternative the decision exists to avoid.** A `Date` is an instant (milliseconds since epoch), not a day. Constructing one from a date-only string applies UTC, then rendering it applies the local timezone; for any user behind UTC the displayed day shifts backwards by one. A task due March 3 shows as March 2 in Los Angeles. Nothing in the product needs instant semantics, since NG-06 removes the only feature (reminders) that would. `Date` also does not survive `JSON.stringify`/`parse` as a `Date` — it round-trips to a string anyway — so it would need rehydration on every load, which is extra code whose only contribution is a bug class.

### B. Epoch milliseconds (number)

Compact, sorts numerically.

**Rejected.** Same timezone problem as A, with the additional cost of being unreadable in storage and in test fixtures. It also encodes a false precision: a due date does not have a millisecond.

### C. ISO 8601 date-time with timezone (`2026-10-01T00:00:00Z`)

**Rejected.** Encodes a time and a timezone the product does not have and cannot meaningfully fill in. Midnight in whose zone? The answer is arbitrary, and any arbitrary answer becomes a source of drift when a user travels or when the stored value is read in a different locale. It also adds noise to storage for no gain.

### D. Structured object (`{ year, month, day }`)

Semantically honest — it really is a calendar day.

**Rejected as over-built.** It is correct but inconvenient: it does not compare with a single operator, it serializes to three fields per task instead of one, and it requires conversion at both the `<input type="date">` boundary and the sort comparator. The ISO string has identical semantics with none of that friction.

### E. `Temporal.PlainDate`

The right *type*, semantically — a calendar date with no instant and no zone.

**Rejected for now, on pragmatics.** It does not serialize directly to JSON (it would be stored as its ISO string anyway, i.e. as this decision, plus a rehydration step), and it would add a construction/validation layer at every boundary. Worth reconsidering if the domain ever grows real date arithmetic; it has none today.

## Consequences

**Positive**

- **No timezone bugs are possible.** A calendar day is stored as a calendar day and displayed as a calendar day. There is no instant to convert, so there is nothing to convert wrongly. This is the decision's entire purpose.
- **Lexicographic comparison equals chronological comparison.** ISO date strings sort correctly with a plain string comparison, so ADR-0007's comparator needs no date parsing for its primary key — `AC-010.1` and `AC-010.6` fall out of `a < b`.
- **Lossless round-trip through JSON.** `JSON.stringify`/`parse` returns the identical string, satisfying `AC-008.1`'s "same … due dates" with no rehydration step.
- **Zero-conversion DOM boundary.** `<input type="date">` speaks this format natively, so the value read from the input is the value stored, and vice versa. Fewer moving parts, and the native control keeps the field keyboard-accessible per `AC-A11Y.1`.
- Storage and test fixtures are human-readable, which makes decoder tests and corrupt-payload fixtures (ADR-0006) easy to write and to review.

**Negative**

- A string is structurally weaker than a date type: `"2026-13-45"` is a well-formed string but not a real date. Mitigated by shape validation on decode, and in practice the only writer is `<input type="date">`, which cannot emit an invalid date. A malformed value from hand-edited storage is caught by ADR-0006 and degrades the payload rather than crashing.
- Any future date arithmetic (add a week, compute days remaining) would need a parse step or a date library. The product has no such requirement — NG-06 removes the feature that would have driven it.
- Display formatting for other locales, if ever wanted, requires an explicit format step. Not a current requirement.

**Neutral**

- `null` for "no due date" is checked before the date comparison in ADR-0007's comparator, which is what places undated tasks last (`AC-010.2`) rather than letting them sort as empty strings.

## Requirement and acceptance-criteria references

| Reference | Relevance |
| --- | --- |
| `FR-002`, `AC-002.1–7` | Optional due date, settable and clearable, valid when absent |
| `FR-010`, `AC-010.1`, `AC-010.2`, `AC-010.6` | Lexicographic sort equals chronological sort; overdue not special-cased |
| `AC-008.1` | Lossless persistence round-trip |
| `AC-A11Y.1` | Native `<input type="date">` keeps the control keyboard-operable |
| C-03 | Attribute list closed — no time-of-day or timezone field exists |
| NG-06 | No reminders, so no instant semantics are needed |
| Architecture §2.1, §2.2, §9.1 | Source of this decision |

## Revisit if

- The product ever gains reminders or time-of-day due times, which would mean reopening NG-06 and C-03 at PRD level first.
