<p align="center">
  <img src="https://img.shields.io/badge/Go-1.22%20%2F%201.24%20%2F%201.25-00ADD8?style=for-the-badge&logo=go&logoColor=white"/>
  <img src="https://img.shields.io/badge/NestJS-auth--service-E0234E?style=for-the-badge&logo=nestjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/Next.js-frontend-000000?style=for-the-badge&logo=nextdotjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/Jenkins-CI%2FCD-D24939?style=for-the-badge&logo=jenkins&logoColor=white"/>
  <img src="https://img.shields.io/badge/Argo%20CD-GitOps-EF7B4D?style=for-the-badge&logo=argo&logoColor=white"/>
  <img src="https://img.shields.io/badge/Kubernetes-Kustomize-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white"/>
</p>

<h1 align="center">Ecommerce Microservices Platform</h1>

<p align="center">
  A monorepo ecommerce platform with Go microservices, a NestJS auth service, Next.js frontend apps, Jenkins CI/CD, Docker Hub images, and Argo CD GitOps deployment to Kubernetes.
</p>

---

## Current Architecture

All public traffic enters through the ingress layer and is routed to the Go API Gateway. The gateway validates authentication context, applies cross-cutting HTTP policies, and forwards requests to backend services. Services communicate through HTTP for request/response paths and Kafka for asynchronous business events.

```txt
Users
  |
  | HTTPS
  v
Nginx Ingress / Kubernetes Ingress
  |
  +--> buyer-web / seller-web / moderator-web
  |
  +--> api-gateway
         |
         +--> auth-service        NestJS / TypeScript
         +--> Go services         user, product, cart, order, payment, inventory,
         |                        shipping, notification, analytics, review,
         |                        chat, live, media
         |
         +--> Kafka events
         |
         +--> PostgreSQL / MongoDB / Redis / MinIO
```

The Kubernetes manifests currently used by the GitOps flow are in:

```txt
infrastructure/kubernetes/base
infrastructure/kubernetes/overlays/dev
```

The public development environment is deployed into:

```txt
namespace: ecommerce-dev
Argo CD application: ecommerce-dev
public URLs:
  https://api.dt-commerce.site
  https://buyer.dt-commerce.site
  https://seller.dt-commerce.site
  https://moderator.dt-commerce.site
```

For presentation purposes, this environment can be described as a production-like environment. A separate production environment should use its own overlay and namespace, for example `overlays/prod` and `ecommerce-prod`.

---

## Monorepo Layout

```txt
ecommerce-microservices/
├── services/
│   ├── api-gateway/              # Go API gateway
│   ├── auth-service/             # NestJS authentication service
│   ├── user-service/             # Go user profile service
│   ├── product-service/          # Go product catalog service
│   ├── cart-service/             # Go cart service
│   ├── order-service/            # Go order service
│   ├── payment-service/          # Go payment service
│   ├── inventory-service/        # Go inventory service
│   ├── shipping-service/         # Go shipping service
│   ├── notification-service/     # Go notification service
│   ├── analytics-service/        # Go analytics service
│   ├── review-service/           # Go review service
│   ├── chat-service/             # Go realtime chat service
│   ├── live-service/             # Go live commerce service
│   └── media-service/            # Go media upload service
│
├── frontend/
│   ├── apps/
│   │   ├── buyer-web/            # Next.js buyer web app
│   │   ├── seller/               # Next.js seller dashboard
│   │   ├── moderator/            # Next.js moderator dashboard
│   │   └── buyer-mobile/         # Expo / React Native buyer mobile app
│   └── packages/                 # Shared frontend packages
│
├── packages/backend-shared/      # Shared NestJS backend helpers
├── shared/                       # Cross-service contracts and shared schemas
├── infrastructure/               # Docker, Kubernetes, monitoring, logging, Terraform
├── cicd/                         # Jenkins pipelines and CI/CD scripts
└── docs/                         # Architecture, deployment, API, and runbooks
```

---

## Services

Backend services:

| Service | Runtime | Main role |
|---|---|---|
| `api-gateway` | Go | Public API gateway, routing, auth context, rate limiting |
| `auth-service` | NestJS / TypeScript | Login, JWT, sessions, OAuth, TOTP/2FA |
| `user-service` | Go | User profiles and addresses |
| `product-service` | Go | Product catalog, shops, shoppable video metadata |
| `cart-service` | Go | Shopping cart and price snapshots |
| `order-service` | Go | Order lifecycle and checkout state |
| `payment-service` | Go | Mock payment processing and payment events |
| `inventory-service` | Go | Stock levels, reservations, outbox events |
| `shipping-service` | Go | Shipment and tracking workflows |
| `notification-service` | Go | Email and notification dispatch |
| `analytics-service` | Go | Business event ingestion and reporting |
| `review-service` | Go | Ratings and reviews |
| `chat-service` | Go | Buyer/seller realtime chat |
| `live-service` | Go | Live commerce sessions and realtime coordination |
| `media-service` | Go | Media upload/download through object storage |

Frontend apps:

| App | Runtime | Public URL |
|---|---|---|
| `buyer-web` | Next.js | `https://buyer.dt-commerce.site` |
| `seller-web` | Next.js | `https://seller.dt-commerce.site` |
| `moderator-web` | Next.js | `https://moderator.dt-commerce.site` |
| `buyer-mobile` | Expo / React Native | Mobile development app |

---

## CI/CD And GitOps Flow

The active deployment automation is Jenkins-based. The files under `.github/workflows/` are placeholders in the current repository and are not the deployment source of truth.

The real flow is:

```txt
Developer works on develop or a feature branch
  |
  | open Pull Request into main
  v
Jenkins multibranch PR validation
  |
  | test/build source + Trivy filesystem scan
  | no Docker push
  | no deployment
  v
PR passes and is merged into protected main
  |
  | GitHub webhook
  v
Jenkins main build
  |
  | detect impacted services/apps
  | test/build source
  | Trivy filesystem scan
  | Docker build
  | Trivy image scan
  | Docker push to Docker Hub
  v
Jenkins CD job: ecommerce-dev-cd-gitops
  |
  | kustomize edit set image <service>=<image>:<git-short-sha>
  | commit "chore(gitops): deploy dev <tag>"
  | push manifest change back to main
  v
Argo CD application: ecommerce-dev
  |
  | syncs infrastructure/kubernetes/overlays/dev
  v
Kubernetes namespace: ecommerce-dev
```

Important rule:

```txt
Pushing an image to Docker Hub does not deploy it by itself.
Kubernetes only changes after the GitOps manifest image tag changes
and Argo CD syncs that Git change into the cluster.
```

### What Runs On Pull Requests

Pull Requests validate code before it reaches `main`.

PR builds run:

- service/app detection from changed files
- Go tests for changed Go services
- `npm test` for `auth-service`
- Next.js builds for changed frontend web apps
- Trivy filesystem scans
- optional OWASP Dependency Check
- optional SonarQube analysis

PR builds do not run:

- Docker Hub login
- Docker image push
- GitOps CD job
- Argo CD deployment

### What Runs After Merge To Main

After a PR is merged into `main`, Jenkins is allowed to deploy. The main-branch build runs the same validation steps, then builds and pushes Docker images for impacted services/apps. If image scanning passes, Jenkins triggers `ecommerce-dev-cd-gitops`.

The CD job updates:

```txt
infrastructure/kubernetes/overlays/dev/kustomization.yaml
```

For example:

```yaml
- name: review-service
  newName: docker.io/vantruong179/ecommerce-microservices-review-service
  newTag: <git-short-sha>
```

Argo CD watches that overlay and applies the new image tag to Kubernetes.

### Change Detection

Jenkins only builds services/apps affected by the changed files:

| Changed path | Selected build target |
|---|---|
| `services/cart-service/**` | `cart-service` |
| `services/auth-service/**` | `auth-service` |
| `frontend/apps/buyer-web/**` | `buyer-web` |
| `frontend/apps/seller/**` | `seller-web` |
| `frontend/apps/moderator/**` | `moderator-web` |
| `frontend/packages/**` | all frontend web apps |
| `shared/**` | all runtime services/apps |
| `packages/backend-shared/**` | all runtime services/apps |
| root runtime config such as `package.json`, `package-lock.json`, `turbo.json`, `tsconfig.json` | all runtime services/apps |

GitOps-only commits are skipped so Jenkins does not loop forever:

```txt
commit subject starts with: chore(gitops):
or only this file changes:
infrastructure/kubernetes/overlays/dev/kustomization.yaml
```

Docs-only changes are expected to skip runtime image builds unless they are inside a service/app directory and the detector maps that service/app.

---

## Local Development

### Prerequisites

- Docker and Docker Compose
- Go matching the service module version
- Node.js 20+
- npm 10+

### Start The Local Stack

```bash
docker compose up -d
docker compose ps
```

### Workspace Commands

```bash
npm install
npm run build
npm run test
npm run lint
npm run format
```

Prefer service-scoped commands while developing:

```bash
cd services/cart-service
go test ./...

npm --workspace services/auth-service run test
npm --workspace @frontend/buyer-web run build
```

### Helper Scripts

```bash
./start-service.sh order-service
./run-fe.sh buyer-web
```

---

## Deployment Checks

After a main merge, use these checks to confirm whether deployment really happened.

Check the GitOps commit and image tag:

```bash
git fetch origin main
git log origin/main --oneline -5
git show origin/main:infrastructure/kubernetes/overlays/dev/kustomization.yaml | grep -A2 review-service
```

Check the running image in Kubernetes:

```bash
kubectl -n ecommerce-dev get deploy review-service -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n ecommerce-dev rollout status deploy/review-service
```

Check Argo CD:

```txt
Application: ecommerce-dev
Sync Status: Synced
Health Status: Healthy
Last Sync Revision: commit containing the GitOps image tag update
```

---

## Documentation

- [CI/CD design](./docs/deployment/automated-gitops-cicd-design.md)
- [CI/CD pipelines](./cicd/README.md)
- [Manual Kubernetes build and deploy runbook](./docs/deployment/manual-k8s-build-and-deploy-runbook.md)
- [API docs](./docs/api/README.md)
- [Development standards](./docs/development/code-standards.md)

---

## License

Licensed under the [MIT License](./LICENSE).
