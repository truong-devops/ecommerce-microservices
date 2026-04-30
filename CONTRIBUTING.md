# Contributing to ecommerce-microservices

Thank you for taking the time to contribute. This document defines the conventions that keep our monorepo history clean, reviews efficient, and `main` always demo-ready.

> **Golden Rules**
> 1. Every change goes through a Pull Request
> 2. Commits are meaningful and scoped
> 3. Rebase daily, push frequently but with discipline
> 4. `main` is always deployable

---

## Table of Contents

- [Repository Layout](#repository-layout)
- [Branch Naming](#branch-naming)
- [Daily Workflow](#daily-workflow)
- [Commit Message Convention](#commit-message-convention)
- [Pull Request Process](#pull-request-process)
- [Conflict Resolution](#conflict-resolution)
- [Changing Shared Contracts](#changing-shared-contracts)
- [Monorepo Commands](#monorepo-commands)

---

## Repository Layout

Before contributing, familiarise yourself with the project structure:

| Path | Role |
|---|---|
| `services/` | 12 independently deployable microservices |
| `packages/backend-shared/` | NestJS runtime shared library (guards, pipes, interceptors, DTOs) |
| `shared/` | Language-neutral contracts — proto, Kafka events, TypeScript types |
| `frontend/` | Buyer, seller, and moderator applications + shared frontend packages |
| `infrastructure/` | Docker, K3s manifests, Kafka, monitoring, logging, Terraform |
| `cicd/` | Jenkins pipelines and deployment scripts |
| `docs/` | Architecture, API, deployment, and operations documentation |

---

## Branch Naming

### Pattern (required)

```
<type>/<scope>-<short-desc>
```

**`type`** — choose one:

| Type | When to use |
|---|---|
| `feature` | New functionality |
| `fix` | Bug fixes |
| `hotfix` | Urgent fix directly off `main` |
| `chore` | Config, dependencies, scripts, cleanup |
| `docs` | Documentation only |
| `refactor` | Large-scale refactoring |
| `perf` | Performance improvements |

**`scope`** — the affected service or area:

- **Backend**: `api-gateway`, `auth`, `user`, `product`, `inventory`, `cart`, `order`, `payment`, `shipping`, `notification`, `review`, `analytics`
- **Cross-cutting**: `shared`, `infra`, `cicd`, `docs`, `frontend-buyer`, `frontend-seller`

**`short-desc`** — lowercase, kebab-case, imperative form.

**✅ Valid examples:**
```
feature/order-checkout-saga
feature/analytics-clickhouse-migration
fix/payment-webhook-idempotency
chore/infra-add-fluent-bit-elk
docs/architecture-kafka-events
refactor/shared-http-error-shape
hotfix/api-gateway-rate-limit-crash
perf/product-service-redis-cache
```

**❌ Invalid:**
```
fixbug
update
new-feature
done
```

If the change is linked to a GitHub Issue, append the number: `feature/order-checkout-saga-#42`.

---

## Daily Workflow

### Start of day (required)

```bash
# 1. Update integration branch
git checkout develop
git pull --rebase

# 2. Create a new branch for your task
git checkout -b feature/order-checkout-saga

# 3. Sanity check (adjust filter for your service)
pnpm turbo run build --filter=@services/order-service
```

> **Tip**: Set these globals to make `git pull` always rebase and auto-stash:
> ```bash
> git config --global pull.rebase true
> git config --global rebase.autoStash true
> ```

### During the day (strongly recommended)

Commit in small, reviewable units — one endpoint, one module, one Kubernetes manifest. Push at least every 1–2 hours or after each meaningful milestone to reduce the risk of lost work and enable early review.

Suggested commit rhythm per task:
1. Scaffold / initial structure
2. Core implementation
3. Tests, fixes, lint clean-up

### End of day (required)

```bash
# Rebase against latest develop to surface conflicts early
git checkout develop && git pull --rebase
git checkout feature/order-checkout-saga
git rebase develop

# Push branch
git push

# Not finished yet? Open a Draft PR so your teammate can follow progress.
```

### Force push (only after rebase)

```bash
git push --force-with-lease   # safe — fails if remote changed unexpectedly
# Never use --force
```

---

## Commit Message Convention

This project follows **[Conventional Commits](https://www.conventionalcommits.org/)**.

### Format (required)

```
<type>(<scope>): <subject>
```

**`type`**: `feat` · `fix` · `refactor` · `perf` · `test` · `docs` · `style` · `chore` · `ci` · `build` · `revert`

**`scope`**: same as branch scope.

**`subject`**: imperative English phrase, ≤ 72 characters, no trailing period.  
Start with a verb: *add / implement / update / remove / handle / fix / support / expose*

### Examples

**✅ Good:**
```
feat(order): implement checkout saga with Kafka rollback
fix(payment): deduplicate webhooks using idempotency key
chore(infra): add fluent-bit daemonset for elk log shipping
docs(architecture): document kafka topics and event contracts
perf(product): add redis layer for hot-path catalog reads
test(auth): add integration tests for TOTP enrollment flow
```

**❌ Bad:**
```
update
fix bug
test commit
done
stuff
```

### Commit body (recommended for significant changes)

```
feat(inventory): add reservation TTL with automatic release

- Reserve stock for 10 minutes on order creation
- Release reservation on order cancellation or timeout
- Emit inventory.reserved and inventory.released Kafka events
- Migration: adds reserved_until column to inventory table
```

### Breaking changes

Use `!` in the type/scope, and document in the footer:

```
feat(api-gateway)!: change authentication header format

BREAKING CHANGE: clients must now send Authorization: Bearer <token>
instead of X-Auth-Token header
```

### WIP commits

Allowed in personal branches, **never merged** into `develop`/`main`. Use `chore(wip): ...` and squash/clean before opening a PR.

---

## Pull Request Process

### When to open a PR

Open a PR when you have completed a reviewable unit of work:
- A complete REST endpoint (route + validation + error handling)
- A Kafka consumer or producer module
- A complete service module
- A Kubernetes manifest or infrastructure change

For tasks spanning more than one day, open a **Draft PR** early so your teammate can track progress.

### PR title

Follow the same Conventional Commits format as your commits:

```
feat(order): checkout saga
fix(payment): webhook idempotency
chore(infra): prometheus alert rules for api-gateway
```

### PR description template

```markdown
## What
- Concise description of the change

## Why
- Business or technical motivation

## How to test
1. Step one
2. Step two

## Screenshots / Logs (optional)

## Notes / Risks
- Migration notes, rollback plan, or impact assessment
```

### PR checklist

Before requesting review, confirm all items:

- [ ] Rebased against latest `develop`
- [ ] Lint passes for affected service(s)
- [ ] Build passes for affected service(s)
- [ ] Clear testing instructions provided (manual steps acceptable)
- [ ] If `.proto` or Kafka event schemas changed → docs updated
- [ ] No build artifacts committed (`dist/`, `.next/`, `node_modules/`)
- [ ] No secrets or credentials in the diff

### Review standards

- Every PR requires **at least one approval** from a teammate before merging
- PRs larger than 400 lines should be split into smaller, focused PRs where possible
- Reviewers focus on: correctness, security, error handling, observability, edge cases, and naming

### Merge strategy

Use **Squash Merge** to keep a linear, readable history on `develop`:
> One PR → One commit on `develop`

---

## Conflict Resolution

```bash
# 1. Rebase your branch against develop
git rebase develop

# 2. Resolve conflicts in each file

# 3. Stage resolved files
git add <file>
git rebase --continue

# 4. Push (force-with-lease is safe here)
git push --force-with-lease
```

Aim to rebase at least once per day — morning pull and end-of-day push — to keep conflicts small and manageable.

---

## Changing Shared Contracts

Shared contracts are the most high-impact changes in this monorepo. Handle them with care.

### Changing Protocol Buffer definitions (`shared/proto/`)

1. Update the relevant `.proto` file
2. Regenerate stubs: `pnpm gen:proto` (or equivalent script)
3. Update all affected service implementations
4. Update documentation in `docs/architecture/`
5. PR title must include `(shared)` scope: `feat(shared): add pagination fields to order.proto`

### Changing Kafka event schemas (`shared/kafka/`)

1. **Non-breaking changes** (additive fields): update existing schema
2. **Breaking changes**: create a new version directory (`v2/`) — never mutate `v1` schemas in place
3. Update `docs/architecture/kafka-events.md`
4. Coordinate consumer updates with the team before merging producer changes

### Changing `packages/backend-shared/`

This library is imported by all NestJS services. Any interface or export change is effectively a breaking change across the entire backend. Discuss with the team before modifying public APIs.

---

## Monorepo Commands

All commands use **Turborepo** via `pnpm`:

```bash
# Build everything
pnpm build

# Run all services in dev mode (parallel)
pnpm dev

# Build a single service
pnpm turbo run build --filter=@services/order-service

# Run tests for a single service
pnpm turbo run test --filter=@services/auth-service

# Lint everything
pnpm lint
```

---

*Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) before contributing.*
