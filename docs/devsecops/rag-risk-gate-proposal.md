# RAG-Based DevSecOps Risk Gate Proposal

This document describes a proposed research extension for the ecommerce microservices platform. It is not implemented in the current source and is not part of the active GitLab CI pipeline.

## Proposed Topic

```txt
Build an AI RAG system that supports vulnerability analysis, risk prioritization, and deployment control in a DevSecOps pipeline for microservices.
```

## Problem

Security scanners such as Trivy, Semgrep, and Gitleaks can detect vulnerabilities, insecure code patterns, exposed secrets, and container or Kubernetes misconfigurations. However, scanner output is usually evaluated with generic severity values such as CVSS.

In a microservices system, the actual deployment risk also depends on local context:

- whether the service is public or internal
- whether the service handles payment, identity, personal data, or low-risk analytics
- whether the vulnerable dependency is used at runtime
- whether the target environment is development, staging, or production
- whether compensating controls exist in Kubernetes, gateway, or network policy

The research goal is to compare context-aware risk assessment with traditional severity-only assessment.

## Current Foundation In This Repository

Already available:

- GitLab CI jobs for Gitleaks, Semgrep, Trivy filesystem scan, Trivy image scan, and SBOM generation.
- Docker image build and Harbor-compatible publish scripts.
- Helm values that describe service images and deployment settings.
- Kyverno policy examples for image source, non-`latest` tags, pod security, resource limits, and signed-image verification in audit mode.
- Local ELK stack for runtime log collection and search.

Not implemented:

- RAG ingestion pipeline.
- Vector database or knowledge base index.
- CVE/CWE/OWASP knowledge retrieval.
- Service criticality model.
- Context-aware risk scoring engine.
- Pipeline job that consumes scanner reports and outputs `PASS`, `WARNING`, or `BLOCK`.

## Proposed Data Sources

Security scan inputs:

- Trivy filesystem and image reports
- Semgrep SAST reports
- Gitleaks secret scan reports
- SBOM files

Context inputs:

- service criticality metadata
- service exposure metadata
- Dockerfiles and Kubernetes/Helm manifests
- architecture documents
- security policies and internal runbooks
- CVE, CWE, and OWASP references

## Proposed Decision Output

```txt
PASS
```

Allow deployment. Findings are low risk in the current service and environment context.

```txt
WARNING
```

Allow deployment but create a remediation task. Findings are relevant but not critical enough to block the current environment.

```txt
BLOCK
```

Stop deployment. Findings are high-risk in context, such as exploitable vulnerabilities in a public or high-criticality service.

## Example

Traditional severity-only assessment:

```txt
CVE score: 9.8
Decision: block every affected service
```

Context-aware RAG assessment:

```txt
payment-service
- CVSS: 9.8
- exposure: public
- criticality: high
- environment: production
- decision: BLOCK

analytics-service
- CVSS: 9.8
- exposure: internal
- criticality: low
- runtime reachability: not confirmed
- environment: development
- decision: WARNING
```

## Evaluation Direction

The proposed evaluation compares:

- severity-only decisions based on scanner severity or CVSS
- RAG-assisted decisions using service and deployment context

Expected evaluation metrics:

- reduction of false positive blocking decisions
- improvement in vulnerability prioritization
- consistency of generated remediation recommendations
- time saved during security triage
