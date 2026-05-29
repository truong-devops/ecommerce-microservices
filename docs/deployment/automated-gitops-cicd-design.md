# Automated GitOps CI/CD Design

Tài liệu này mô tả quy trình tự động hóa hiện tại sau khi Jenkins, Docker Hub, Kubernetes và Argo CD đã chạy được.

Mục tiêu:

```txt
Developer push code lên GitHub nhánh main
-> Jenkins tự chạy CI
-> Image mới được build, scan, push lên Docker Hub
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
  | git push origin main
  v
GitHub repository
  |
  | webhook: push event on main
  v
Jenkins job: ecommerce-dev-ci-build
  |
  | test, build, Trivy scan
  v
Docker Hub
  |
  | push image:<git-short-sha>
  v
Jenkins job: ecommerce-dev-cd-gitops
  |
  | kustomize edit set image ...
  | git commit "chore(gitops): deploy dev <tag>"
  | git push origin main
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
| GitHub | Nơi chứa source code, manifest Kubernetes, và gửi webhook khi có push lên `main` |
| Jenkins CI | Test, build, scan source, build Docker image, scan image, push Docker Hub |
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

Tạo 2 job dạng **Pipeline script from SCM**.

| Job | Pipeline file | Trigger |
|---|---|---|
| `ecommerce-dev-ci-build` | `cicd/pipelines/ci-build-dev.groovy` | GitHub webhook push `main` |
| `ecommerce-dev-cd-gitops` | `cicd/pipelines/cd-gitops-dev.groovy` | Được CI trigger sau khi push image thành công |

### CI Job: `ecommerce-dev-ci-build`

Job này chạy khi developer push code lên `main`.

Các stage chính:

```txt
Checkout SCM
Init IMAGE_TAG = git short SHA
Unit Test / Next build
Trivy Filesystem Scan
OWASP Dependency Check optional
SonarQube optional
Docker Login
Docker Build
Trivy Image Scan
Docker Push
Trigger CD GitOps Job
Archive Reports
```

Default `SERVICES` hiện bao gồm backend và frontend web:

```txt
api-gateway,auth-service,user-service,product-service,cart-service,
order-service,payment-service,inventory-service,shipping-service,
notification-service,analytics-service,review-service,chat-service,
live-service,media-service,buyer-web,seller-web,moderator-web
```

Khi chạy manual để tiết kiệm thời gian, có thể chỉ chọn service cần deploy:

```txt
SERVICES=buyer-web
SERVICES=seller-web,moderator-web
SERVICES=api-gateway,product-service,cart-service
```

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
| Events | Just the push event |
| Active | checked |

Trong Jenkins job `ecommerce-dev-ci-build`, bật:

```txt
Build Triggers -> GitHub hook trigger for GITScm polling
```

Branch specifier:

```txt
*/main
```

Hoàn thành khi:

```txt
Push commit lên main -> Jenkins tự tạo build mới.
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
Developer push feature commit
-> CI chạy
-> CD commit "chore(gitops): deploy dev abc123"
-> GitHub webhook lại gọi CI
```

Pipeline `cicd/pipelines/ci-build-dev.groovy` đã có guard `SKIP_CI`.

CI sẽ bỏ qua build/deploy khi commit mới nhất thỏa một trong hai điều kiện:

1. Commit message bắt đầu bằng:

   ```txt
   chore(gitops):
   ```

2. Hoặc commit chỉ thay đổi file:

   ```txt
   infrastructure/kubernetes/overlays/dev/kustomization.yaml
   ```

Khi `SKIP_CI=true`, Jenkins chỉ chạy stage `Init`, đánh dấu build success, rồi bỏ qua test/build/scan/push/CD. Nhờ vậy CD job có thể commit tag GitOps vào `main` mà không tạo vòng lặp vô hạn.

Quy tắc vận hành:

```txt
Commit code của developer mới cần CI/CD đầy đủ.
Commit GitOps của Jenkins chỉ để Argo CD sync tag image.
```

## 7. Luồng Thành Công Chuẩn

1. Developer merge/push code vào `main`.
2. GitHub gọi webhook Jenkins.
3. Jenkins CI checkout đúng commit.
4. Jenkins tạo image tag bằng short SHA:

   ```txt
   IMAGE_TAG=$(git rev-parse --short=12 HEAD)
   ```

5. Jenkins chạy test/build.
6. Trivy filesystem scan pass.
7. Docker image build pass.
8. Trivy image scan pass.
9. Jenkins push:

   ```txt
   docker.io/vantruong179/ecommerce-microservices-<service>:<IMAGE_TAG>
   docker.io/vantruong179/ecommerce-microservices-<service>:dev
   ```

10. Jenkins trigger CD job.
11. CD job cập nhật `newTag` trong Kustomize.
12. CD job commit/push GitOps change.
13. Argo CD sync app `ecommerce-dev`.
14. Kubernetes rollout pod mới.
15. Smoke test pass.

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
push main
-> CI build/test/scan image
-> deploy tự động vào dev
-> manual approval hoặc tag release
-> deploy vào prod
```

Với đồ án hoặc demo cá nhân, có thể trình bày `ecommerce-dev` là môi trường production-like đang public qua domain thật.

## 11. Checklist Hoàn Thành

```txt
[ ] GitHub webhook trỏ tới https://jenkins.dt-commerce.site/github-webhook/
[ ] Jenkins CI job bật GitHub hook trigger
[ ] Jenkins CI job dùng branch */main
[ ] Jenkins có dockerhub-credentials
[ ] Jenkins có github-ecommerce-token
[ ] CI build/test/scan/push image pass
[ ] CI tự trigger CD job
[ ] CD job cập nhật Kustomize image tag
[ ] CD job push GitOps commit thành công
[ ] Argo CD app ecommerce-dev Synced + Healthy
[ ] Public smoke test pass
[ ] CI guard `SKIP_CI=true` hoạt động với commit `chore(gitops): ...`
```
