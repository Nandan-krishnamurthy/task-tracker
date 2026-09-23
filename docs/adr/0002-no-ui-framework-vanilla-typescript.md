# ADR-0002: No UI framework — vanilla TypeScript with Vite

**Status:** Accepted
**Date:** 2026-09-23
**Station:** 3 — Architecture Decision Records
**Related:** ADR-0001, ADR-0008

---

## Context

The application has one screen: a create form, a two-option filter, and a list of tasks with a checkbox, an inline edit form, and two buttons per row. There is no routing, no authentication surface (NG-01), no data fetching (C-01, `NFR-SEC-001`), and no grouping or nesting of any kind (NG-04). The entire UI surface is enumerated in §4.1 of the architecture.

The default reflex for a browser application in 2026 is to reach for React, Vue, or Svelte. That reflex deserves examination rather than obedience here, because the constraint the user placed on this station was explicit — *keep the architecture minimal and appropriate for this small client-side application* — and because the genuinely hard requirements in this product are not rendering problems:

- **Ordering** (`FR-010`, `AC-010.1–7`) is a comparator, not a view concern.
- **Persistence and its failure modes** (`FR-008`, `NFR-REL-001`, `NFR-SUP-001`) are a storage concern.
- **Accessible focus management** (`NFR-A11Y-001`, `AC-A11Y.3`, `AC-A11Y.4`) is the one place where a virtual-DOM layer actively makes life *harder*, because re-rendering a subtree is exactly what dislodges focus.

The shipped artifact is a static bundle with no server behind it (C-06), so runtime dependencies also carry an ongoing maintenance cost that nobody is staffed to pay.

## Decision

Build the UI in **vanilla TypeScript against the DOM**, with **Vite** as the build tool and dev server. **Zero runtime dependencies.** The shipped artifact is HTML, one CSS file, and one JS bundle.

TypeScript is retained (not plain JavaScript) because the domain has closed value sets — priority is exactly Low/Medium/High per C-04 — and the compiler turns `AC-003.3` ("no fourth level is offered") into a build-time guarantee rather than a test.

The UI layer is six plain modules that render and wire events (`app`, `taskForm`, `filterBar`, `taskList`, `taskItem`, `focus`), described in §4.2 of the architecture. Rendering strategy is **full rebuild of the list region** on state change, with **mandatory focus capture and restore** via stable `data-focus-key` attributes — see Consequences.

## Alternatives considered

### A. React (+ Vite)

The industry default. Familiar to most contributors; large ecosystem.

**Rejected.** It brings ~45 KB of runtime for a component tree two levels deep. Its main benefit — efficient reconciliation of large, deeply nested trees — has nothing to reconcile here. Critically, React's re-render cycle *creates* the focus-management problem we would then have to solve with `useRef` and effects; going without a framework does not remove that work, but it does not add a layer of indirection on top of it either. None of the three hard requirements above is made easier.

### B. Svelte

Compiles away, so runtime cost is near zero — the strongest alternative.

**Rejected, narrowly.** It would genuinely be small and pleasant. But it adds a compiler, a component-file format, and framework-specific testing setup to an app whose UI is ~200 lines of DOM code, and it introduces a dependency that must be tracked and upgraded for a static artifact with no server. The advantage over hand-written DOM at *this* size does not clear the bar set by principle P2.

### C. Web Components / Lit

Standards-based, encapsulated.

**Rejected.** Shadow DOM complicates exactly the two things this app must get right — global focus management across a re-rendered list, and label/`aria-describedby` associations that cross element boundaries (`AC-009.6`, `AC-A11Y.2`). Encapsulation is solving a problem (style collision at scale) that a single-view app does not have.

### D. Plain JavaScript, no TypeScript

Maximally minimal.

**Rejected.** Gives up the compile-time enforcement of C-03 (closed attribute list) and C-04 (three priority levels), and the exhaustiveness checking that keeps the action set in §3.2 honest. TypeScript is a build-time tool with zero runtime cost, so it does not offend P2.

## Consequences

**Positive**

- Zero runtime dependencies: no supply-chain surface, nothing to upgrade, no framework version to track for an app with no server.
- `NFR-PERF-001` (under 100 ms perceived latency) is met with enormous headroom — direct DOM writes on a list of realistic size, no reconciliation, no network (`AC-PERF.2`).
- Full control of the DOM makes the accessibility contract in §9 direct: semantic elements, real `<label>`s, explicit `aria-label`s, and an `aria-live` region wired exactly as `AC-009.6` and `AC-A11Y.5` require, with no framework abstraction in between.
- Small bundle supports DO-1 (first task within seconds of opening) and the "under 15 seconds to first task" success measure.

**Negative — and this is the real cost**

- **Focus preservation is our problem.** Rebuilding the list destroys keyboard focus, which would break `AC-A11Y.3` and `AC-A11Y.4`: a user who tabs to a checkbox and presses Space would lose their place on every toggle. The mitigation is *mandatory, not optional* — every focusable element carries a stable `data-focus-key`, and `ui/focus.ts` captures and restores focus (and cursor position) across each rebuild, with a defined fallback when the focused element no longer exists, such as after the user deletes the task they were focused on. Architecture §9.4 specifies the required behavior for five situations, and §10.2 requires a DOM test for each. **This mechanism is the principal risk carried by this ADR.**
- Rendering code is hand-written and more verbose than JSX. Contributors expecting React will need orientation.
- No ecosystem components: date input, select, and list are native elements. (In practice this helps accessibility rather than hurting it.)

**Neutral**

- This decision is **contained by ADR-0001**. `src/ui/` is the only directory affected. Swapping in React would leave `core/`, `store/`, `persistence/` and every one of their tests untouched — the reversal cost is bounded and known.

## Requirement and acceptance-criteria references

| Reference | Relevance |
| --- | --- |
| `NFR-PERF-001`, `AC-PERF.1`, `AC-PERF.2` | Direct DOM writes, no reconciliation, no network |
| `NFR-A11Y-001`, `AC-A11Y.1–5` | Semantic-first markup under full control; also the source of this ADR's main cost |
| `AC-003.3` | Closed priority union enforced by TypeScript at build time |
| C-03, C-04 | Compile-time enforcement of the closed attribute list and three-level scale |
| C-06 | Static build output; single-stage rollout, rollback = redeploy previous build |
| DO-1, success measure "under 15 seconds to first task" | Minimal bundle, fast first paint |
| Architecture §1.3, §1.4, §4.2, §4.3, §9.4 | Source of this decision |

## Revisit if

- The focus-restoration mechanism proves fragile in practice — repeated `AC-A11Y.3` regressions would be the signal that a framework's lifecycle hooks are worth their weight.
- The UI grows beyond a single view (which would require new product scope, since NG-04 forbids grouping today).
