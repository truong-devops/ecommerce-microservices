# CI/CD

This directory contains Jenkins-based pipeline definitions and deployment scripts.

- `pipelines/`: build, test, security scan, deploy, rollback flows.
- `scripts/`: shell scripts invoked by pipeline stages.

Primary automated flow:

```txt
Developer feature branch
-> GitHub PR into protected main
-> ecommerce-dev-ci-build
-> detect impacted services/apps
-> test + filesystem scan
-> no Docker push, no CD

PR approved + merged into main
-> ecommerce-dev-ci-build
-> detect impacted services/apps
-> Docker Hub image:<git-short-sha>
-> ecommerce-dev-cd-gitops
-> infrastructure/kubernetes/overlays/dev/kustomization.yaml
-> Argo CD ecommerce-dev sync
-> Kubernetes ecommerce-dev rollout
```

Docs-only, CI-only, and GitOps tag commits are skipped by the CI service detector so they do not rebuild runtime images.

The detailed design is documented in:

```txt
docs/deployment/automated-gitops-cicd-design.md
```
