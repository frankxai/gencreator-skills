---
description: Build a component from a design brief, Figma URL or description and check design-system compliance.
---

# /design-build — Build Component from Design Brief

Create a new component from a design brief, Figma URL, or description. Enforces full design system compliance.

## Usage

```
/design-build [description or Figma URL]
/design-build "Feature grid — 3-column cards with icon, title, description, CTA"
/design-build https://figma.com/design/abc123/File?node-id=1-2
```

## What This Does

1. **Parse input** — design brief, Figma URL, or screenshot
2. **Check existing** — search primitives and components for reusable parts
3. **Build component** — token-compliant, accessible, animated
4. **Run QA** — 5-gate validation before delivery
5. **Deliver** — complete file + import + usage example

## Build Sequence

```
STEP 1 — Input analysis
  If Figma URL: call get_design_context (budget permitting)
  If brief: extract requirements (layout, colors, interactions, content)
  If screenshot: analyze visual structure

STEP 2 — Existing component check
  Search primitives.tsx for matching base components
  Search components/ui/ for similar patterns
  Check code-connect.json for Figma mappings

STEP 3 — Build
  Apply component template from component-engineering skill
  Use tokens from design-system-governance (NEVER hardcode)
  Add M3 state layers + Apple HIG focus rings on interactive elements
  Add M3 motion curves for enter/exit animations
  Add prefers-reduced-motion check

STEP 4 — QA Gate
  Run 5-gate validation (design-qa skill)
  If BLOCKED: fix issues automatically, re-run
  If NEEDS REVISION: fix and note
  If PASS: deliver

STEP 5 — Deliver
  Complete TypeScript component file
  Import statement for usage
  Props interface with JSDoc
  Usage example
  Token references used
```

## Figma Integration

When a Figma URL is provided:
1. Extract fileKey and nodeId from URL
2. Call `get_design_context` with project framework settings
3. Map ALL Figma values to project tokens
4. Never use raw hex/values from Figma output
5. Add Code Connect mapping after building

## Quality Guarantees

Every component built by this command:
- Zero hardcoded color values
- WCAG 2.2 accessible (focus rings, touch targets, contrast)
- M3 state layers on interactive surfaces
- M3 motion curves with reduced-motion fallback
- Proper TypeScript types
- Server component by default ("use client" only when needed)
