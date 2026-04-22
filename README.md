# Design Tokens Playground

A minimal DTCG token pipeline with one end-to-end production spike across all layers:

- design-values -> universal -> system -> semantic -> component
- one color chain
- one spacing chain

The repository is intentionally small so the build, validation, and workflow behavior are easy to reason about.

## Current Token Spike

### Color chain

1. `blue.500.lightness` -> `0.4989`
2. `blue.500` -> `oklch({blue.500.lightness} {blue.chroma} {blue.hue})`
3. `light.color.brand.primary` -> `{blue.500}`
4. `action.color.background.primary` -> `{light.color.brand.primary}`
5. `button.primary.color.background` -> `{action.color.background.primary}`

### Spacing chain

1. `space.scale.200` -> `0.5rem`
2. `space.control.padding.inline.md` -> `{space.scale.200}`
3. `light.space.button.padding.inline` -> `{space.control.padding.inline.md}`
4. `action.space.padding.default` -> `{light.space.button.padding.inline}`
5. `button.primary.space.padding.inline` -> `{action.space.padding.default}`

## Commands

```bash
npm install
npm run build
npm run preview
```

### Build variants

```bash
npm run build:css-only
npm run build:js-only
npm run build:types-only
npm run build:watch
npm run clean
npm test
```

### CLI flags

```bash
npm run build -- --prefix ds
npm run build -- --output-dir dist
npm run build -- --no-css
npm run build -- --no-js
npm run build -- --no-types
npm run build -- --no-json
npm run build -- --no-references
```

## Outputs

`npm run build` generates:

- `dist/css/variables.css`
- `dist/tokens.json`
- `dist/tokens.resolved.json`
- `dist/tokens.interpreted.json`
- `dist/tokens.js`
- `dist/tokens.d.ts`

## Project Structure

```text
tokens/
  design-values/tokens.json
  universal/tokens.json
  system/tokens.json
  semantic/tokens.json
  component/tokens.json

src/
  index.ts
  build-config.ts
  build-tokens.ts
  token-loader.ts
  token-reference-resolver.ts
  token-validator.ts

tests/
  fixtures/
    valid/                  # happy-path fixture (all 5 layers)
    invalid-naming/         # breaks Curtis Nathan kebab-case rule
    invalid-hierarchy/      # universal token referencing another layer
    invalid-reference/      # unresolved {path.to.token}
  token-loader.test.ts
  token-validator.test.ts
  token-pipeline.test.ts

.github/scripts/
  token-common.ts
  create-token.ts
  update-token.ts
  delete-token.ts
```

## Token Naming — Curtis Nathan convention

Every token path has four group slots:

```text
{namespace}.{object}.{base}.{modifier}
```

| Group | What it captures | Example |
| --- | --- | --- |
| namespace | `system.theme.domain` model; in actual token paths use theme/domain only | `light.color` |
| object | group / component / element | `button.primary` |
| base | category / concept / property | `color.background` |
| modifier | variant / state / scale / mode | `hover.on-light` or _(empty)_ |

- Every segment must be **lowercase kebab-case** (`on-brand`, `primary-text`, `500`).
- Hierarchy is selected separately by folder, workflow input, or CLI flag — do **not** include it in the token path.
- References may point to tokens in the same layer or any lower layer:
  design-values → design-values, universal → design-values/universal,
  system → design-values/universal/system,
  semantic → design-values/universal/system/semantic,
  component → design-values/universal/system/semantic/component.

Validation is enforced at build time (`npm run build`) and by the Jest suite
(`npm test`). Issue forms under `.github/ISSUE_TEMPLATE/` only ask for the four
group fields — see the inline examples in each form for guidance.

## What This Repository Does

- Loads and merges `tokens/{design-values,universal,system,semantic,component}/tokens.json`
- Validates Curtis Nathan naming + 5-layer hierarchy references
- Runs TokenScript (`@tokens-studio/tokenscript-interpreter`) for value interpretation and validation
- Resolves token references for the resolved JSON output
- Builds CSS, JS, and TypeScript outputs via Style Dictionary

## What This Repository Does Not Try To Do

- Ship a full production design system token catalog
- Maintain broad example token sets
- Hide implementation complexity with large docs

## DTCG Draft Compliance Gaps (Current State)

This repository intentionally implements a minimal pipeline and does not yet
fully implement all requirements from the current DTCG draft modules.

### High-priority gaps

- No JSON Pointer reference support (`$ref`) in repository-level resolution.
  Current local resolver handles curly-brace aliases (`{path.to.token}`), but
  property-level `$ref` resolution is not implemented.
- No group extension support (`$extends`) with JSON Schema-equivalent behavior.
  Deep merge semantics, circular detection for extension chains, and related
  error conditions are not implemented here.
- No support for root tokens via `$root` semantics.
- No group-level type inheritance. Tokens currently require explicit `$type` on
  leaves in static validation.

### Validation and type-system weaknesses

- `$type` is treated as a string and is not strictly validated against the full
  DTCG type set in this repository's own validator.
- Naming validation is stricter than the DTCG format in places (project-specific
  kebab-case constraints), which can reject some otherwise valid DTCG token files.
- Group reserved-key behavior from DTCG (for example `$extends`, `$root`) is not
  fully modeled in static validation logic.

### Composite and advanced type coverage

- Composite types from the format draft (for example typography, border,
  strokeStyle, transition, gradient, shadow) are not comprehensively validated
  end-to-end by this repository's own static rules.
- Output transforms for composite types are not fully standardized in this
  project; CSS/JS output is focused on the current minimal token set.

### Resolver module coverage

- The DTCG Resolver module workflow (resolver documents, sets, modifiers,
  resolutionOrder, input validation, permutation handling) is not implemented in
  this repository.
- There is currently no first-class support for `.resolver.json` documents.

### Error and conformance behavior

- Build-time interpretation issues are surfaced as warnings, and the pipeline can
  continue, rather than enforcing strict fail-fast conformance in all cases.

### Scope note

The above is a deliberate scope choice to keep this repository small and easy to
reason about. If full DTCG draft conformance becomes a goal, these gaps should
be treated as the roadmap baseline.

## Preview

Use:

```bash
npm run preview
```

This builds first, then serves `preview/index.html` and reads from `dist/tokens.resolved.json`.

## Automation

GitHub workflows in `.github/workflows/` support create, update, and delete token requests via issue templates and helper scripts under `.github/scripts/`.
