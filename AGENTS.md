# AGENTS.md

Project-specific Codex operating rules for this repository.
Primary goal: reduce token usage without reducing code quality.

## 1) Core Objective

- Keep context narrow and decisions explicit.
- Prefer small, verifiable changes over broad refactors.
- Run the smallest meaningful validation first, then escalate only when needed.

## 2) Repo Routing (Read This First)

- `services/*`:
  - Go services: `api-gateway`, `user`, `product-service`, `cart`, `order`, `payment`, `inventory`, `shipping`, `notification`, `review`, `analytics`, `chat`, `media`, `live-service`.
  - NestJS services: `auth-service` only (`product-service-nest` is legacy shadow/compare, not default compose).
- `shared/*`: cross-service contracts (`proto`, `kafka`, shared types/constants/contracts).
- `packages/backend-shared/*`: NestJS shared runtime helpers.
- `frontend/*`: buyer/buyer-web/seller/moderator apps and shared frontend packages.
- `docs/development/code-standards.md`: coding and architecture conventions.

Rule: do not scan unrelated folders unless the task explicitly crosses boundaries.

## 3) Token-Efficient Workflow

1. Scope first:
   - Identify target service/module and affected boundary (`service-only`, `cross-service`, `shared contract`).
2. Read minimally:
   - Start with `rg` and targeted file reads.
   - Avoid opening large files end-to-end unless required.
3. Patch minimally:
   - Change only required files/functions.
   - Avoid opportunistic refactors and cosmetic rewrites.
4. Verify progressively:
   - Run smallest relevant checks first.
   - Escalate test scope only if risk or failures indicate.
5. Report compactly:
   - Summarize what changed, why, and what was validated.

## 4) Validation Ladder (Required)

Pick the lowest level that still protects correctness:

- `L0 - Smoke` (tiny change, low risk):
  - Compile/lint/test only directly touched module when available.
- `L1 - Service scope` (default):
  - For Go service changes: run `go test ./...` inside that service.
  - For `auth-service`: run workspace test/build for that service only.
  - For `product-service-nest` (legacy): only when touching shadow/compare scripts.
- `L2 - Contract/integration scope`:
  - If API/event behavior changed, run corresponding `scripts/test-*-service.sh` or relevant compare script.
- `L3 - Full monorepo` (expensive; only when necessary):
  - `npm run test` or broad Turbo tasks only for cross-cutting changes.

Escalation rule: if lower level fails for unclear reasons, debug locally first; do not jump to `L3` by default.

## 5) Canonical Commands

- Search files/text:
  - `rg --files <path>`
  - `rg -n "<pattern>" <path>`
- Go service test:
  - `cd services/<go-service> && go test ./...`
- NestJS service test/build:
  - `npm --workspace services/auth-service run test`
  - `npm --workspace services/auth-service run build`
  - `npm --workspace services/product-service-nest run test`
  - `npm --workspace services/product-service-nest run build`
- Monorepo (expensive):
  - `npm run test`
  - `npm run build`

## 6) Change Boundaries and Safety

- MUST keep backend runtime code in `services/*`.
- MUST keep shared contracts in `shared/*`.
- MUST NOT import runtime code directly across services.
- MUST follow naming/structure rules in `docs/development/code-standards.md`.
- MUST update/add tests for changed behavior (happy path + relevant failure path).

If changing `shared/proto` or `shared/kafka`, explicitly check producer/consumer impact before editing.

## 7) Response Compactness Rules (for Codex outputs)

- Keep progress updates short and factual.
- In final response, include only:
  - changed files,
  - key behavior changes,
  - commands run + pass/fail,
  - unresolved risks/questions.
- Do not paste large code blocks unless user asks.

## 8) Reusable Prompt Block

Use this prompt to reduce repeated instruction tokens:

```txt
Follow AGENTS.md and docs/development/code-standards.md.
Task scope: <service/module>.
Goal: implement minimal patch, keep architecture boundaries, and preserve behavior.
Workflow: scope -> targeted read -> minimal patch -> validation ladder (L0/L1 first).
Run only necessary tests for affected scope; escalate only if risk/failure requires.
Return: changed files, why changed, tests run, remaining risks.
```
