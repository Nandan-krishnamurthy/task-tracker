# ADR-0008: Three-tier testing boundaries

**Status:** Accepted
**Date:** 2026-09-23
**Station:** 3 — Architecture Decision Records
**Related:** ADR-0001, ADR-0002, ADR-0006

---

## Context

Station 1 produced 67 functional acceptance criteria plus 17 non-functional ones, each written to be independently verifiable. They are not homogeneous, and the differences matter for where each is tested:

- Most describe **decisions** — what order tasks appear in, whether a title is valid, which tasks belong to which view. These involve no browser.
- Some describe **rendered behavior and focus** — that a validation message is visible and announced, that focus survives a delete (`AC-009.2`, `AC-A11Y.3`).
- A few can only be honestly verified in a **real browser**: `AC-008.2` requires closing and reopening the browser; `AC-A11Y.1`/`AC-A11Y.4` require real focus order and native control behavior; `AC-SEC.1` requires observing that no network request carries task data.

Two architectural facts shape the answer. ADR-0001 puts all decision logic in a pure `core/` layer with no DOM or storage dependency, so most criteria are testable without a browser. ADR-0002 declines a UI framework, which means the focus-restoration mechanism is hand-written — and therefore is exactly the kind of code that needs tests rather than trust.

There is also a whole category that does **not** exist here: C-01 means no API, no database, no auth, and `NFR-SEC-001` means no network calls. There are no contract tests, no integration-with-backend tests, and nothing to mock.

## Decision

Three tiers, each with a defined remit, deliberately **bottom-heavy**.

### Tier 1 — Unit (`tests/unit/`, Vitest, no DOM)

Covers `core/` and the pure decoder in `persistence/`. Fast, exhaustive, the bulk of the suite.

Targets: `validateTitle`; the four-key comparator; the filter selector; task create/update/toggle/delete; the payload decoder (every corruption fixture); the store reducer.

### Tier 2 — DOM / integration (`tests/dom/`, Vitest + jsdom, storage faked)

Covers store + render + event wiring together, with an **in-memory storage fake** so failure modes are directly injectable rather than simulated.

Targets: render correctness; validation surfacing and clearing; **all five focus-management situations from architecture §9.4**; accessible names; storage failure injection; that persistence is called on every mutation.

Plus one structural test: **no module outside `persistence/` references `localStorage`** — the automated form of ADR-0001's invariant and of ADR-0006's no-crash guarantee.

### Tier 3 — End-to-end (`tests/e2e/`, Playwright, real browser)

Deliberately few. Reserved for what jsdom cannot honestly simulate.

| Scenario | Why a real browser is required |
| --- | --- |
| J1, J2, J3 happy paths | Real event and render pipeline |
| J4: reload, then close and reopen the browser context | jsdom cannot restart a browser |
| Keyboard-only traversal of all four journeys | Real focus order and native control behavior |
| Seed corrupt data into real `localStorage`, then load | Exercises the genuine storage API |
| Network silence across all journeys | Requires real network interception |

### Fixed parameters

`AC-PERF.3` requires the latency bound be validated at a stated list size. **Fixed at 500 tasks** — well past a realistic personal list, and a concrete number in place of A-02's unbounded assumption. This is a *test parameter, not a product limit*; no cap is enforced in the app.

### Explicitly out of scope

No API or contract tests; no backend or database tests; no network mocking beyond the silence assertion; no cross-browser sync tests; **no multi-tab consistency tests** — NG-07 means there is no guarantee to test, so a test asserting one would be testing a non-goal into existence.

## Alternatives considered

### A. E2E-only ("test it like a user")

Run everything through Playwright.

**Rejected.** The 20-odd ordering and validation criteria would each need a browser, making the suite slow enough that people stop running it — and a failing E2E test localizes poorly: a broken comparator surfaces as "the list looked wrong". ADR-0001 was chosen specifically so this logic could be tested directly; routing it through a browser discards that benefit.

### B. Unit-only, no browser tier

Trust jsdom for everything.

**Rejected.** `AC-008.2` (close and reopen the browser) is not simulable in jsdom — faking it would be asserting our own fake. Real focus order, native `<input type="date">` behavior, and `AC-SEC.1` network silence are likewise unverifiable there. And ADR-0002's hand-written focus mechanism is precisely the code that most warrants a real-browser check.

### C. Two tiers (unit + E2E, no jsdom layer)

Skip the middle.

**Rejected.** The middle tier is where the ADR-0002 risk actually lives. Focus restoration across re-render has five specified situations (architecture §9.4); testing each in a real browser is slow and flaky, testing them in jsdom is fast and precise. Storage-failure injection also belongs here — ADR-0006's three failure modes are trivial to inject against a fake and awkward to induce in a real browser.

### D. Add visual regression testing

**Rejected as disproportionate.** No acceptance criterion concerns pixels. The one visual requirement — that completed tasks are distinguishable (`AC-004.7`) — is asserted structurally, and contrast is a review checklist item (architecture §9.6), not a snapshot diff.

### E. Jest instead of Vitest

**Rejected on P2.** Vitest shares Vite's transform pipeline (ADR-0002), so there is no second build configuration to maintain. Jest would need its own TypeScript transform for no gain.

## Consequences

**Positive**

- Every acceptance criterion has a **named home**. Architecture §10 maps criteria to tiers, so coverage gaps are visible rather than assumed.
- The suite is fast where it is large: most tests are pure functions with no browser, so they run in milliseconds and are run often.
- Failures localize well — a comparator bug fails a comparator test, not "the app looks wrong".
- The `localStorage` invariant test converts an architectural convention into a gate, which is what keeps ADR-0001's and ADR-0006's guarantees true over time rather than on day one.
- Corruption handling is tested against real fixture strings in Tier 1 and real storage in Tier 3, covering both the logic and the integration.

**Negative**

- Playwright is the single heavyweight dev dependency — a browser download and meaningfully slower CI. Justified by five scenarios that cannot be verified any other way, and kept to those five.
- Three tiers means three configurations (Vitest node, Vitest jsdom, Playwright) in a project that is otherwise very small.
- jsdom is an approximation. A Tier 2 focus test can pass where a real browser would differ, which is why keyboard traversal is *also* covered in Tier 3.

**Neutral**

- The 500-task performance figure is an engineering parameter chosen here, not a product limit. If A-02 is ever resolved with a real cap, this number should be revisited alongside it.
- Tier boundaries follow ADR-0001's layer boundaries exactly, so a change in layering implies a change here.

## Requirement and acceptance-criteria references

| Reference | Tier |
| --- | --- |
| `AC-001.4`, `AC-009.1`, `AC-009.4`, `AC-005.6` (validation) | 1 |
| `AC-010.1`, `AC-010.2`, `AC-010.5`, `AC-010.6`, `OQ-01`/`OQ-02` determinism | 1 |
| `AC-007.1–3` (filtering), `AC-002.*`, `AC-003.*`, `AC-004.4`, `AC-005.*`, `AC-006.4` | 1 |
| `AC-008.6`, `AC-SUP.1` (decoder fixtures) | 1 and 3 |
| `AC-009.2`, `AC-009.3`, `AC-009.5`, `AC-009.6` (validation surfacing) | 2 |
| `AC-A11Y.2`, `AC-A11Y.3` (names, focus) | 2 |
| `AC-SUP.2`, `AC-SUP.3` (storage failure injection) | 2 |
| `AC-008.4` (persistence on every mutation) | 2 |
| `AC-001.3`, `AC-004.2`, `AC-006.1`, `AC-006.2` (journeys) | 3 |
| `AC-008.1`, `AC-008.2`, `AC-008.3`, `AC-006.3`, `AC-010.7` (J4) | 3 |
| `AC-A11Y.1`, `AC-A11Y.4` (keyboard-only) | 3 |
| `AC-SEC.1`, `AC-SEC.2`, `AC-PERF.2` (network silence) | 3 |
| `AC-PERF.1`, `AC-PERF.3` | 3, at 500 tasks |
| NG-07 | Explicitly untested — no guarantee exists |
| Architecture §10.1–10.4 | Source of this decision |

## Revisit if

- Playwright's cost becomes disproportionate in CI (the five scenarios would need re-justifying individually, not dropping wholesale).
- ADR-0002 is overturned — a framework would change what Tier 2 looks like.
