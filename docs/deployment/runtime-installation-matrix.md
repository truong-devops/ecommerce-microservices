# Runtime And Installation Matrix

Tài liệu này tóm tắt các thành phần trong plan deployment và cách chúng được chạy/cài đặt.

## 1. `devsecops-01`

Máy này chạy CI/CD tooling, reverse proxy cho tooling và các scanner. Docker image được push lên Docker Hub, nên không cần chạy registry riêng trên VPS.

### Chạy Bằng Docker Container

| Thành phần | Cách chạy | Ghi chú |
|---|---|---|
| Jenkins | Docker container | CI/CD UI và pipeline runner |
| SonarQube optional | Docker container | Khá nặng, nên bật sau |
| OWASP Dependency Check | Docker image tạm trong Jenkins pipeline | Chạy khi pipeline scan dependency |
| Sonar Scanner | Docker image tạm trong Jenkins pipeline | Chạy khi bật SonarQube |
| Go test environment | Docker image tạm `golang:*` | Jenkins dùng để test Go services |
| Node test environment | Docker image tạm `node:*` | Jenkins dùng để test `auth-service` |

### Cài Trực Tiếp Trên Máy

| Thành phần | Cách cài | Ghi chú |
|---|---|---|
| Docker Engine | apt repository Docker | Để Jenkins build/push image và chạy tooling containers |
| Docker CLI / Buildx / Compose plugin | apt repository Docker | Dùng bởi Jenkins và admin |
| Nginx | apt | Reverse proxy cho Jenkins/Sonar |
| Certbot | apt | Cấp HTTPS cho tooling domains |
| Git/curl/jq/unzip/htop/fail2ban | apt | Tool hệ thống cơ bản |

### Dịch Vụ Bên Ngoài

| Thành phần | Cách dùng | Ghi chú |
|---|---|---|
| Docker Hub | SaaS bên ngoài | Lưu image `docker.io/<username>/<service>:<tag>` để Kubernetes pull |

### Cài Bên Trong Jenkins Container

| Thành phần | Cách cài | Ghi chú |
|---|---|---|
| Docker CLI | apt trong Jenkins container | Jenkins dùng Docker socket của host |
| kubectl | binary trong Jenkins container | Chỉ cần cho fallback/debug pipeline |
| Trivy | install script trong Jenkins container | Scan filesystem và image |

## 2. Kubernetes Nodes

Áp dụng cho:

```txt
k8s-cp-01
k8s-worker-01
k8s-worker-02
```

### Cài Trực Tiếp Trên Máy

| Thành phần | Cách cài | Ghi chú |
|---|---|---|
| containerd | apt | Container runtime cho Kubernetes |
| kubeadm | apt Kubernetes repo | Bootstrap cluster |
| kubelet | apt Kubernetes repo | Agent chạy trên mỗi node |
| kubectl | apt Kubernetes repo | CLI quản trị cluster |
| Kernel modules/sysctl | file config hệ thống | Bắt buộc cho networking Kubernetes |
| Git/curl/jq/htop/fail2ban | apt | Tool hệ thống cơ bản |

### Chạy Trong Kubernetes

Các thành phần này không chạy bằng Docker CLI trực tiếp. Chúng chạy như Kubernetes workload.

| Thành phần | Loại workload | Ghi chú |
|---|---|---|
| Calico/Cilium | DaemonSet/Deployment | CNI networking |
| metrics-server | Deployment | Hỗ trợ `kubectl top` |
| ingress-nginx | Deployment | Nhận traffic `80/443` cho app và UI |
| local-path-provisioner | Deployment | StorageClass local demo |
| cert-manager | Deployment | Cấp TLS certificate |
| Argo CD | Deployments/StatefulSet | GitOps deploy |
| Rancher | Deployment | UI quản trị cluster |
| PostgreSQL | Deployment + PVC | Data store demo |
| MongoDB | Deployment + PVC | Data store demo |
| Redis | Deployment + PVC | Cache/session/rate limit |
| api-gateway | Deployment | Public API entrypoint |
| auth-service | Deployment | Authentication service |
| user-service | Deployment | User service |
| product-service | Deployment | Product/catalog service |
| cart-service | Deployment | Cart service |
| Prometheus/Grafana/Loki optional | Deployments/StatefulSets | Monitoring/logging |

## 3. Teleport EC2/VPS Riêng

Teleport nên chạy trên một EC2/VPS riêng nếu ngân sách cho phép.

### Cài Trực Tiếp Trên Máy Teleport

| Thành phần | Cách cài | Ghi chú |
|---|---|---|
| Teleport Auth Service | install script/systemd | Quản lý identity, roles, audit |
| Teleport Proxy Service | install script/systemd | Public endpoint `teleport.dt-commerce.site:443` |

### Cài Trên Từng VPS

| Thành phần | Cách cài | Ghi chú |
|---|---|---|
| Teleport node agent | install script/systemd | Cho phép `tsh ssh` vào từng VPS |

### Chạy Trong Kubernetes

| Thành phần | Cách chạy | Ghi chú |
|---|---|---|
| teleport-kube-agent | Helm chart | Cho phép `tsh kube login` vào cluster |

## 4. Tóm Tắt Nhanh

```txt
DevSecOps tooling:
  Chủ yếu chạy bằng Docker trên devsecops-01.
  Image registry dùng Docker Hub bên ngoài, không chạy registry riêng.

Kubernetes base:
  containerd/kubeadm/kubelet/kubectl cài trực tiếp bằng apt.

App + DB + Argo CD + Rancher:
  Chạy trong Kubernetes.

Nginx host:
  Cài trực tiếp bằng apt trên devsecops-01.

Teleport:
  Auth/Proxy cài trực tiếp trên EC2/VPS riêng.
  Node agent cài trực tiếp trên từng VPS.
  Kube agent chạy trong Kubernetes.
```
