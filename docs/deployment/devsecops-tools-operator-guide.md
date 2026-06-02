# DevSecOps Tools Operator Guide

File này dùng để hiểu rõ từng công cụ đang có trong mô hình triển khai, biết công cụ đó dùng để làm gì, nên kiểm tra gì và khi demo thì mở ở đâu.

## 1. Bức Tranh Tổng Thể

Mô hình hiện tại có 4 nhóm chính:

```txt
Source control:
  GitHub

CI/CD and security gate:
  Jenkins, OWASP Dependency Check, SonarQube, Trivy, Docker, Docker Hub

Runtime and GitOps:
  Argo CD, Kubernetes

Operations:
  Prometheus, Grafana, Rancher, Teleport
```

Luồng deploy chính:

```txt
Developer push code
-> GitHub webhook
-> Jenkins CI
-> Test and security scan
-> Docker build and push Docker Hub
-> Jenkins CD updates Kustomize image tag
-> GitHub receives GitOps commit
-> Argo CD syncs to Kubernetes
-> App is updated in namespace ecommerce-dev
```

Luồng vận hành:

```txt
Admin/DevOps
-> Teleport for secure access
-> Rancher/kubectl for Kubernetes management
-> Prometheus/Grafana for monitoring
```

## 2. GitHub

### Dùng Để Làm Gì

GitHub lưu:

- Source code backend/frontend.
- Kubernetes manifests.
- Kustomize overlay.
- Jenkins pipeline scripts.
- Tài liệu triển khai.

Trong dự án này, Argo CD đang theo dõi:

```txt
repo: https://github.com/truong-devops/ecommerce-microservices.git
branch: main
path: infrastructure/kubernetes/overlays/dev
namespace: ecommerce-dev
```

### Cần Check Gì

Kiểm tra commit GitOps của Jenkins:

```txt
chore(gitops): deploy dev <image-tag>
```

Kiểm tra image tag trong:

```txt
infrastructure/kubernetes/overlays/dev/kustomization.yaml
```

Nếu pipeline chạy nhưng Kubernetes không đổi version, thường kiểm tra theo thứ tự:

1. Jenkins có push image không.
2. Jenkins CD có commit tag mới không.
3. Argo CD có sync commit mới không.
4. Kubernetes deployment có image tag mới không.

## 3. Jenkins

### Dùng Để Làm Gì

Jenkins chạy CI/CD.

Job chính:

```txt
ecommerce-dev-ci-build
ecommerce-dev-cd-gitops
```

CI job:

- Checkout source.
- Detect service/app thay đổi.
- Test/build.
- Scan filesystem bằng Trivy.
- Scan dependency bằng OWASP Dependency Check nếu bật.
- Scan code quality bằng SonarQube nếu bật.
- Build image.
- Scan image bằng Trivy.
- Push image lên Docker Hub.
- Trigger CD job.

CD job:

- Cập nhật image tag trong Kustomize.
- Commit/push về GitHub.
- Chờ Argo CD sync.
- Smoke test public URL.

### Cần Check Gì

Trong Jenkins UI:

- Job status phải là `SUCCESS`.
- Console log có image tag.
- Stage Docker build/push không lỗi.
- Stage scan không fail.
- CD job có commit GitOps.

Các credential cần đúng:

```txt
dockerhub-credentials
github-ecommerce-token
sonar-token              optional
kubeconfig-ecommerce-dev fallback/manual only
```

Lưu ý quan trọng:

```txt
Jenkins không kubectl apply trực tiếp trong luồng GitOps chính.
Jenkins chỉ build image và cập nhật Git.
Argo CD là bên sync vào Kubernetes.
```

## 4. OWASP Dependency Check

### Dùng Để Làm Gì

OWASP Dependency Check kiểm tra thư viện phụ thuộc có CVE đã biết hay không.

Ví dụ:

- Go module có lỗ hổng.
- npm package có lỗ hổng.
- Dependency cũ có CVE critical/high.

### Cần Check Gì

Trong Jenkins report hoặc console:

- Có bao nhiêu CVE.
- Mức độ `Critical`, `High`, `Medium`.
- Package nào bị ảnh hưởng.
- Có cần upgrade dependency không.

Nếu NVD download chậm, có thể tắt tạm lần đầu, nhưng khi demo DevSecOps nên giải thích đây là bước kiểm tra dependency security.

## 5. SonarQube

### Dùng Để Làm Gì

SonarQube kiểm tra chất lượng code.

Nó tập trung vào:

- Bugs.
- Vulnerabilities.
- Security hotspots.
- Code smells.
- Duplication.
- Coverage nếu có test coverage.
- Quality Gate.

### Cần Check Gì

Trong SonarQube UI:

- Quality Gate pass/fail.
- Bug count.
- Vulnerability count.
- Code smell count.
- Duplicated lines.

Nếu `RUN_SONARQUBE=false`, nói rõ SonarQube là optional và chỉ bật khi server/token đã ổn.

## 6. Trivy

### Dùng Để Làm Gì

Trivy scan bảo mật ở 2 mức:

```txt
Filesystem scan -> kiểm tra source/dependency trước khi build image
Image scan      -> kiểm tra Docker image sau khi build
```

### Cần Check Gì

Trong Jenkins:

- Trivy filesystem scan pass.
- Trivy image scan pass.
- Có critical/high vulnerability không.
- Image có package OS lỗi thời không.

Trivy giúp chặn image rủi ro trước khi đưa lên Kubernetes.

## 7. Docker Và Docker Hub

### Dùng Để Làm Gì

Docker đóng gói từng service thành image.

Docker Hub lưu image:

```txt
docker.io/vantruong179/ecommerce-microservices-<service>:<tag>
docker.io/vantruong179/ecommerce-microservices-<service>:dev
```

Tag chính nên là git short SHA để truy vết được code nào đang chạy.

### Cần Check Gì

Check image trong Kubernetes:

```bash
kubectl -n ecommerce-dev get deploy api-gateway \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Check tag trong Kustomize:

```bash
grep -A2 'name: api-gateway' infrastructure/kubernetes/overlays/dev/kustomization.yaml
```

Nếu pod `ImagePullBackOff`, kiểm tra:

- Image tồn tại trên Docker Hub chưa.
- Tag đúng chưa.
- Docker Hub rate limit hoặc credential nếu image private.

## 8. Argo CD

### Dùng Để Làm Gì

Argo CD triển khai theo GitOps.

Nó theo dõi Git và apply manifest vào Kubernetes.

App hiện tại:

```txt
Application: ecommerce-dev
Namespace: argocd
Destination namespace: ecommerce-dev
```

### Cần Check Gì

Trên `k8s-cp-01`:

```bash
kubectl -n argocd get application ecommerce-dev
```

Kết quả mong muốn:

```txt
SYNC STATUS: Synced
HEALTH STATUS: Healthy
```

Trong Argo CD UI:

- App `ecommerce-dev` phải `Synced`.
- App health phải `Healthy`.
- Không có resource `Degraded`.
- Không có manifest lỗi.

Nếu Argo CD không sync:

1. Kiểm tra repo URL và branch.
2. Kiểm tra path overlay.
3. Kiểm tra manifest có lỗi không.
4. Kiểm tra namespace.
5. Kiểm tra image tag.

## 9. Kubernetes

### Dùng Để Làm Gì

Kubernetes chạy ứng dụng thật.

Cluster hiện tại:

```txt
k8s-cp-01       control-plane
k8s-worker-01   app workloads
k8s-worker-02   data/infra workloads
```

Namespace ứng dụng:

```txt
ecommerce-dev
```

### Cần Check Gì

Node:

```bash
kubectl get nodes -o wide
```

Pod:

```bash
kubectl -n ecommerce-dev get pods -o wide
```

Deployment:

```bash
kubectl -n ecommerce-dev get deploy
```

Log:

```bash
kubectl -n ecommerce-dev logs deploy/api-gateway --tail=50
```

Rollout:

```bash
kubectl -n ecommerce-dev rollout status deploy/api-gateway --timeout=300s
```

Public smoke test:

```bash
curl -fsS https://api.dt-commerce.site/health
curl -fsS https://buyer.dt-commerce.site >/dev/null
curl -fsS https://seller.dt-commerce.site >/dev/null
curl -fsS https://moderator.dt-commerce.site >/dev/null
```

## 10. Prometheus

### Dùng Để Làm Gì

Prometheus thu thập metrics.

Nó thường scrape:

- Kubernetes node metrics.
- Pod metrics.
- Service metrics.
- Application `/metrics` endpoint nếu có.

### Cần Check Gì

Trong Prometheus:

- Target có `UP` không.
- Service nào bị `DOWN`.
- Metrics có dữ liệu mới không.
- CPU/RAM/HTTP metrics có tăng theo traffic không.

Một vài thứ cần quan sát:

```txt
CPU node
Memory node
CPU pod
Memory pod
HTTP request count
HTTP latency
Pod restart count
```

## 11. Grafana

### Dùng Để Làm Gì

Grafana hiển thị dashboard từ Prometheus.

Grafana giúp demo trực quan hơn vì nhìn được hệ thống qua biểu đồ.

### Cần Check Gì

Trong Grafana:

- Dashboard Kubernetes node.
- Dashboard pod resource.
- Dashboard service/API nếu có.
- Time range đúng.
- Panel không bị `No data`.

Nếu Grafana không có dữ liệu:

1. Kiểm tra Prometheus datasource.
2. Kiểm tra Prometheus target.
3. Kiểm tra metric query.
4. Kiểm tra time range.

## 12. Rancher

### Dùng Để Làm Gì

Rancher là UI quản trị Kubernetes.

Rancher khác Argo CD:

```txt
Argo CD  -> deploy desired state từ Git
Rancher  -> xem và quản trị cluster bằng UI
```

Rancher phù hợp để:

- Xem node.
- Xem namespace.
- Xem deployment.
- Xem pod.
- Xem service/ingress.
- Xem logs.
- Xem resource usage.
- Debug workload.

### Cần Check Gì

Trong Rancher:

- Cluster trạng thái Active.
- Nodes đều Ready.
- Namespace `ecommerce-dev` tồn tại.
- Workloads đều Available.
- Pods đều Running hoặc Completed nếu là job test.
- Ingress trỏ đúng domain.
- Events không có lỗi lặp lại.

Khi có lỗi app:

1. Vào namespace `ecommerce-dev`.
2. Mở workload bị lỗi.
3. Xem pod status.
4. Xem logs.
5. Xem events.
6. Đối chiếu với Argo CD sync status.

## 13. Teleport

### Dùng Để Làm Gì

Teleport là lớp Zero Trust Access.

Teleport kiểm soát:

- Ai được SSH vào VPS.
- Ai được truy cập Kubernetes.
- Role nào được xem hoặc thao tác resource nào.
- Audit log truy cập.
- Session access.

Teleport không thay thế Rancher hoặc Argo CD.

```txt
Rancher  -> quản trị Kubernetes bằng UI
Argo CD  -> deploy GitOps
Teleport -> kiểm soát truy cập và phân quyền
```

### Tài Nguyên Đã Join Vào Teleport

SSH servers:

```txt
devsecops-01
k8s-cp-01
k8s-worker-01
k8s-worker-02
```

Kubernetes:

```txt
ecommerce-kubeadm-dev
```

### Phân Quyền Đã Test

User `admin`:

```txt
Quản trị server và Kubernetes.
```

User `viewer`:

```txt
Chỉ thấy Kubernetes cluster.
Không thấy SSH server.
Xem được pods.
Xem được logs.
Không xem được secrets.
Không exec pod.
Không delete pod.
```

Các test đã đạt:

```bash
kubectl -n ecommerce-dev get pods
kubectl -n ecommerce-dev logs deploy/api-gateway --tail=20
kubectl -n ecommerce-dev get secrets
```

Kỳ vọng:

```txt
get pods    -> allowed
logs        -> allowed
get secrets -> forbidden
```

Test RBAC:

```bash
kubectl auth can-i get pods -n ecommerce-dev \
  --as=viewer --as-group=dt-commerce:k8s-readonly

kubectl auth can-i get secrets -n ecommerce-dev \
  --as=viewer --as-group=dt-commerce:k8s-readonly

kubectl auth can-i create pods/exec -n ecommerce-dev \
  --as=viewer --as-group=dt-commerce:k8s-readonly
```

Kết quả đúng:

```txt
yes
no
no
```

## 14. Nên Demo Theo Thứ Tự Nào

Thứ tự demo gọn:

1. Mở GitHub, chỉ ra source code và `overlays/dev`.
2. Mở Jenkins, chỉ ra CI job và CD job.
3. Mở Jenkins console log, chỉ ra test/scan/build/push.
4. Mở Docker Hub, chỉ ra image tag.
5. Mở Argo CD, chỉ ra `ecommerce-dev` Synced/Healthy.
6. Mở Rancher, chỉ ra nodes, workloads, pods.
7. Mở Grafana, chỉ ra dashboard metrics.
8. Mở Teleport admin, chỉ ra SSH servers và Kubernetes.
9. Mở Teleport viewer, chỉ ra viewer chỉ thấy Kubernetes.
10. Test viewer bị chặn secrets hoặc exec pod.

## 15. Checklist Vận Hành Nhanh

Khi deploy xong, kiểm tra:

```bash
kubectl -n argocd get application ecommerce-dev
kubectl -n ecommerce-dev get pods -o wide
kubectl -n ecommerce-dev get deploy
curl -fsS https://api.dt-commerce.site/health
```

Khi nghi lỗi pipeline:

```txt
Jenkins job status
Jenkins console log
Docker Hub image tag
GitOps commit in GitHub
Argo CD sync status
Kubernetes pod status
App public health check
```

Khi nghi lỗi quyền truy cập:

```txt
Teleport role
Teleport user roles
Kubernetes RBAC RoleBinding
kubectl auth can-i
Teleport audit/session log
```

## 16. Câu Nhớ Nhanh

```txt
Jenkins build and scan.
Docker Hub stores images.
Argo CD deploys from Git.
Kubernetes runs workloads.
Prometheus collects metrics.
Grafana visualizes metrics.
Rancher manages Kubernetes visually.
Teleport secures access and audit.
```

