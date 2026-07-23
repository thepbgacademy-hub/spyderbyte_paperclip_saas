# Demo Blueprint packages

Two demo packages authored against the current bounded slice (intake →
positioning). Both **pass the real loader** — see
`tests/demo-packages-load.test.ts`, which runs each `manifest.json` through
`loadBlueprintPackageManifest` and asserts the derived two-station spine and
`direction`/`market` specialist bindings.

Authoring rules: `docs/demo-package-authoring-brief.md`.

## Catalog

| Package | Segment | Provider tier | Note |
|---|---|---|---|
| `local-service-launch` | Solo home-service founders (cleaners, lawn care, handymen, detailers) | economy | Grants `web_research_readonly` to the positioning persona |
| `solo-consultant-positioning` | Independent consultants / fractional experts | premium | No web research; positions from the founder's own evidence only |

## File status

Each package ships `manifest.json` (the load-enforced contract) plus persona
definitions and deliverable templates (inert today — referenced by path but not
yet loaded or executed by the engine; they are the substance wired in next).

**Outstanding:** `local-service-launch/templates/positioning_brief.md.hbs` was
referenced by that manifest but not supplied by the author. It is inert, so its
absence does not affect loading, but it should be authored before templates are
wired. Demo 2 supplied both templates.

## Runtime reality (why the spine is fixed)

The engine currently produces real content only for two deliverable kinds:
`founder_profile` (intake) and `positioning_brief` (positioning). Station ids
are restricted to `intake` and `positioning`; the intake station belongs to the
`direction` specialist and positioning to `market`. Packages differ in content,
budgets, tool grants, brand voice, and provider tier — not in structure — until
the engine grows more stations.
