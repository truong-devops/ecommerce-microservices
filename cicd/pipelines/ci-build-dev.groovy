pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
  }

  parameters {
    string(name: 'SERVICES', defaultValue: 'api-gateway,auth-service,user-service,product-service,cart-service,order-service,payment-service,inventory-service,shipping-service,notification-service,analytics-service,review-service,chat-service,live-service,media-service', description: 'Comma-separated services/apps to build')
    string(name: 'REGISTRY', defaultValue: 'docker.io/vantruong179', description: 'Docker Hub namespace')
    string(name: 'IMAGE_REPO_PREFIX', defaultValue: 'ecommerce-microservices-', description: 'Docker Hub repository prefix before service name')
    string(name: 'DOCKERHUB_CREDENTIAL_ID', defaultValue: 'dockerhub-credentials', description: 'Jenkins username/password credential for Docker Hub')
    booleanParam(name: 'RUN_OWASP_DEPENDENCY_CHECK', defaultValue: true, description: 'Run OWASP Dependency Check when dependency-check.sh is installed')
    booleanParam(name: 'RUN_SONARQUBE', defaultValue: false, description: 'Run SonarQube analysis when scanner/credentials are configured')
    string(name: 'SONAR_HOST_URL', defaultValue: 'https://sonar.dt-commerce.site', description: 'SonarQube URL')
    string(name: 'SONAR_CREDENTIAL_ID', defaultValue: 'sonar-token', description: 'Jenkins Secret text credential containing the SonarQube token')
    booleanParam(name: 'TRIGGER_CD_JOB', defaultValue: true, description: 'Trigger the GitOps CD job after images are pushed')
    string(name: 'CD_JOB_NAME', defaultValue: 'ecommerce-dev-cd-gitops', description: 'Jenkins CD job to trigger')
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
          mkdir -p reports/trivy reports/dependency-check reports/sonar
          echo "IMAGE_TAG=${IMAGE_TAG}"
          echo "SELECTED_SERVICES=${SELECTED_SERVICES}"
        '''
      }
    }

    stage('Unit Test') {
      steps {
        script {
          selectedServices().each { svc ->
            if (goServices().contains(svc)) {
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
            } else if (frontendApps().containsKey(svc)) {
              def workspace = frontendWorkspaceFor(svc)
              sh """
                set -eu
                docker run --rm \
                  --volumes-from "\$(hostname)" \
                  -w "\$PWD" \
                  node:20-alpine \
                  sh -lc 'npm ci --workspace ${workspace} --no-audit --no-fund && npm --workspace ${workspace} run build'
              """
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
            def sourcePath = sourcePathFor(svc)
            sh """
              set -eu
              trivy fs \
                --severity HIGH,CRITICAL \
                --exit-code 1 \
                --format table \
                --output reports/trivy/fs-${svc}.txt \
                ${sourcePath}
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
          docker run --rm \
            --volumes-from "$(hostname)" \
            owasp/dependency-check:latest \
            --project ecommerce-microservices \
            --scan "$PWD/services" \
            --format HTML \
            --out "$PWD/reports/dependency-check" \
            --failOnCVSS 9
        '''
      }
    }

    stage('SonarQube Analysis') {
      when {
        expression { return params.RUN_SONARQUBE }
      }
      steps {
        withCredentials([string(credentialsId: params.SONAR_CREDENTIAL_ID, variable: 'SONAR_TOKEN')]) {
          sh """
            set -eu
            docker run --rm \
              --volumes-from "\$(hostname)" \
              -w "\$PWD" \
              -e SONAR_HOST_URL="${params.SONAR_HOST_URL}" \
              -e SONAR_TOKEN="\${SONAR_TOKEN}" \
              sonarsource/sonar-scanner-cli:latest \
              -Dsonar.projectKey=ecommerce-microservices \
              -Dsonar.projectName=ecommerce-microservices \
              -Dsonar.sources=services \
              -Dsonar.host.url="${params.SONAR_HOST_URL}" \
              -Dsonar.token="\${SONAR_TOKEN}"
          """
        }
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
            if (frontendApps().containsKey(svc)) {
              def appPath = sourcePathFor(svc)
              sh """
                set -eu
                docker build \
                  -f ${appPath}/Dockerfile \
                  -t ${image}:${env.IMAGE_TAG} \
                  -t ${image}:dev \
                  .
              """
            } else {
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

    stage('Trigger CD GitOps Job') {
      when {
        expression { return params.TRIGGER_CD_JOB }
      }
      steps {
        build job: params.CD_JOB_NAME,
          wait: false,
          parameters: [
            string(name: 'SERVICES', value: env.SELECTED_SERVICES),
            string(name: 'IMAGE_TAG', value: env.IMAGE_TAG),
            string(name: 'REGISTRY', value: params.REGISTRY),
            string(name: 'IMAGE_REPO_PREFIX', value: params.IMAGE_REPO_PREFIX),
            string(name: 'GIT_BRANCH', value: env.BRANCH_NAME ?: 'main'),
            string(name: 'API_BASE_URL', value: 'https://api.dt-commerce.site')
          ]
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'reports/**/*', allowEmptyArchive: true
    }
    success {
      echo "Built image tag: ${env.IMAGE_TAG}. Run the CD GitOps job with this tag."
    }
  }
}

def selectedServices() {
  def allowedServices = goServices() + ['auth-service'] + frontendApps().keySet().toList()
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

def goServices() {
  return ['api-gateway', 'user-service', 'product-service', 'cart-service', 'order-service', 'payment-service', 'inventory-service', 'shipping-service', 'notification-service', 'analytics-service', 'review-service', 'chat-service', 'live-service', 'media-service']
}

def frontendApps() {
  return [
    'buyer-web': 'buyer-web',
    'seller-web': 'seller',
    'moderator-web': 'moderator'
  ]
}

def frontendWorkspaceFor(String serviceName) {
  if (serviceName == 'buyer-web') {
    return '@frontend/buyer-web'
  }
  if (serviceName == 'seller-web') {
    return '@frontend/seller'
  }
  if (serviceName == 'moderator-web') {
    return '@frontend/moderator'
  }
  error "Unknown frontend app: ${serviceName}"
}

def sourcePathFor(String serviceName) {
  if (frontendApps().containsKey(serviceName)) {
    return "frontend/apps/${frontendApps()[serviceName]}"
  }
  return "services/${serviceName}"
}
