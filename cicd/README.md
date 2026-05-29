# CI/CD

This directory contains Jenkins-based pipeline definitions and deployment scripts.

- `pipelines/`: build, test, security scan, deploy, rollback flows.
- `scripts/`: shell scripts invoked by pipeline stages.

Primary automated flow:

```txt
GitHub push main
-> ecommerce-dev-ci-build
-> Docker Hub image:<git-short-sha>
-> ecommerce-dev-cd-gitops
-> infrastructure/kubernetes/overlays/dev/kustomization.yaml
-> Argo CD ecommerce-dev sync
-> Kubernetes ecommerce-dev rollout
```

The detailed design is documented in:

```txt
docs/deployment/automated-gitops-cicd-design.md
```
