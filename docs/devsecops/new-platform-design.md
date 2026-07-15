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

## Notes

- Replace `harbor.example.com` and `gitlab.example.com` placeholders before using this in a real environment.
- `require-signed-images` starts in `Audit` mode because it needs a real Cosign public key.
- The Helm chart assumes every service exposes `/health` and `/metrics`. Override `healthPath` per service if needed.
