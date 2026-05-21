pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
  }

  parameters {
    string(name: 'SERVICES', defaultValue: 'api-gateway,auth-service,user-service,product-service,cart-service', description: 'Comma-separated services to update in Kustomize')
    string(name: 'IMAGE_TAG', defaultValue: '', description: 'Image tag produced by the CI build job, normally git short SHA')
    string(name: 'REGISTRY', defaultValue: 'docker.io/truongdevops', description: 'Docker Hub namespace used by Kubernetes')
    string(name: 'KUSTOMIZE_DIR', defaultValue: 'infrastructure/kubernetes/overlays/dev', description: 'Kustomize overlay watched by Argo CD')
    string(name: 'GIT_BRANCH', defaultValue: 'main', description: 'Branch watched by Argo CD')
    string(name: 'GITHUB_REPO', defaultValue: 'https://github.com/truong-devops/ecommerce-microservices.git', description: 'GitHub repository URL')
    string(name: 'GITHUB_CREDENTIAL_ID', defaultValue: 'github-ecommerce-token', description: 'Jenkins username/password credential: GitHub username + PAT')
    string(name: 'API_BASE_URL', defaultValue: 'https://api.dt-commerce.site', description: 'Public API base URL for smoke test after Argo CD sync')
  }

  stages {
    stage('Validate') {
      steps {
        script {
          if (!params.IMAGE_TAG?.trim()) {
            error 'IMAGE_TAG is required'
          }
          env.SELECTED_SERVICES = params.SERVICES.split(',')
            .collect { it.trim() }
            .findAll { it }
            .join(',')
          env.GITHUB_REPO_NO_SCHEME = params.GITHUB_REPO.replaceFirst(/^https?:\/\//, '')
        }
      }
    }

    stage('Update Kustomize Image Tags') {
      steps {
        script {
          selectedServices().each { svc ->
            sh """
              set -eu
              docker run --rm \
                -v "\$PWD/${params.KUSTOMIZE_DIR}:/work" \
                -w /work \
                registry.k8s.io/kustomize/kustomize:v5.4.3 \
                edit set image ${svc}=${params.REGISTRY}/${svc}:${params.IMAGE_TAG}
            """
          }
        }
        sh """
          set -eu
          git diff -- ${params.KUSTOMIZE_DIR}
        """
      }
    }

    stage('Commit And Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: params.GITHUB_CREDENTIAL_ID, usernameVariable: 'GIT_USER', passwordVariable: 'GIT_TOKEN')]) {
          sh """
            set -eu
            git config user.name "jenkins-bot"
            git config user.email "jenkins@dt-commerce.site"
            git add ${params.KUSTOMIZE_DIR}/kustomization.yaml
            if git diff --cached --quiet; then
              echo "No image tag change to commit"
              exit 0
            fi
            git commit -m "chore(gitops): deploy dev ${params.IMAGE_TAG}"
            git remote set-url origin "https://\${GIT_USER}:\${GIT_TOKEN}@${env.GITHUB_REPO_NO_SCHEME}"
            git push origin HEAD:${params.GIT_BRANCH}
          """
        }
      }
    }

    stage('Wait For Argo CD Sync') {
      steps {
        sh '''
          set -eu
          echo "Argo CD will sync the Git change. Check argocd.dt-commerce.site if this stage is not wired to argocd CLI yet."
        '''
      }
    }

    stage('Smoke Test') {
      steps {
        sh '''
          set -eu
          for i in $(seq 1 30); do
            if curl -fsS "${API_BASE_URL}/health" && curl -fsS "${API_BASE_URL}/api/v1/products" >/dev/null; then
              exit 0
            fi
            sleep 10
          done
          exit 1
        '''
      }
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
