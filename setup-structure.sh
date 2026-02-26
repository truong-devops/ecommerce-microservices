#!/usr/bin/env bash
set -euo pipefail

# ===== Root folders =====
mkdir -p .github/{workflows,ISSUE_TEMPLATE,PULL_REQUEST_TEMPLATE}
mkdir -p {services,shared,frontend,infrastructure,cicd,docs,scripts}

# ===== Root files =====
touch .gitignore .env.example README.md CONTRIBUTING.md CODE_OF_CONDUCT.md LICENSE
touch docker-compose.yml docker-compose.override.yml
touch package.json tsconfig.json jest.config.js .eslintrc.json .prettierrc
touch turbo.json

# ===== GitHub =====
touch .github/workflows/{lint.yml,test.yml,build.yml,deploy.yml}
touch .github/ISSUE_TEMPLATE/{bug_report.md,feature_request.md}
touch .github/PULL_REQUEST_TEMPLATE/pull_request_template.md
touch .github/dependabot.yml

# ===== services/shared (service-shared-code as a package) =====
mkdir -p services/shared/src/{database/{entities,migrations,seeders},decorators,filters,guards,interceptors,pipes,middlewares,utils,constants,dto,types,config}
touch services/shared/src/database/entities/{base.entity.ts,audit.entity.ts}
touch services/shared/src/decorators/{api-response.ts,auth.ts,cache.ts}
touch services/shared/src/filters/{http-exception.filter.ts,grpc-exception.filter.ts}
touch services/shared/src/guards/{auth.guard.ts,role.guard.ts,rate-limit.guard.ts}
touch services/shared/src/interceptors/{logging.interceptor.ts,metrics.interceptor.ts,timeout.interceptor.ts,transform.interceptor.ts}
touch services/shared/src/pipes/{validation.pipe.ts,parse-uuid.pipe.ts}
touch services/shared/src/middlewares/{request-id.middleware.ts,logging.middleware.ts}
touch services/shared/src/utils/{logger.util.ts,pagination.util.ts,date.util.ts,error.util.ts}
touch services/shared/src/constants/{error-codes.const.ts,pagination.const.ts,regex.const.ts}
touch services/shared/src/dto/{pagination.dto.ts,api-response.dto.ts,error.dto.ts}
touch services/shared/src/types/{pagination.type.ts,common.type.ts}
touch services/shared/src/config/{app.config.ts,database.config.ts,cache.config.ts}
touch services/shared/src/index.ts
touch services/shared/{package.json,tsconfig.json,README.md}

# ===== 12+ services (skeleton only) =====
SERVICES=(api-gateway auth-service user-service product-service inventory-service cart-service order-service payment-service shipping-service notification-service review-service analytics-service livestream-service)
for s in "${SERVICES[@]}"; do
  mkdir -p "services/$s/src"
  touch "services/$s/Dockerfile" "services/$s/Dockerfile.prod" "services/$s/package.json" "services/$s/tsconfig.json" "services/$s/README.md"
  touch "services/$s/.env.example" "services/$s/.env.dev" "services/$s/.env.staging" "services/$s/.env.prod"
  touch "services/$s/.dockerignore" "services/$s/.eslintrc.json" "services/$s/.prettierrc"
done

# api-gateway extra structure
mkdir -p services/api-gateway/src/{config,modules,websocket,health}
touch services/api-gateway/src/config/{grpc.config.ts,rate-limit.config.ts,swagger.config.ts}
touch services/api-gateway/src/websocket/{websocket.gateway.ts,websocket.module.ts}
touch services/api-gateway/src/health/{health.controller.ts,health.service.ts}
touch services/api-gateway/src/{app.module.ts,main.ts}
mkdir -p services/api-gateway/test
touch services/api-gateway/test/{app.e2e-spec.ts,jest-e2e.json}
touch services/api-gateway/{docker-compose.dev.yml,docker-compose.override.yml}

# ===== shared/ (contracts: proto + kafka + utils etc.) =====
mkdir -p shared/{proto,kafka/events,contracts,utils,types,constants}
touch shared/proto/{auth.proto,product.proto,order.proto,common.proto}
touch shared/kafka/topics.ts
touch shared/kafka/consumers.ts
touch shared/kafka/events/{user.events.ts,order.events.ts,payment.events.ts,inventory.events.ts}
touch shared/contracts/{pagination.ts,api-response.ts,error.ts,index.ts}
touch shared/utils/{logger.ts,encryption.ts,validation.ts,http-client.ts,index.ts}
touch shared/types/{user.ts,product.ts,order.ts,index.ts}
touch shared/constants/{error-codes.ts,http-status.ts,app.ts}
touch shared/{package.json,README.md}

# ===== frontend =====
mkdir -p frontend/{apps,packages}

# buyer app skeleton
mkdir -p frontend/apps/buyer/{public,src}
mkdir -p frontend/apps/buyer/src/{app,components,pages,hooks,stores,services,utils,constants,types,styles}
touch frontend/apps/buyer/{.env.example,.env.dev,.env.staging,.env.prod,.eslintrc.json,.prettierrc,next.config.js,tailwind.config.js,tsconfig.json,Dockerfile,Dockerfile.prod,package.json,README.md}

# seller app skeleton
mkdir -p frontend/apps/seller/{public,src}
mkdir -p frontend/apps/seller/src/{app,components,hooks,stores,services,utils}
mkdir -p frontend/apps/seller/src/app/{dashboard,products,orders,analytics,settings}
touch frontend/apps/seller/{.env.example,.env.dev,.env.staging,.env.prod,.eslintrc.json,.prettierrc,next.config.js,tailwind.config.js,tsconfig.json,Dockerfile,Dockerfile.prod,package.json,README.md}

# frontend packages
PKGS=(ui api-client hooks stores utils constants types)
for p in "${PKGS[@]}"; do
  mkdir -p "frontend/packages/$p/src"
  touch "frontend/packages/$p/package.json" "frontend/packages/$p/README.md"
done
# ui package richer skeleton
mkdir -p frontend/packages/ui/src/{components,hooks,styles}
touch frontend/packages/ui/src/index.ts frontend/packages/ui/tsconfig.json
mkdir -p frontend/packages/ui/src/components/{Button,Card,Modal,Form,Layout}

# api-client skeleton
mkdir -p frontend/packages/api-client/src/{apis,models}
touch frontend/packages/api-client/src/{client.ts,index.ts}

# ===== infrastructure =====
mkdir -p infrastructure/terraform/environments/{dev,staging,prod}
mkdir -p infrastructure/terraform/modules/{vpc,ec2,rds,security-groups,s3,iam}
mkdir -p infrastructure/terraform/scripts
touch infrastructure/terraform/environments/dev/{main.tf,variables.tf,outputs.tf,terraform.tfvars}
touch infrastructure/terraform/modules/vpc/{main.tf,variables.tf,outputs.tf}
touch infrastructure/terraform/scripts/{k3s-master.sh,k3s-worker.sh,init-cluster.sh}
touch infrastructure/terraform/README.md

# k3s + kustomize + extras
mkdir -p infrastructure/k3s/{base,overlays,deployments,services,ingress,configmaps,secrets,hpa,pdb,networkpolicy,namespaces}
touch infrastructure/k3s/base/{kustomization.yaml,namespace.yaml,configmap.yaml,secret.yaml}
mkdir -p infrastructure/k3s/overlays/dev
touch infrastructure/k3s/overlays/dev/{kustomization.yaml,replicas-patch.yaml,resource-limits.yaml}
mkdir -p infrastructure/k3s/overlays/{staging,prod}
touch infrastructure/k3s/namespaces/{production.yaml,staging.yaml,monitoring.yaml}
touch infrastructure/k3s/ingress/{ingress.yaml,certificate.yaml}
touch infrastructure/k3s/hpa/hpa.yaml
touch infrastructure/k3s/pdb/pdb.yaml
touch infrastructure/k3s/networkpolicy/network-policy.yaml
touch infrastructure/k3s/README.md

# docker env composes
mkdir -p infrastructure/docker
touch infrastructure/docker/{.dockerignore,docker-compose.dev.yml,docker-compose.staging.yml,docker-compose.prod.yml}

# kafka
mkdir -p infrastructure/kafka
touch infrastructure/kafka/{docker-compose.kafka.yml,topics.yaml,README.md}

# monitoring (prom + grafana + thanos)
mkdir -p infrastructure/monitoring/prometheus/alert-rules
mkdir -p infrastructure/monitoring/grafana/{dashboards,provisioning}
mkdir -p infrastructure/monitoring/thanos
touch infrastructure/monitoring/prometheus/prometheus.yml
touch infrastructure/monitoring/prometheus/alert-rules/{services.rules.yml,infrastructure.rules.yml,business.rules.yml}
touch infrastructure/monitoring/prometheus/README.md
touch infrastructure/monitoring/grafana/datasources.yml
touch infrastructure/monitoring/grafana/dashboards/{services-overview.json,business-metrics.json,infrastructure.json}
touch infrastructure/monitoring/README.md
touch infrastructure/monitoring/thanos/thanos.yml

# logging (ELK)
mkdir -p infrastructure/logging/{elasticsearch,logstash/pipeline,kibana}
touch infrastructure/logging/elasticsearch/{elasticsearch.yml,index-template.json,README.md}
touch infrastructure/logging/logstash/pipeline/{services.conf,kubernetes.conf}
touch infrastructure/logging/logstash/README.md
touch infrastructure/logging/kibana/{kibana.yml,dashboards.json}
touch infrastructure/logging/README.md

# ===== cicd =====
mkdir -p cicd/{pipelines,scripts}
touch cicd/{Jenkinsfile,README.md}
touch cicd/pipelines/{build.groovy,test.groovy,security-scan.groovy,deploy-dev.groovy,deploy-staging.groovy,deploy-prod.groovy,rollback.groovy}
touch cicd/scripts/{docker-build.sh,docker-push.sh,k3s-deploy.sh,k3s-rollback.sh,health-check.sh,smoke-tests.sh}

# ===== docs =====
mkdir -p docs/{architecture,api,deployment,operations,development}
touch docs/README.md
touch docs/architecture/{system-design.md,data-flow.md,security.md,scalability.md,kafka-events.md}
touch docs/api/{openapi.yaml,auth-api.md,product-api.md,order-api.md}
touch docs/deployment/{aws-setup.md,k3s-setup.md,terraform-guide.md,jenkins-setup.md}
touch docs/operations/{monitoring.md,logging.md,troubleshooting.md,backup-restore.md,disaster-recovery.md}
touch docs/development/{local-setup.md,testing.md,code-standards.md,git-workflow.md}

# ===== scripts =====
touch scripts/{setup-dev.sh,gen-proto.sh,gen-api-client.sh,seed-db.sh,reset-db.sh,health-check.sh,README.md}

echo "✅ Structure created."
