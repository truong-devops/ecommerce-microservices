pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
  }

  parameters {
    string(name: 'SERVICES', defaultValue: 'api-gateway,auth-service,user-service,product-service,cart-service', description: 'Comma-separated services to build and deploy')
    string(name: 'REGISTRY', defaultValue: 'docker.io/vantruong179', description: 'Docker Hub namespace')
    string(name: 'IMAGE_REPO_PREFIX', defaultValue: 'ecommerce-microservices-', description: 'Docker Hub repository prefix before service name')
    string(name: 'DOCKERHUB_CREDENTIAL_ID', defaultValue: 'dockerhub-credentials', description: 'Jenkins username/password credential for Docker Hub')
    string(name: 'NAMESPACE', defaultValue: 'ecommerce-dev', description: 'Kubernetes namespace')
    string(name: 'KUSTOMIZE_DIR', defaultValue: 'infrastructure/kubernetes/overlays/dev', description: 'Kustomize overlay to apply')
    string(name: 'API_BASE_URL', defaultValue: 'https://api.dt-commerce.site', description: 'Public API base URL for smoke test')
    booleanParam(name: 'RUN_OWASP_DEPENDENCY_CHECK', defaultValue: false, description: 'Run OWASP Dependency Check when dependency-check.sh is installed')
  }

  environment {
    KUBECONFIG_CREDENTIAL_ID = 'kubeconfig-ecommerce-dev'
  }

  stages {
    stage('Init') {
      steps {
        script {
          env.IMAGE_TAG = sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()
          env.SELECTED_SERVICES = params.SERVICES.split(',')
            .collect { it.trim() }
            .findAll { it }
            .join(',')
        }
        sh '''
          set -eu
          mkdir -p reports/trivy reports/dependency-check
          echo "IMAGE_TAG=${IMAGE_TAG}"
          echo "SELECTED_SERVICES=${SELECTED_SERVICES}"
        '''
      }
    }

    stage('Unit Test') {
      steps {
        script {
          def goServices = ['api-gateway', 'user-service', 'product-service', 'cart-service']
          selectedServices().each { svc ->
            if (goServices.contains(svc)) {
              sh """
                set -eu
                docker run --rm \
                  --volumes-from "\$(hostname)" \
                  -w "\$PWD/services/${svc}" \
                  golang:1.26.3 \
                  sh -lc '/usr/local/go/bin/go test ./...'
              """
            } else if (svc == 'auth-service') {
              sh '''
                set -eu
                docker run --rm \
                  --volumes-from "$(hostname)" \
                  -w "$PWD/services/auth-service" \
                  node:20-alpine \
                  sh -lc 'npm ci --no-audit --no-fund && npm test'
              '''
            } else {
              error "Unknown service for test stage: ${svc}"
            }
          }
        }
      }
    }

    stage('Trivy Filesystem Scan') {
      steps {
        script {
          selectedServices().each { svc ->
            sh """
              set -eu
              trivy fs \
                --severity HIGH,CRITICAL \
                --exit-code 1 \
                --format table \
                --output reports/trivy/fs-${svc}.txt \
                services/${svc}
            """
          }
        }
      }
    }

    stage('OWASP Dependency Check') {
      when {
        expression { return params.RUN_OWASP_DEPENDENCY_CHECK }
      }
      steps {
        sh '''
          set -eu
          if ! command -v dependency-check.sh >/dev/null 2>&1; then
            echo "dependency-check.sh is not installed"
            exit 1
          fi
          dependency-check.sh \
            --project ecommerce-microservices \
            --scan services \
            --format HTML \
            --out reports/dependency-check
        '''
      }
    }

    stage('Docker Hub Login') {
      steps {
        withCredentials([usernamePassword(credentialsId: params.DOCKERHUB_CREDENTIAL_ID, usernameVariable: 'DOCKERHUB_USER', passwordVariable: 'DOCKERHUB_TOKEN')]) {
          sh '''
            set -eu
            echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USER" --password-stdin
          '''
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          selectedServices().each { svc ->
            def image = dockerImageFor(svc)
            sh """
              set -eu
              docker build \
                -t ${image}:${env.IMAGE_TAG} \
                -t ${image}:dev \
                services/${svc}
            """
          }
        }
      }
    }

    stage('Trivy Image Scan') {
      steps {
        script {
          selectedServices().each { svc ->
            def image = dockerImageFor(svc)
            sh """
              set -eu
              trivy image \
                --severity HIGH,CRITICAL \
                --exit-code 1 \
                --format table \
                --output reports/trivy/image-${svc}.txt \
                ${image}:${env.IMAGE_TAG}
            """
          }
        }
      }
    }

    stage('Docker Push') {
      steps {
        script {
          selectedServices().each { svc ->
            def image = dockerImageFor(svc)
            sh """
              set -eu
              docker push ${image}:${env.IMAGE_TAG}
              docker push ${image}:dev
            """
          }
        }
      }
    }

    stage('Deploy Kubernetes') {
      steps {
        withCredentials([file(credentialsId: env.KUBECONFIG_CREDENTIAL_ID, variable: 'KUBECONFIG_FILE')]) {
          script {
            try {
              sh """
                set -eu
                export KUBECONFIG="\$KUBECONFIG_FILE"
                kubectl apply -k ${params.KUSTOMIZE_DIR}
              """

              selectedServices().each { svc ->
                def image = dockerImageFor(svc)
                sh """
                  set -eu
                  export KUBECONFIG="\$KUBECONFIG_FILE"
                  kubectl -n ${params.NAMESPACE} set image deployment/${svc} ${svc}=${image}:${env.IMAGE_TAG}
                  kubectl -n ${params.NAMESPACE} rollout status deployment/${svc} --timeout=240s
                """
              }
            } catch (err) {
              selectedServices().each { svc ->
                sh """
                  set +e
                  export KUBECONFIG="\$KUBECONFIG_FILE"
                  kubectl -n ${params.NAMESPACE} rollout undo deployment/${svc}
                """
              }
              throw err
            }
          }
        }
      }
    }

    stage('Smoke Test') {
      steps {
        sh '''
          set -eu
          curl -fsS "${API_BASE_URL}/health"
          curl -fsS "${API_BASE_URL}/api/v1/products" >/dev/null
        '''
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'reports/**/*', allowEmptyArchive: true
    }
  }
}

def selectedServices() {
  def allowedServices = ['api-gateway', 'auth-service', 'user-service', 'product-service', 'cart-service']
  def selected = env.SELECTED_SERVICES?.split(',')?.collect { it.trim() }?.findAll { it } ?: allowedServices
  def unknown = selected.findAll { !allowedServices.contains(it) }
  if (unknown) {
    error "Unsupported service(s): ${unknown.join(', ')}"
  }
  return selected
}

def dockerImageFor(String serviceName) {
  return "${params.REGISTRY}/${params.IMAGE_REPO_PREFIX}${serviceName}"
}
