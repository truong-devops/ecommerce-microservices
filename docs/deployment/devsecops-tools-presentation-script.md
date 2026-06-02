# DevSecOps Tools Presentation Script

File này dùng để nói ngắn gọn trước giảng viên về vai trò của các công cụ trong mô hình triển khai hiện tại.

## 1. Mở Đầu

Trong dự án ecommerce microservices này, em triển khai hệ thống theo hướng DevSecOps và GitOps.

Luồng chính là:

```txt
Developer -> GitHub -> Jenkins -> Docker Hub -> Argo CD -> Kubernetes
```

Bên cạnh đó, em bổ sung các công cụ vận hành và bảo mật:

```txt
Prometheus/Grafana -> monitoring
Rancher -> quản trị Kubernetes bằng UI
Teleport -> kiểm soát truy cập SSH và Kubernetes
```

Môi trường hiện tại là môi trường `production-like`, chạy public qua các domain thật như:

```txt
api.dt-commerce.site
buyer.dt-commerce.site
seller.dt-commerce.site
moderator.dt-commerce.site
argocd.dt-commerce.site
rancher.dt-commerce.site
teleport.dt-commerce.site
```

## 2. GitHub

GitHub là nơi lưu source code, Docker/Kubernetes manifest và pipeline script.

Khi developer push code hoặc merge pull request vào branch chính, GitHub webhook sẽ kích hoạt Jenkins chạy pipeline.

Ngoài source code, GitHub còn lưu cấu hình GitOps trong thư mục:

```txt
infrastructure/kubernetes/overlays/dev
```

Điểm quan trọng là Kubernetes không nhận deploy trực tiếp từ Jenkins. Jenkins chỉ cập nhật image tag vào Git, sau đó Argo CD đọc Git và triển khai vào cluster.

## 3. Jenkins

Jenkins là công cụ tự động hóa CI/CD.

Trong dự án có 2 job chính:

```txt
ecommerce-dev-ci-build
ecommerce-dev-cd-gitops
```

CI job chịu trách nhiệm:

- Pull code từ GitHub.
- Detect service hoặc frontend app bị thay đổi.
- Chạy test/build.
- Chạy scan bảo mật.
- Build Docker image.
- Push image lên Docker Hub.

CD GitOps job chịu trách nhiệm:

- Nhận image tag từ CI.
- Cập nhật tag trong `kustomization.yaml`.
- Commit/push lại GitHub.
- Để Argo CD tự sync vào Kubernetes.

Cách này giúp Jenkins không cần apply trực tiếp vào cluster trong luồng chính, giảm rủi ro và đúng tinh thần GitOps.

## 4. OWASP Dependency Check, SonarQube Và Trivy

Ba công cụ này nằm ở phần kiểm tra chất lượng và bảo mật.

OWASP Dependency Check dùng để kiểm tra thư viện phụ thuộc có lỗ hổng CVE hay không.

SonarQube dùng để kiểm tra chất lượng code, ví dụ bugs, vulnerabilities, code smells, duplication và quality gate.

Trivy dùng để scan filesystem và Docker image. Trước khi image được đưa lên Kubernetes, Trivy giúp phát hiện package hoặc dependency có lỗ hổng nghiêm trọng.

Có thể nói ngắn gọn:

```txt
OWASP kiểm tra dependency.
SonarQube kiểm tra chất lượng code.
Trivy kiểm tra source và container image.
```

## 5. Docker Và Docker Hub

Docker dùng để đóng gói từng service thành image.

Docker Hub là registry lưu image theo tag commit SHA:

```txt
docker.io/vantruong179/ecommerce-microservices-<service>:<tag>
```

Sau khi Jenkins build và push image, Jenkins CD job cập nhật tag này vào Kustomize để Argo CD triển khai version mới.

Điểm cần kiểm tra là tag trên Docker Hub phải khớp với tag trong file:

```txt
infrastructure/kubernetes/overlays/dev/kustomization.yaml
```

## 6. Argo CD

Argo CD là công cụ GitOps deploy.

Nó theo dõi repository GitHub, branch `main`, path:

```txt
infrastructure/kubernetes/overlays/dev
```

Khi Jenkins CD job commit image tag mới, Argo CD phát hiện Git thay đổi và sync manifest vào Kubernetes namespace:

```txt
ecommerce-dev
```

Trạng thái cần đạt trong Argo CD là:

```txt
Sync Status: Synced
Health Status: Healthy
```

Em dùng Argo CD để đảm bảo trạng thái thật trong Kubernetes luôn khớp với trạng thái mong muốn trong Git.

## 7. Kubernetes

Kubernetes là nơi chạy ứng dụng thật.

Cluster hiện tại gồm:

```txt
k8s-cp-01       control-plane
k8s-worker-01   app workloads
k8s-worker-02   data/infra workloads
```

Các microservice, frontend, database, Redis, Kafka, MinIO đều chạy trong namespace:

```txt
ecommerce-dev
```

Kubernetes đảm nhiệm:

- Chạy pod và deployment.
- Restart pod khi lỗi.
- Quản lý service discovery.
- Rollout version mới.
- Chia workload trên các worker node.

## 8. Prometheus Và Grafana

Prometheus dùng để thu thập metrics từ Kubernetes và ứng dụng.

Grafana dùng để hiển thị dashboard từ Prometheus.

Khi vận hành, em dùng nhóm này để xem:

- CPU/RAM node.
- CPU/RAM pod.
- Service còn sống hay không.
- API traffic.
- Dấu hiệu quá tải.

Prometheus là nơi thu dữ liệu, Grafana là nơi trực quan hóa dữ liệu.

## 9. Rancher

Rancher là giao diện quản trị Kubernetes.

Rancher không thay thế Argo CD. Hai công cụ có vai trò khác nhau:

```txt
Argo CD  -> deploy theo GitOps
Rancher  -> quản trị và quan sát cluster bằng UI
```

Với Rancher, em có thể xem:

- Node Ready hoặc NotReady.
- Namespace.
- Deployment.
- Pod.
- Service.
- Ingress.
- Logs.
- Resource CPU/RAM.

Rancher giúp người vận hành quan sát cluster trực quan hơn thay vì luôn phải dùng `kubectl`.

## 10. Teleport

Teleport là lớp Zero Trust Access cho môi trường vận hành.

Teleport không thay thế Jenkins, Argo CD hay Rancher. Teleport kiểm soát ai được truy cập vào server và Kubernetes.

Trong dự án, Teleport quản lý:

```txt
SSH access:
- devsecops-01
- k8s-cp-01
- k8s-worker-01
- k8s-worker-02

Kubernetes access:
- ecommerce-kubeadm-dev
```

Em đã tạo 2 nhóm quyền:

```txt
admin  -> quản trị server và Kubernetes
viewer -> chỉ xem Kubernetes namespace ecommerce-dev
```

Khi test user `viewer`:

- Viewer thấy Kubernetes cluster.
- Viewer không thấy SSH server.
- Viewer xem được pods.
- Viewer xem được logs.
- Viewer không xem được secrets.
- Viewer không exec vào pod.
- Viewer không xóa pod.

Điều này chứng minh hệ thống có phân quyền theo nguyên tắc least privilege.

## 11. Câu Tổng Kết

Trong mô hình này, Jenkins chịu trách nhiệm build, test và scan; Docker Hub lưu image; Argo CD triển khai theo GitOps; Kubernetes chạy ứng dụng; Prometheus và Grafana giám sát hệ thống; Rancher hỗ trợ quản trị cluster bằng giao diện web; còn Teleport kiểm soát truy cập an toàn vào VPS và Kubernetes.

Nhờ vậy dự án không chỉ chạy được ứng dụng, mà còn có đầy đủ quy trình DevSecOps: tự động hóa triển khai, kiểm tra bảo mật, quan sát hệ thống và phân quyền vận hành.

## 12. Kịch Bản Tập Nói Theo Sơ Đồ Pipeline

Phần này dùng để tập nói trực tiếp theo hình pipeline. Khi thuyết trình, đi từ trái sang phải, từ trên xuống dưới: Developer, GitHub, Jenkins CI, các bước kiểm tra bảo mật, Docker image, Jenkins CD, Argo CD, Kubernetes, monitoring, rồi kết thúc bằng Rancher và Teleport.

### 12.1 Developer

Đầu tiên là developer, tức là người phát triển tính năng hoặc sửa lỗi trong dự án.

Khi có thay đổi, developer không deploy trực tiếp lên server, mà sẽ đẩy code lên GitHub thông qua Git. Cách làm này giúp mọi thay đổi đều có lịch sử commit, có thể review lại, rollback lại và truy vết được ai đã thay đổi phần nào.

Trong dự án này, developer sẽ làm việc với các phần như backend microservices, frontend buyer/seller/moderator, Kubernetes manifest hoặc pipeline script. Sau khi code được push lên GitHub, quy trình CI/CD sẽ bắt đầu chạy tự động.

Câu nói ngắn:

```txt
Developer chỉ chịu trách nhiệm viết code và push lên GitHub. Toàn bộ phần kiểm tra, build image và deploy được tự động hóa bằng Jenkins và Argo CD.
```

### 12.2 GitHub

GitHub là nơi lưu source code và cấu hình triển khai của dự án.

Trong sơ đồ, GitHub nhận code từ developer, sau đó Jenkins sẽ pull code từ GitHub để chạy pipeline. Ngoài source code, GitHub còn lưu Kustomize manifest trong thư mục `infrastructure/kubernetes/overlays/dev`. Đây là phần Argo CD theo dõi để biết version nào cần deploy lên Kubernetes.

Điểm quan trọng là GitHub đóng vai trò làm nguồn sự thật duy nhất. Nghĩa là trạng thái mong muốn của hệ thống nằm trong Git. Khi muốn deploy version mới, Jenkins không apply trực tiếp vào Kubernetes, mà chỉ cập nhật image tag trong GitHub. Sau đó Argo CD mới đọc GitHub và sync vào cluster.

Câu nói ngắn:

```txt
GitHub không chỉ lưu code, mà còn lưu cấu hình GitOps. Vì vậy em có thể biết version nào đang chạy bằng cách nhìn vào commit và image tag trong Git.
```

### 12.3 Jenkins CI Job

Sau khi GitHub có thay đổi, Jenkins CI job sẽ được kích hoạt.

Trong dự án của em, job CI chính là `ecommerce-dev-ci-build`. Job này sẽ pull code từ GitHub, kiểm tra service hoặc frontend app nào bị thay đổi, sau đó chạy test, build và scan bảo mật.

Mục tiêu của CI là kiểm tra chất lượng trước khi tạo Docker image. Nếu test fail hoặc scan fail thì pipeline dừng lại, image không được push và hệ thống không deploy version lỗi.

Trong hình, phần Jenkins CI nằm ở nửa trên, đây là giai đoạn kiểm tra code trước khi đưa vào runtime.

Câu nói ngắn:

```txt
Jenkins CI đóng vai trò cổng kiểm tra đầu vào. Code phải qua test, build và security scan trước khi được đóng gói thành Docker image.
```

### 12.4 OWASP Dependency Check

Sau khi Jenkins pull code, một trong các bước bảo mật là OWASP Dependency Check.

Công cụ này kiểm tra các thư viện mà dự án đang sử dụng có lỗ hổng bảo mật đã biết hay không. Ví dụ một package npm hoặc một thư viện backend có CVE nghiêm trọng, OWASP Dependency Check có thể phát hiện và tạo report.

Trong thuyết trình, có thể nói đây là bước kiểm tra rủi ro từ dependency bên thứ ba. Vì dự án microservices thường dùng nhiều package và framework, nên dependency scan giúp giảm nguy cơ đưa thư viện lỗi bảo mật vào môi trường chạy thật.

Câu nói ngắn:

```txt
OWASP Dependency Check giúp phát hiện lỗ hổng trong thư viện phụ thuộc, tức là kiểm tra rủi ro đến từ package bên thứ ba.
```

### 12.5 SonarQube

SonarQube nằm ở phần code quality gate.

Khác với OWASP Dependency Check, SonarQube tập trung vào chất lượng source code. Nó kiểm tra bug, vulnerability, code smell, duplicated code và quality gate.

Nếu bật quality gate nghiêm ngặt, một bản build có quá nhiều bug hoặc lỗi bảo mật trong code có thể bị chặn trước khi deploy. Như vậy SonarQube giúp team không chỉ chạy được app, mà còn giữ chất lượng code ở mức kiểm soát được.

Câu nói ngắn:

```txt
SonarQube là lớp kiểm tra chất lượng code. Nó giúp phát hiện bug, code smell và các vấn đề bảo mật trong source code trước khi build image.
```

### 12.6 Trivy

Trivy dùng để scan bảo mật ở hai thời điểm.

Thứ nhất là filesystem scan, kiểm tra source code và dependency trong workspace. Thứ hai là image scan, kiểm tra Docker image sau khi build xong.

Trong hình, Trivy nằm trước bước Docker build/push. Ý nghĩa là trước khi image được đưa lên registry và deploy vào Kubernetes, hệ thống cần kiểm tra xem image đó có chứa package hoặc lỗ hổng nghiêm trọng không.

Câu nói ngắn:

```txt
Trivy giúp kiểm tra bảo mật source và container image. Nhờ đó image có rủi ro cao sẽ bị phát hiện trước khi deploy lên Kubernetes.
```

### 12.7 Docker Và Docker Hub

Sau khi code qua các bước kiểm tra, Jenkins build Docker image.

Docker image là gói chạy của từng service. Ví dụ `api-gateway`, `auth-service`, `product-service`, `buyer-web` hoặc `seller-web` đều được đóng gói thành image riêng.

Sau khi build xong, Jenkins push image lên Docker Hub với tag là git short SHA. Cách đặt tag theo commit giúp truy vết được image đang chạy được build từ commit nào.

Ví dụ image trong dự án có dạng:

```txt
docker.io/vantruong179/ecommerce-microservices-api-gateway:<tag>
```

Câu nói ngắn:

```txt
Docker đóng gói service thành image, còn Docker Hub lưu image đó để Kubernetes có thể pull về chạy.
```

### 12.8 Jenkins CD Job

Sau khi Jenkins CI build và push image thành công, Jenkins sẽ trigger CD job.

Trong dự án của em, CD job là `ecommerce-dev-cd-gitops`. Job này không deploy trực tiếp vào Kubernetes. Thay vào đó, nó cập nhật image tag mới trong file Kustomize rồi commit ngược lại GitHub.

Ví dụ nếu image mới có tag `abc123`, CD job sẽ sửa `newTag` trong:

```txt
infrastructure/kubernetes/overlays/dev/kustomization.yaml
```

Sau đó commit message thường có dạng:

```txt
chore(gitops): deploy dev <image-tag>
```

Câu nói ngắn:

```txt
Jenkins CD không apply trực tiếp vào cluster. Nó chỉ cập nhật version image trong Git để Argo CD deploy theo đúng mô hình GitOps.
```

### 12.9 Argo CD

Argo CD là phần deploy theo GitOps.

Argo CD theo dõi GitHub, cụ thể là branch `main` và thư mục `infrastructure/kubernetes/overlays/dev`. Khi Jenkins CD job commit image tag mới, Argo CD phát hiện Git thay đổi và sync manifest vào Kubernetes.

Trong Argo CD, trạng thái mong muốn là:

```txt
Synced
Healthy
```

`Synced` nghĩa là trạng thái trong Kubernetes đã khớp với Git. `Healthy` nghĩa là các resource như Deployment, Pod, Service đang hoạt động bình thường.

Câu nói ngắn:

```txt
Argo CD là công cụ deploy chính. Nó đọc cấu hình từ Git và đảm bảo Kubernetes luôn chạy đúng version được khai báo trong Git.
```

### 12.10 Kubernetes

Kubernetes là nơi chạy ứng dụng thật.

Sau khi Argo CD sync, Kubernetes sẽ rollout pod mới. Mỗi microservice hoặc frontend app chạy dưới dạng Deployment và Pod trong namespace `ecommerce-dev`.

Trong dự án này, cluster gồm:

```txt
k8s-cp-01       control-plane
k8s-worker-01   app workloads
k8s-worker-02   data/infra workloads
```

Nói đơn giản, Kubernetes chịu trách nhiệm chạy container, restart pod khi lỗi, quản lý service discovery, rollout version mới và phân phối workload lên các worker node.

Câu nói ngắn:

```txt
Kubernetes là môi trường runtime của dự án. Jenkins build image, Argo CD deploy manifest, còn Kubernetes là nơi thật sự chạy các service.
```

### 12.11 Prometheus

Prometheus là công cụ thu thập metrics.

Sau khi ứng dụng chạy trên Kubernetes, mình cần quan sát tình trạng hệ thống. Prometheus sẽ thu các chỉ số như CPU, RAM, trạng thái pod, request count, latency hoặc metrics từ application.

Khi có lỗi production, Prometheus giúp trả lời các câu hỏi như: node có quá tải không, pod có restart nhiều không, service có tăng lỗi 5xx không, hoặc tài nguyên có gần đầy không.

Câu nói ngắn:

```txt
Prometheus thu thập số liệu vận hành của Kubernetes và ứng dụng, giúp phát hiện dấu hiệu lỗi hoặc quá tải.
```

### 12.12 Grafana

Grafana là giao diện dashboard cho metrics.

Prometheus là nơi thu dữ liệu, còn Grafana là nơi hiển thị dữ liệu thành biểu đồ. Khi thuyết trình, Grafana rất dễ demo vì có thể cho giảng viên thấy CPU/RAM node, pod resource, traffic hoặc tình trạng hệ thống theo thời gian.

Trong sơ đồ, Grafana nằm sau Prometheus ở phần monitoring. Điều này thể hiện là dữ liệu vận hành được thu thập rồi trực quan hóa để người vận hành dễ theo dõi.

Câu nói ngắn:

```txt
Grafana giúp trực quan hóa metrics từ Prometheus, nhờ vậy em có dashboard để quan sát sức khỏe hệ thống.
```

### 12.13 Email Notification

Trong sơ đồ có phần notify qua email.

Ý tưởng của phần này là sau khi pipeline chạy xong, Jenkins hoặc hệ thống monitoring có thể gửi thông báo cho người vận hành. Ví dụ build thành công, build thất bại, scan phát hiện lỗi nghiêm trọng hoặc deployment có vấn đề.

Trong dự án thực tế, email notification giúp người vận hành không cần ngồi nhìn màn hình Jenkins liên tục. Khi có lỗi, hệ thống chủ động gửi thông báo để xử lý nhanh hơn.

Câu nói ngắn:

```txt
Email notification giúp báo kết quả pipeline hoặc cảnh báo vận hành cho người phụ trách, đặc biệt khi build fail hoặc deploy có lỗi.
```

### 12.14 Rancher

Ngoài sơ đồ CI/CD chính, dự án của em có thêm Rancher để quản trị Kubernetes bằng giao diện web.

Rancher không thay thế Argo CD. Argo CD dùng để deploy theo GitOps, còn Rancher dùng để quan sát và quản trị cluster. Với Rancher, em có thể xem node, namespace, deployment, pod, service, ingress, logs và resource usage.

Khi có lỗi, Rancher giúp người mới dễ nhìn hơn so với chỉ dùng `kubectl`. Ví dụ có pod `CrashLoopBackOff`, mình có thể mở Rancher để xem pod đó đang nằm ở node nào, log ra sao và event báo lỗi gì.

Câu nói ngắn:

```txt
Rancher là UI quản trị Kubernetes. Em dùng Rancher để xem node, workload, pod, logs và tài nguyên cluster một cách trực quan.
```

### 12.15 Teleport

Teleport là công cụ bổ sung cho phần bảo mật truy cập.

Teleport không nằm trong luồng deploy ứng dụng, nhưng rất quan trọng trong vận hành. Nó kiểm soát ai được SSH vào VPS và ai được truy cập Kubernetes.

Trong dự án, Teleport quản lý 4 VPS và Kubernetes cluster:

```txt
devsecops-01
k8s-cp-01
k8s-worker-01
k8s-worker-02
ecommerce-kubeadm-dev
```

Em đã tạo phân quyền:

```txt
admin  -> quản trị server và Kubernetes
viewer -> chỉ xem Kubernetes, không SSH vào VPS, không xem secret, không exec pod
```

Điểm này thể hiện nguyên tắc least privilege. Người chỉ cần xem log thì không được cấp toàn quyền admin.

Câu nói ngắn:

```txt
Teleport là lớp Zero Trust Access. Nó giúp truy cập server và Kubernetes an toàn hơn, có phân quyền theo role và có audit log.
```

### 12.16 Đoạn Kết Khi Nói Theo Sơ Đồ

Tóm lại, luồng của em đi từ code đến production-like environment như sau:

```txt
Developer push code lên GitHub.
Jenkins CI pull code, test, scan bằng OWASP, SonarQube và Trivy.
Jenkins build Docker image và push lên Docker Hub.
Jenkins CD cập nhật image tag trong Git.
Argo CD đọc Git và sync vào Kubernetes.
Kubernetes rollout service mới.
Prometheus và Grafana giám sát hệ thống.
Rancher hỗ trợ quản trị cluster bằng UI.
Teleport kiểm soát truy cập server và Kubernetes.
```

Điểm em muốn nhấn mạnh là Jenkins không deploy trực tiếp vào cluster. Mọi thay đổi production-like đều đi qua Git, sau đó Argo CD sync vào Kubernetes. Cách làm này giúp hệ thống dễ rollback, dễ audit và phù hợp với mô hình DevSecOps/GitOps.
