---
description: Review a page, component or design system for design quality.
---

# /design-review — Design Excellence Review

Run a comprehensive design quality review on a target (page, component, or full system).

## Usage

```
/design-review [target]
/design-review app/page.tsx
/design-review components/ui/Card.tsx
/design-review system    # full system audit
```

## What This Does

1. **Classify** the target type (component, page, or system)
2. **Run Design QA** — 5-gate validation (tokens, accessibility, brand, performance, motion)
3. **Run Brand Check** — voice compliance, character placement, CTA quality
4. **Generate Report** — actionable verdicts with line-specific fixes

## Review Sequence

```
STEP 1 — Read target file(s)
STEP 2 — Run Gate 1: Token Compliance scan
STEP 3 — Run Gate 2: Accessibility check
STEP 4 — Run Gate 3: Brand compliance (load voice from CREATOR.md)
STEP 5 — Run Gate 4: Performance audit
STEP 6 — Run Gate 5: Motion quality check
STEP 7 — Synthesize: single report with verdict + fix list
```

## For System-Wide Audit

When target is "system":
1. Scan all component files for token violations
2. Check globals.css for orphaned/unused variables
3. Verify typography consistency across pages
4. Count total violations by severity
5. Generate system health score (0-100)

## Output

Delivers a Design QA Report with:
- Overall verdict (PASS / CONDITIONAL / NEEDS REVISION / BLOCKED)
- Gate-by-gate results
- Blocking issues (must fix) with file:line references
- Non-blocking issues (should fix)
- Approved patterns (what's working)
