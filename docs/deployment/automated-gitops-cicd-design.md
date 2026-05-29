# Automated GitOps CI/CD Design

Tài liệu này mô tả quy trình tự động hóa hiện tại sau khi Jenkins, Docker Hub, Kubernetes và Argo CD đã chạy được.

Mục tiêu:

```txt
Developer push code lên feature branch và mở Pull Request vào `main`
-> Jenkins tự chạy CI để kiểm tra PR
-> PR pass + review approve
-> Merge PR vào protected branch `main`
-> Jenkins chạy CI/CD cho commit mới trên `main`
-> Build, scan, push image cho service/app bị ảnh hưởng
-> Jenkins CD cập nhật image tag trong Kustomize
-> Argo CD tự sync manifest mới vào Kubernetes
-> Public environment thay đổi theo commit mới
```

Trong hệ thống hiện tại, môi trường public đang chạy qua overlay:

```txt
infrastructure/kubernetes/overlays/dev
namespace: ecommerce-dev
Argo CD app: ecommerce-dev
```

Nếu thuyết trình gọi đây là production, nên nói rõ đây là **production-like environment**. Khi cần production thật, tạo overlay riêng `overlays/prod` và namespace `ecommerce-prod`.

## 1. Kiến Trúc Tổng Quan

```txt
Developer
  |
  | git push origin feature/<scope>
  v
GitHub repository
  |
  | Pull Request into protected main
  v
Jenkins job: ecommerce-dev-ci-build
  |
  | detect changed files
  | PR validation only
  | test + filesystem scan impacted services/apps
  | no Docker push, no CD
  v
Review + required checks pass
  |
  | merge PR
  v
Protected branch: main
  |
  | webhook: main changed
  v
Jenkins job: ecommerce-dev-ci-build
  |
  | test + filesystem scan + image build/scan/push
  v
Docker Hub
  |
  | push image:<git-short-sha>
  v
Jenkins job: ecommerce-dev-cd-gitops
  |
  | kustomize edit set image ...
  | git commit "chore(gitops): deploy dev <tag>"
  | git push origin main as GitOps bot
  v
GitHub repository
  |
  | Argo CD watches main + overlays/dev
  v
Argo CD app: ecommerce-dev
  |
  | sync Kubernetes manifests
  v
Kubernetes namespace: ecommerce-dev
  |
  | rollout deployment + smoke test
  v
Public URLs:
  - https://api.dt-commerce.site
  - https://buyer.dt-commerce.site
  - https://seller.dt-commerce.site
  - https://moderator.dt-commerce.site
```

## 2. Các Thành Phần Và Trách Nhiệm

| Thành phần | Trách nhiệm |
|---|---|
| GitHub | Nơi chứa source code, manifest Kubernetes, bảo vệ `main`, và gửi webhook khi có PR hoặc merge |
| Jenkins CI | Tự detect service/app bị đổi, kiểm tra PR, và chỉ push image khi commit đã vào `main` |
| Docker Hub | Registry lưu image theo tag commit SHA |
| Jenkins CD GitOps | Chỉ sửa tag image trong `kustomization.yaml`, commit/push về Git |
| Argo CD | Theo dõi Git và apply manifest vào Kubernetes |
| Kubernetes | Chạy workload thực tế |

Nguyên tắc quan trọng:

```txt
Jenkins không kubectl apply trực tiếp vào cluster trong luồng chính.
Jenkins chỉ build image và cập nhật Git.
Argo CD là thành phần duy nhất sync manifest vào Kubernetes.
```

## 3. Jenkins Jobs

Tạo 2 job Jenkins.

Khuyến nghị cho CI là dùng **Multibranch Pipeline** để Jenkins nhận biết Pull Request qua các biến như `CHANGE_ID`, `CHANGE_TARGET`, `BRANCH_NAME`. Nếu dùng job Pipeline thường, Jenkins vẫn chạy được khi `main` thay đổi, nhưng phần PR sẽ không đầy đủ bằng Multibranch.

| Job | Pipeline file | Trigger |
|---|---|---|
| `ecommerce-dev-ci-build` | `cicd/pipelines/ci-build-dev.groovy` | GitHub webhook PR + merge vào `main` |
| `ecommerce-dev-cd-gitops` | `cicd/pipelines/cd-gitops-dev.groovy` | Được CI trigger sau khi push image thành công |

### CI Job: `ecommerce-dev-ci-build`

Job này chạy khi developer mở/cập nhật Pull Request và khi Pull Request được merge vào `main`.

Các stage chính:

```txt
Checkout SCM
Init IMAGE_TAG = git short SHA
Detect changed files
Detect impacted services/apps
Unit Test / Next build
Trivy Filesystem Scan
OWASP Dependency Check optional
SonarQube optional
Docker Login          main merge only
Docker Build          main merge only
Trivy Image Scan      main merge only
Docker Push           main merge only
Trigger CD GitOps Job main merge only
Archive Reports
```

Tham số quan trọng:

| Parameter | Mặc định | Ý nghĩa |
|---|---:|---|
| `AUTO_DETECT_SERVICES` | `true` | Jenkins tự chọn service/app dựa trên file thay đổi |
| `SERVICES` | all services/apps | Chỉ dùng khi tắt auto detect để chạy thủ công |
| `TRIGGER_CD_JOB` | `true` | Sau khi push image từ commit trên `main`, tự gọi CD job |

Default `SERVICES` vẫn bao gồm backend và frontend web để dùng cho manual build:

```txt
api-gateway,auth-service,user-service,product-service,cart-service,
order-service,payment-service,inventory-service,shipping-service,
notification-service,analytics-service,review-service,chat-service,
live-service,media-service,buyer-web,seller-web,moderator-web
```

Khi chạy manual để tiết kiệm thời gian, có thể chỉ chọn service cần deploy:

```txt
AUTO_DETECT_SERVICES=false
SERVICES=buyer-web
SERVICES=seller-web,moderator-web
SERVICES=api-gateway,product-service,cart-service
```

### Luồng PR

Khi có PR từ nhánh khác vào `main`:

```txt
feature branch -> Pull Request -> Jenkins CI
-> detect file thay đổi
-> test/build source các service/app bị ảnh hưởng
-> Trivy filesystem scan
-> không docker push
-> không trigger CD
```

Mục đích của PR là kiểm tra code trước khi merge. PR không được deploy vì code chưa nằm trên `main`.

### Luồng Merge Vào Main

Khi PR được merge vào `main`:

```txt
merge PR -> main commit -> Jenkins CI
-> detect file thay đổi
-> test/scan source
-> build image:<git-short-sha>
-> Trivy image scan
-> push Docker Hub
-> trigger CD GitOps job
-> Argo CD sync
```

Chỉ các service/app bị ảnh hưởng mới được build. Ví dụ:

| File thay đổi | Jenkins build |
|---|---|
| `services/cart-service/**` | `cart-service` |
| `services/auth-service/**` | `auth-service` |
| `frontend/apps/buyer-web/**` | `buyer-web` |
| `frontend/apps/seller/**` | `seller-web` |
| `frontend/apps/moderator/**` | `moderator-web` |
| `frontend/packages/**` | `buyer-web,seller-web,moderator-web` |
| `shared/**` hoặc `packages/backend-shared/**` | toàn bộ backend + frontend vì có thể ảnh hưởng contract chung |

Các thay đổi không ảnh hưởng runtime sẽ được skip, ví dụ:

```txt
docs/**
README.md
cicd/**
infrastructure/kubernetes/overlays/dev/kustomization.yaml
commit message bắt đầu bằng chore(gitops):
```

Nhờ vậy sửa tài liệu hoặc commit GitOps của Jenkins không làm hệ thống build lại image không cần thiết.

### Protected Branch `main`

Trong thực tế, `main` nên là protected branch. Developer không push thẳng vào `main`; developer chỉ push lên feature branch rồi mở Pull Request.

Thiết lập khuyến nghị trong GitHub:

```txt
Settings -> Rules -> Rulesets
hoặc Settings -> Branches -> Branch protection rule
```

Rule cho branch:

```txt
Branch name pattern: main
Require a pull request before merging: enabled
Require approvals: 1
Require status checks to pass before merging: enabled
Require branches to be up to date before merging: enabled
Do not allow force pushes: enabled
Do not allow deletions: enabled
```

Status check nên bắt Jenkins PR validation pass trước khi merge. Tên check phụ thuộc cách Jenkins hiển thị trong GitHub, ví dụ:

```txt
ecommerce-dev-ci-build
```

Điểm cần chú ý: CD job hiện đang commit GitOps tag ngược lại vào `main`.

Nếu vẫn để source code và GitOps manifest chung một repo/branch, cần một trong hai cách:

```txt
Cách 1: Cho Jenkins GitOps bot được bypass branch protection.
Cách 2: Tách GitOps manifest sang repo hoặc branch riêng, ví dụ gitops/dev, rồi cho Argo CD watch branch đó.
```

Với setup hiện tại, cách ít thay đổi nhất là **cho Jenkins GitOps credential được bypass branch protection**, nhưng chỉ dùng credential đó trong CD job để commit dạng:

```txt
chore(gitops): deploy dev <image-tag>
```

Nếu không cho bot bypass, CD job sẽ bị GitHub reject khi chạy `git push origin HEAD:main`.

### CD Job: `ecommerce-dev-cd-gitops`

Job này nhận `SERVICES` và `IMAGE_TAG` từ CI.

Các stage chính:

```txt
Validate
Update Kustomize Image Tags
Commit And Push
Wait For Argo CD Sync
Smoke Test
```

CD job tạo commit dạng:

```txt
chore(gitops): deploy dev <image-tag>
```

Ví dụ thay đổi trong Git:

```yaml
images:
  - name: buyer-web
    newName: docker.io/vantruong179/ecommerce-microservices-buyer-web
    newTag: ed19788abc12
```

## 4. GitHub Webhook

Trong GitHub repository:

```txt
Settings -> Webhooks -> Add webhook
```

Giá trị:

| Field | Value |
|---|---|
| Payload URL | `https://jenkins.dt-commerce.site/github-webhook/` |
| Content type | `application/json` |
| Events | Pushes and Pull requests |
| Active | checked |

Nếu dùng job Pipeline thường cho lúc `main` thay đổi sau merge PR, bật:

```txt
Build Triggers -> GitHub hook trigger for GITScm polling
```

Branch specifier:

```txt
*/main
```

Hoàn thành khi:

```txt
Merge PR vào main -> Jenkins tự tạo build mới.
```

Nếu muốn PR tự chạy chuẩn hơn, dùng Multibranch Pipeline:

```txt
New Item -> Multibranch Pipeline
Branch Sources -> GitHub
Repository HTTPS URL: https://github.com/truong-devops/ecommerce-microservices.git
Credentials: GitHub token có quyền đọc repo
Behaviors:
  - Discover branches
  - Discover pull requests from origin
Build Configuration:
  Mode: by Jenkinsfile path
  Script Path: cicd/pipelines/ci-build-dev.groovy
Scan Multibranch Pipeline Triggers:
  Periodically if not otherwise run, hoặc GitHub webhook
```

## 5. Credentials Cần Có Trong Jenkins

| Credential ID | Kind | Dùng cho |
|---|---|---|
| `dockerhub-credentials` | Username with password | `docker login`, push image |
| `github-ecommerce-token` | Username with password | CD job commit/push GitOps tag |
| `sonar-token` | Secret text | Optional SonarQube |
| `kubeconfig-ecommerce-dev` | Secret file | Chỉ dùng fallback/manual, không dùng trong luồng GitOps chính |

GitHub PAT cho `github-ecommerce-token` cần quyền:

```txt
Contents: Read and write
Metadata: Read
```

Docker Hub token nên là access token riêng cho Jenkins, không dùng password tài khoản chính.

## 6. Tránh Vòng Lặp CI/CD

Vì CD job commit lại vào `main`, GitHub webhook có thể kích hoạt CI thêm một lần nữa.

Ví dụ:

```txt
Developer merge PR
-> CI chạy
-> CD commit "chore(gitops): deploy dev abc123"
-> GitHub webhook lại gọi CI
```

Pipeline `cicd/pipelines/ci-build-dev.groovy` đã có guard `SKIP_CI` và auto-detect service.

CI sẽ bỏ qua build/deploy khi commit mới nhất thỏa một trong các điều kiện:

1. Commit message bắt đầu bằng:

   ```txt
   chore(gitops):
   ```

2. Commit chỉ thay đổi file:

   ```txt
   infrastructure/kubernetes/overlays/dev/kustomization.yaml
   ```

3. Auto detect không tìm thấy service/app runtime nào bị ảnh hưởng, ví dụ chỉ sửa `docs/**` hoặc `README.md`.

Khi `SKIP_CI=true`, Jenkins chỉ chạy stage `Init`, archive `reports/changed-files.txt`, đánh dấu build success, rồi bỏ qua test/build/scan/push/CD. Nhờ vậy CD job có thể commit tag GitOps vào `main` mà không tạo vòng lặp vô hạn.

Quy tắc vận hành:

```txt
Commit code của developer mới cần CI/CD đầy đủ.
Commit GitOps của Jenkins chỉ để Argo CD sync tag image.
```

## 7. Luồng Thành Công Chuẩn

1. Developer push code lên feature branch.
2. Developer mở Pull Request vào `main`.
3. Jenkins chạy PR validation.
4. Reviewer approve và merge PR vào `main`.
5. GitHub webhook kích hoạt Jenkins CI cho commit mới trên `main`.
6. Jenkins CI checkout đúng commit.
7. Jenkins tạo image tag bằng short SHA:

   ```txt
   IMAGE_TAG=$(git rev-parse --short=12 HEAD)
   ```

8. Jenkins chạy test/build.
9. Trivy filesystem scan pass.
10. Docker image build pass.
11. Trivy image scan pass.
12. Jenkins push:

   ```txt
   docker.io/vantruong179/ecommerce-microservices-<service>:<IMAGE_TAG>
   docker.io/vantruong179/ecommerce-microservices-<service>:dev
   ```

13. Jenkins trigger CD job.
14. CD job cập nhật `newTag` trong Kustomize.
15. CD job commit/push GitOps change.
16. Argo CD sync app `ecommerce-dev`.
17. Kubernetes rollout pod mới.
18. Smoke test pass.

## 8. Kiểm Tra Sau Deploy

Jenkins:

```txt
ecommerce-dev-ci-build: SUCCESS
ecommerce-dev-cd-gitops: SUCCESS
```

Argo CD:

```txt
Sync Status: Synced
App Health: Healthy
Last Sync: Sync OK
```

Kubernetes:

```bash
kubectl -n ecommerce-dev get pods
kubectl -n ecommerce-dev get deploy
kubectl -n ecommerce-dev rollout status deploy/api-gateway --timeout=300s
```

Public smoke test:

```bash
curl -fsS https://api.dt-commerce.site/health
curl -fsS https://api.dt-commerce.site/api/v1/products
curl -fsS https://buyer.dt-commerce.site >/dev/null
curl -fsS https://seller.dt-commerce.site >/dev/null
curl -fsS https://moderator.dt-commerce.site >/dev/null
```

## 9. Rollback

Vì Git là nguồn sự thật, rollback chuẩn là revert GitOps commit.

Tìm commit deploy gần nhất:

```bash
git log --oneline -- infrastructure/kubernetes/overlays/dev/kustomization.yaml
```

Rollback bằng revert:

```bash
git revert <gitops-commit-sha>
git push origin main
```

Argo CD sẽ sync lại tag cũ.

Nếu cần xử lý khẩn cấp trong Kubernetes:

```bash
kubectl -n ecommerce-dev rollout undo deploy/<service>
kubectl -n ecommerce-dev rollout status deploy/<service> --timeout=300s
```

Sau khi emergency rollback xong, vẫn phải đưa Git về trạng thái đúng để Argo CD không sync ngược lại.

## 10. Production Thật Nên Tách Riêng

Hiện tại public environment dùng `overlays/dev`. Để production thật rõ ràng hơn, thiết kế nên tách:

```txt
infrastructure/kubernetes/overlays/dev
infrastructure/kubernetes/overlays/prod

namespace: ecommerce-dev
namespace: ecommerce-prod

Argo CD app: ecommerce-dev
Argo CD app: ecommerce-prod

Jenkins job: ecommerce-dev-ci-build
Jenkins job: ecommerce-prod-cd-gitops
```

Luồng production khuyến nghị:

```txt
feature branch -> PR vào main
-> PR validation pass + review approve
-> merge main
-> CI build/test/scan image
-> deploy tự động vào dev
-> manual approval hoặc tag release
-> deploy vào prod
```

Với đồ án hoặc demo cá nhân, có thể trình bày `ecommerce-dev` là môi trường production-like đang public qua domain thật.

## 11. Checklist Hoàn Thành

```txt
[ ] GitHub webhook trỏ tới https://jenkins.dt-commerce.site/github-webhook/
[ ] GitHub webhook bật push và pull request events
[ ] Jenkins CI dùng Multibranch Pipeline nếu muốn PR chạy tự động chuẩn
[ ] `main` bật branch protection, bắt buộc PR và status checks
[ ] Jenkins CI job main dùng branch */main nếu vẫn dùng Pipeline thường
[ ] Jenkins GitOps bot được phép push GitOps commit, hoặc đã tách GitOps branch/repo riêng
[ ] Jenkins có dockerhub-credentials
[ ] Jenkins có github-ecommerce-token
[ ] CI build/test/scan/push image pass
[ ] CI tự trigger CD job
[ ] CD job cập nhật Kustomize image tag
[ ] CD job push GitOps commit thành công
[ ] Argo CD app ecommerce-dev Synced + Healthy
[ ] Public smoke test pass
[ ] CI guard `SKIP_CI=true` hoạt động với commit `chore(gitops): ...`
[ ] PR build không push Docker image và không trigger CD
```

Flow test: 2026-05-29T19:31:25Z
Webhook flow test: 2026-05-29T19:40:37Z
Webhook retry after Jenkins filter fix: 2026-05-29T19:49:15Z
