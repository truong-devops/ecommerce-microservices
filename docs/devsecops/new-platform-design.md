# DevSecOps Platform Design

This design replaces the legacy pipeline with a GitLab-centered DevSecOps workflow.

## Target Stack

- GitLab CI for pipeline automation.
- Harbor for private container images.
- Argo CD for GitOps deployment.
- Kubernetes for runtime.
- Trivy, Semgrep, Gitleaks, and Kyverno for security gates.
- Prometheus and Grafana for metrics.
- Elasticsearch, Logstash, Kibana, and Filebeat for logs.

## Code Flow

```txt
Developer
-> GitLab repository
-> GitLab CI merge request pipeline
-> lint, test, Gitleaks, Semgrep, Trivy filesystem scan
-> Docker build
-> Trivy image scan
-> SBOM generation
-> Cosign image signing
-> Harbor registry
-> GitOps values update
-> Argo CD sync
-> Kyverno admission policies
-> Kubernetes rollout
-> smoke tests
-> Prometheus/Grafana metrics
-> Filebeat/Logstash/Elasticsearch/Kibana logs
```

## Repository Layout

```txt
.gitlab-ci.yml
ci/scripts/
deploy/helm/ecommerce/
deploy/argocd/
deploy/kyverno/policies/
docs/devsecops/
```

## GitLab CI Variables

Configure these variables in GitLab project settings:

```txt
HARBOR_REGISTRY
HARBOR_PROJECT
HARBOR_USERNAME
HARBOR_PASSWORD
GITOPS_PUSH_TOKEN
COSIGN_PRIVATE_KEY
COSIGN_PASSWORD
```

## Phased Rollout

1. Run MR validation only: lint, test, Gitleaks, Semgrep, Trivy filesystem scan.
2. Enable Docker build and Trivy image scan.
3. Connect Harbor and publish images.
4. Deploy the Helm chart manually to a dev cluster.
5. Install Argo CD and apply `deploy/argocd/ecommerce-dev-application.yaml`.
6. Install Kyverno and apply policies from `deploy/kyverno/policies`.
7. Add Prometheus/Grafana and ELK into the cluster.
8. Switch image updates to digest-only GitOps promotion.

## Local ELK

Run the local application stack with ELK:

```bash
docker compose -f docker-compose.yml -f docker-compose.elk.yml up -d --build
```

Open Kibana at:

```txt
http://localhost:5601
```

Create a data view:

```txt
ecommerce-logs-local-*
```

More details: [`deploy/observability/elk/README.md`](../../deploy/observability/elk/README.md).

## Notes

- Replace `harbor.example.com` and `gitlab.example.com` placeholders before using this in a real environment.
- `require-signed-images` starts in `Audit` mode because it needs a real Cosign public key.
- The Helm chart assumes every service exposes `/health` and `/metrics`. Override `healthPath` per service if needed.
- The dev Helm values set `APP_ENV=production` so Go services use zap JSON logs, which are easier for Logstash and Elasticsearch to parse.

## ELK Readiness Check

The current source is mostly ready for ELK because services log to stdout/stderr and Kubernetes/Filebeat can collect those container logs.

What is already in place:

- Go services use `zap`.
- Go HTTP middleware emits request logs with request ID, method, path, status, duration, and client IP.
- HTTP request logs use ELK-friendly fields such as `service`, `request_id`, `status`, and `duration_ms`.
- `X-Request-ID` is generated or propagated by middleware.
- `auth-service` writes JSON lines to stdout through `AppLogger`.

Items to verify before deploying ELK:

1. Keep application logs on stdout/stderr. Do not write application logs to files inside containers.
2. Run Kubernetes services with `APP_ENV=production` or update the code to support a dedicated `LOG_FORMAT=json` flag.
3. Use Kubernetes metadata as a fallback for `service` when a non-HTTP log line does not include it.
4. Avoid logging secrets, tokens, passwords, authorization headers, and sensitive personal data.

Recommended Logstash normalization:

```txt
request_id = request_id || kubernetes.labels.request_id
service = service || kubernetes.labels.app.kubernetes.io/component || kubernetes.container.name
status = status
duration_ms = duration_ms || parsed duration
```
