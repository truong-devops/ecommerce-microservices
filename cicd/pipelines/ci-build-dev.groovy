pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
  }

  parameters {
    string(name: 'SERVICES', defaultValue: 'api-gateway,auth-service,user-service,product-service,cart-service,order-service,payment-service,inventory-service,shipping-service,notification-service,analytics-service,review-service,chat-service,live-service,media-service,buyer-web,seller-web,moderator-web', description: 'Comma-separated services/apps to build when auto detection is disabled')
    booleanParam(name: 'AUTO_DETECT_SERVICES', defaultValue: true, description: 'Detect impacted services/apps from changed files. Disable this for a manual custom build.')
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
          env.IS_PULL_REQUEST = isPullRequestBuild() ? 'true' : 'false'
          env.IS_MAIN_BRANCH = isMainBranchBuild() ? 'true' : 'false'
          env.DEPLOY_ALLOWED = (env.IS_PULL_REQUEST != 'true' && env.IS_MAIN_BRANCH == 'true') ? 'true' : 'false'
          env.AUTO_DETECT_SERVICES_VALUE = params.AUTO_DETECT_SERVICES ? 'true' : 'false'

          def changed = changedFilesForBuild()
          def selected = params.AUTO_DETECT_SERVICES ? detectChangedServices(changed) : requestedServices()

          env.CHANGED_FILE_COUNT = "${changed.size()}"
          env.SELECTED_SERVICES = selected.join(',')
          env.SKIP_CI = shouldSkipCi(changed, selected) ? 'true' : 'false'

          sh 'mkdir -p reports/trivy reports/dependency-check reports/sonar'
          writeFile file: 'reports/changed-files.txt', text: changed ? changed.join('\n') + '\n' : ''
        }
        sh '''
          set -eu
          mkdir -p reports/trivy reports/dependency-check reports/sonar
          echo "IMAGE_TAG=${IMAGE_TAG}"
          echo "IS_PULL_REQUEST=${IS_PULL_REQUEST}"
          echo "IS_MAIN_BRANCH=${IS_MAIN_BRANCH}"
          echo "DEPLOY_ALLOWED=${DEPLOY_ALLOWED}"
          echo "AUTO_DETECT_SERVICES=${AUTO_DETECT_SERVICES_VALUE}"
          echo "CHANGED_FILE_COUNT=${CHANGED_FILE_COUNT}"
          echo "SELECTED_SERVICES=${SELECTED_SERVICES:-}"
          echo "SKIP_CI=${SKIP_CI}"
        '''
      }
    }

    stage('Unit Test') {
      when {
        expression { return env.SKIP_CI != 'true' }
      }
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
      when {
        expression { return env.SKIP_CI != 'true' }
      }
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
        expression { return env.SKIP_CI != 'true' && params.RUN_OWASP_DEPENDENCY_CHECK }
      }
      steps {
        script {
          def scanTargets = selectedServices()
            .collectMany { svc -> dependencyCheckScanTargets(svc) }
            .unique()
            .findAll { target -> fileExists(target) }

          if (scanTargets.isEmpty()) {
            echo "No dependency manifest was found for OWASP Dependency Check."
            return
          }

          def scanArgs = scanTargets
            .collect { target -> "--scan \"\$PWD/${target}\"" }
            .join(' ')
          sh """
            set -eu
            docker run --rm \
              --volumes-from "\$(hostname)" \
              -v owasp-dependency-check-data:/usr/share/dependency-check/data \
              owasp/dependency-check:latest \
              --project ecommerce-microservices \
              ${scanArgs} \
              --disableNodeAudit \
              --format HTML \
              --out "\$PWD/reports/dependency-check" \
              --failOnCVSS 9
          """
        }
      }
    }

    stage('SonarQube Analysis') {
      when {
        expression { return env.SKIP_CI != 'true' && params.RUN_SONARQUBE }
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
      when {
        expression { return shouldBuildAndDeployImages() }
      }
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
      when {
        expression { return shouldBuildAndDeployImages() }
      }
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
      when {
        expression { return shouldBuildAndDeployImages() }
      }
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
      when {
        expression { return shouldBuildAndDeployImages() }
      }
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
        expression { return shouldBuildAndDeployImages() && params.TRIGGER_CD_JOB }
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
      script {
        if (env.SKIP_CI == 'true') {
          echo "Skipped CI because no runtime service/app change was detected."
        } else if (env.DEPLOY_ALLOWED != 'true') {
          echo "Validation finished for ${env.SELECTED_SERVICES}. Docker push and CD were skipped because this is not a main-branch deploy build."
        } else {
          echo "Built image tag: ${env.IMAGE_TAG}. Run the CD GitOps job with this tag."
        }
      }
    }
  }
}

def shouldBuildAndDeployImages() {
  return env.SKIP_CI != 'true' && env.DEPLOY_ALLOWED == 'true'
}

def shouldSkipCi(List changed, List selected) {
  if (isGitOpsOnlyCommit(changed)) {
    return true
  }
  if (params.AUTO_DETECT_SERVICES && selected.isEmpty()) {
    return true
  }
  return false
}

def isGitOpsOnlyCommit(List changed) {
  def subject = sh(script: 'git log -1 --pretty=%s', returnStdout: true).trim()
  if (subject.startsWith('chore(gitops):')) {
    return true
  }

  return changed && changed.every { it == 'infrastructure/kubernetes/overlays/dev/kustomization.yaml' }
}

def selectedServices() {
  def allowedServices = goServices() + ['auth-service'] + frontendApps().keySet().toList()
  def selected = env.SELECTED_SERVICES?.split(',')?.collect { it.trim() }?.findAll { it } ?: []
  def unknown = selected.findAll { !allowedServices.contains(it) }
  if (unknown) {
    error "Unsupported service(s): ${unknown.join(', ')}"
  }
  return selected
}

def requestedServices() {
  def selected = params.SERVICES.split(',')
    .collect { it.trim() }
    .findAll { it }
  def allowedServices = goServices() + ['auth-service'] + frontendApps().keySet().toList()
  def unknown = selected.findAll { !allowedServices.contains(it) }
  if (unknown) {
    error "Unsupported service(s): ${unknown.join(', ')}"
  }
  return selected
}

def changedFilesForBuild() {
  def changedOutput = ''

  if (isPullRequestBuild()) {
    def target = (env.CHANGE_TARGET ?: 'main').replaceAll(/[^A-Za-z0-9._\/-]/, '')
    sh(script: "git fetch origin ${target}:refs/remotes/origin/${target} --depth=100 || git fetch origin ${target} --depth=100 || true", returnStatus: true)
    def base = sh(script: "git merge-base HEAD origin/${target} 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || true", returnStdout: true).trim()
    if (base) {
      changedOutput = sh(script: "git diff --name-only ${base}...HEAD || true", returnStdout: true).trim()
    }
  }

  if (!changedOutput) {
    changedOutput = sh(script: 'git diff-tree --no-commit-id --name-only -r -m HEAD || true', returnStdout: true).trim()
  }

  return changedOutput
    ? changedOutput.split('\\n').collect { it.trim() }.findAll { it }.unique()
    : []
}

def detectChangedServices(List changed) {
  def selected = []

  changed.each { path ->
    def mapped = serviceGroupForPath(path)
    if (mapped == 'all-runtime') {
      selected.addAll(runtimeServices())
    } else if (mapped == 'all-backend') {
      selected.addAll(goServices() + ['auth-service'])
    } else if (mapped == 'all-frontend') {
      selected.addAll(frontendApps().keySet().toList())
    } else if (mapped) {
      selected << mapped
    }
  }

  return selected.unique()
}

def serviceGroupForPath(String path) {
  def parts = path.tokenize('/')

  if (parts.size() >= 2 && parts[0] == 'services') {
    def serviceName = parts[1]
    if ((goServices() + ['auth-service']).contains(serviceName)) {
      return serviceName
    }
  }

  if (parts.size() >= 3 && parts[0] == 'frontend' && parts[1] == 'apps') {
    def appDir = parts[2]
    def match = frontendApps().find { serviceName, dirName -> dirName == appDir }
    return match ? match.key : null
  }

  if (path.startsWith('frontend/packages/')) {
    return 'all-frontend'
  }

  if (path.startsWith('packages/backend-shared/') || path.startsWith('shared/')) {
    return 'all-runtime'
  }

  if (rootRuntimeFiles().contains(path)) {
    return 'all-runtime'
  }

  if (rootFrontendFiles().contains(path)) {
    return 'all-frontend'
  }

  return null
}

def rootRuntimeFiles() {
  return ['package.json', 'package-lock.json', 'turbo.json', 'tsconfig.json', 'tsconfig.base.json']
}

def rootFrontendFiles() {
  return ['frontend/package.json', 'frontend/package-lock.json', 'frontend/tsconfig.json', 'frontend/tsconfig.base.json']
}

def runtimeServices() {
  return goServices() + ['auth-service'] + frontendApps().keySet().toList()
}

def isPullRequestBuild() {
  return ((env.CHANGE_ID ?: '').trim() || (env.CHANGE_TARGET ?: '').trim()) ? true : false
}

def isMainBranchBuild() {
  if (isPullRequestBuild()) {
    return false
  }
  if ((env.BRANCH_NAME ?: '').trim()) {
    return env.BRANCH_NAME == 'main'
  }
  if ((env.GIT_BRANCH ?: '').trim()) {
    return env.GIT_BRANCH == 'main' || env.GIT_BRANCH == 'origin/main'
  }

  return true
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

def dependencyCheckScanTargets(String serviceName) {
  if (frontendApps().containsKey(serviceName)) {
    return [
      'package.json',
      'package-lock.json',
      "${sourcePathFor(serviceName)}/package.json"
    ]
  }

  if (serviceName == 'auth-service') {
    return [
      'services/auth-service/package.json',
      'services/auth-service/package-lock.json'
    ]
  }

  def basePath = sourcePathFor(serviceName)
  return [
    "${basePath}/go.mod",
    "${basePath}/go.sum"
  ]
}
