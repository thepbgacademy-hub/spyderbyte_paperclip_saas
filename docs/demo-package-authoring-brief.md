# Demo / Blueprint Package Authoring Brief

**Audience:** anyone (human or AI) designing a Blueprint package for SpyderByte
Foundry. **Authoritative constraint source:** the code as written, not this doc —
if the loader and this brief ever disagree, the loader wins. Validate every
manifest with `loadBlueprintPackageManifest` + `createBlueprintPackage` before
treating it as real.

> **Why this brief exists:** a package designed against the codebase as written
> installs cleanly; a package designed against aspirational vocabulary is
> rejected at load. The current engine is a *deliberately bounded slice*
> (phases B0–B35): two stations, five tools, two specialists, two deliverable
> kinds. Design within it.

---

## The task

Design Blueprint packages that install and run against the platform **exactly as
written today**. Each package targets a market segment. Packages differ in
content — segment, brand voice, persona design, budgets, tool grants, provider
tier — but share the same two-station structural spine, because that is all the
engine accepts right now.

Deliverable per package: a complete `manifest.json`, plus the persona definition
files and deliverable templates as separate attachments (those side files are
inert today but are the substance wired in next).

## Hard rules — violate any and the package will not load

1. `manifest_schema` must be the number `1`. `type` must be exactly
   `"business_framework"`.
2. **Stations:** exactly two, `id` values **`"intake"`** and
   **`"positioning"`** — no other id is accepted. `intake`: `inputs: []`,
   `outputs: ["founder_profile"]`, `checkpoint: "none"`. `positioning`:
   `inputs: ["founder_profile"]`, `outputs: ["positioning_brief"]`,
   `checkpoint: "required"`. No `quality_check` field anywhere (its presence
   throws).
3. **Deliverables:** exactly two, `key` values **`"founder_profile"`** and
   **`"positioning_brief"`** — the only keys that produce real runtime content.
4. **Personas:** two, one per station. The intake persona lists only
   `["intake"]` in `allowed_stations`; the positioning persona only
   `["positioning"]`. A persona's stations must not span both — intake belongs
   to the `direction` specialist, positioning to `market`; mixing throws.
5. **Tools:** every string in `permissions.tools` and every persona
   `allowed_tools` must come from this exact set — nothing else exists:
   `structured_interview`, `document_generation`, `deliverable_write`,
   `brand_profile_update`, `web_research_readonly`. Each persona's
   `allowed_tools` must be a subset of the package-level `permissions.tools`.
6. `permissions.external_actions` values may only be `"approval_required"` or
   `"denied"`. `permissions.data_access.readable_deliverables` must be
   `"own_package"` or `"declared_dependencies"`.
7. `version` should be semver (e.g. `"1.0.0"`) for forward-compat, though it is
   not enforced yet. `package_id`, `package_key`, and `name` become
   **immutable** once published — choose them carefully.

## Naming / branding hygiene

- **Customer-facing** `name` and copy: the segment product name (brand voice
  lives here).
- **Internal identifiers** (`package_id`, `package_key`, `publisher`): neutral
  engineering names. **Never** use the strings `paperclip` or `wfpc`. Prefer
  lowercase-kebab keys or `pkg_`-prefixed names.

## Inert fields — fill correctly, but they do not run yet

- `provider_requirements.llm`: `required: true`; `capabilities` chosen only from
  `["structured_output", "tool_use", "long_context"]`; `preferred_tier` one of
  `"economy" | "standard" | "premium"`. Supported BYOK providers: anthropic,
  openai, openrouter, google, xai, plus OpenAI/Grok subscription connectors.
  Do not hardcode a provider — the platform matches capability→provider.
- `guardrails.scope_statement` and `guardrails.denied_actions`: write them
  meaningfully; they drive the customer-visible "Factory Rules" once wired.
- `min_platform_version`, `requires`: set sensibly (`"1.0.0"`, `[]`).

## Content files (the real creative work, delivered separately)

The manifest references persona definitions and deliverable templates by path
(e.g. `"personas/founder_guide.yaml"`, `"templates/founder_profile.md.hbs"`).
Not loaded by the engine yet, but author them for real:

- Per persona: system-prompt / behavioral definition (voice, what it interviews
  for, how it transforms answers, its boundaries).
- Per deliverable: the content template. `founder_profile` body fields are
  `founderName, businessName, primaryGoal, targetAudience, summary`.
  `positioning_brief` body fields are
  `headline, audience, primaryGoal, positioningSummary`.

## Canonical template

See `tests/factory-package-manifest-fixtures.ts` (`createCurrentSliceManifest`)
for the load-tested reference manifest. Copy its structure exactly; vary only
the content the rules above permit.

## Acceptance gate

Hand every finished manifest to the orchestrator, who runs it through
`loadBlueprintPackageManifest` + `createBlueprintPackage`. A package is not
"done" until it loads without throwing and derives the expected stations,
personas, and specialist bindings.
