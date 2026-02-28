# CONTRIBUTING

Áp dụng cho dự án **ecommerce-microservices** (monorepo: `services/`, `shared/`, `frontend/`, `infrastructure/`, `cicd/`).  
Mục tiêu: làm việc nhóm 2 người **rõ ràng – ít conflict – dễ review – dễ demo**.

> **Quy tắc vàng**
> 1) Mỗi thay đổi đi qua PR  
> 2) Commit rõ nghĩa, có scope  
> 3) Pull/Rebase mỗi ngày, push thường xuyên (nhưng có kỷ luật)  
> 4) `main` luôn demo được

---

## 0) Thuật ngữ nhanh

- **Main**: nhánh ổn định (demo/prod)
- **Develop**: nhánh tích hợp (staging)
- **Feature branch**: nhánh làm tính năng riêng
- **PR**: Pull Request (review + merge)
- **Scope**: khu vực thay đổi (service/module) trong commit message

---

## 1) Quy tắc đặt tên nhánh (Branch Naming)

### 1.1 Cấu trúc tên nhánh (bắt buộc)
**Pattern chuẩn (kebab-case):**
```
<type>/<scope>-<short-desc>
```

**type** (chọn 1):
- `feature`  : tính năng mới
- `fix`      : sửa bug
- `hotfix`   : sửa gấp trên `main`
- `chore`    : config, deps, scripts, cleanup
- `docs`     : docs
- `refactor` : refactor lớn

**scope** (chọn 1, theo service/module):
- Backend: `api-gateway`, `auth`, `user`, `product`, `inventory`, `cart`, `order`, `payment`, `shipping`, `notification`, `review`, `analytics`, `livestream`
- Cross: `shared`, `infra`, `cicd`, `docs`, `frontend-buyer`, `frontend-seller`

**short-desc**: mô tả ngắn, không dấu, kebab-case.
- ✅ `checkout-saga`, `webhook-idempotency`, `ws-room-broadcast`
- ❌ `fixbug`, `update`, `newfeature`, `abc`

### 1.2 Ví dụ tên nhánh đúng chuẩn
- `feature/order-checkout-saga`
- `feature/livestream-translate-subtitle`
- `fix/payment-webhook-idempotency`
- `chore/infra-add-fluent-bit-elk`
- `docs/docs-system-design`
- `refactor/shared-http-error-shape`
- `hotfix/api-gateway-rate-limit-crash`

### 1.3 Quy ước liên quan task/issue (khuyến nghị)
Nếu có mã issue (Jira/GitHub issue), gắn vào cuối:
- `feature/order-checkout-saga-123` hoặc `feature/order-checkout-saga-#12`
- Không có issue thì bỏ qua.

---

## 2) Quy tắc tạo nhánh, pull & push hằng ngày (Daily Workflow)

### 2.1 Bắt đầu ngày mới (bắt buộc)
1) Cập nhật nhánh tích hợp:
```
git checkout develop
git pull --rebase
```
> Nếu team không dùng `develop` thì thay `develop` bằng `main`.

2) Tạo nhánh mới cho task:
```
git checkout -b feature/order-checkout-saga
```

3) Chạy nhanh sanity:
- Backend: `pnpm -w lint` hoặc `pnpm -w build` (tuỳ mức độ)
- Frontend: `pnpm -w --filter @frontend/buyer dev` (nếu cần)

### 2.2 Trong ngày (khuyến nghị mạnh)
- Commit nhỏ theo “đơn vị review được” (1 endpoint / 1 module / 1 manifest).
- Push lên remote ít nhất **mỗi 1–2 giờ** hoặc sau mỗi cột mốc nhỏ:
  - giảm rủi ro mất code
  - dễ xin review sớm

**Gợi ý nhịp commit**
- 1 commit: tạo khung
- 1 commit: implement feature
- 1 commit: test/fix/lint

### 2.3 Cuối ngày (bắt buộc)
1) Rebase lại theo `develop` để giảm conflict:
```
git checkout develop
git pull --rebase
git checkout feature/order-checkout-saga
git rebase develop
```
2) Push branch:
```
git push
```
3) Nếu chưa xong, mở **Draft PR** để teammate xem sớm.

### 2.4 Quy tắc Force push (chỉ khi rebase)
- Chỉ dùng khi bạn đã `rebase`:
```
git push --force-with-lease
```
- **Không dùng** `--force` trừ khi hiểu rõ.

### 2.5 Thiết lập Git giúp bạn đỡ quên (khuyến nghị)
```
git config --global pull.rebase true
git config --global rebase.autoStash true
```
> Khi đó `git pull` sẽ tự rebase và tự stash nếu cần.

---

## 3) Quy tắc commit message (Conventional Commits)

### 3.1 Format (bắt buộc)
```
<type>(<scope>): <subject>
```
**type**:
- `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `chore`, `ci`, `build`, `revert`

**scope**: giống scope ở branch (service/module).

**subject**: câu ngắn dạng mệnh lệnh, tiếng Anh (khuyến nghị), không dấu chấm cuối.

### 3.2 Quy tắc subject (bắt buộc)
- Bắt đầu bằng động từ: add / implement / update / remove / handle / support / fix
- <= ~72 ký tự nếu có thể
- Không viết chung chung: “update”, “fix bug”, “test”

✅ Good:
- `feat(order): implement checkout saga`
- `fix(payment): dedupe webhook using idempotency key`
- `chore(infra): add fluent-bit daemonset for elk`
- `docs(architecture): document kafka topics and contracts`

❌ Bad:
- `update`
- `fix bug`
- `test commit`
- `done`

### 3.3 Commit body (khuyến nghị khi thay đổi lớn)
Sau dòng đầu, thêm body:
- What changed?
- Why changed?
- Any migration/compat notes?

Ví dụ:
```
feat(inventory): add reservation ttl
- Reserve stock for 10 minutes
- Release on order cancel
- Emit inventory.reserved and inventory.released
```

### 3.4 Breaking changes (hiếm)
- Dùng `!`:
  - `feat(api-gateway)!: change auth header format`
- Hoặc footer:
  - `BREAKING CHANGE: clients must send X-Auth-Token`

### 3.5 Quy tắc WIP commit
- Có thể commit WIP trong branch cá nhân, nhưng **không merge WIP vào develop/main**.
- Format:
  - `chore(wip): partial implementation of ...`
- Trước khi merge, squash/cleanup commit WIP.

---

## 4) Quy ước PR (Pull Request) – bắt buộc

### 4.1 Khi nào mở PR?
- Khi hoàn thành 1 mục tiêu có thể review:
  - 1 endpoint + validation + error handling
  - 1 consumer Kafka
  - 1 module service
  - 1 manifest deploy (k3s)
- Nếu task dài > 1 ngày → mở **Draft PR** sớm.

### 4.2 PR title (bắt buộc)
Dùng giống commit message (Conventional Commits):
- `feat(order): checkout saga`
- `fix(payment): webhook idempotency`

### 4.3 PR description template (bắt buộc)
Copy/paste mẫu sau:

```md
## What
- ...

## Why
- ...

## How to test
1) ...
2) ...

## Screenshots/Logs (optional)
- ...

## Notes / Risks
- impact / migration / rollback
```

### 4.4 PR checklist (bắt buộc)
- [ ] Đã rebase theo `develop` mới nhất
- [ ] `pnpm -w lint` pass (hoặc lint của project liên quan)
- [ ] `pnpm -w build` pass (hoặc build của project liên quan)
- [ ] Có hướng dẫn test rõ ràng (manual steps OK)
- [ ] Nếu thay đổi **proto/event/schema** → update docs + bump version (nếu có)
- [ ] Không commit artifacts: `dist/`, `.next/`, `node_modules/`

### 4.5 Quy tắc review (2 người)
- Mỗi PR phải có **ít nhất 1 approve** từ teammate.
- PR > 300–500 lines nên tách nhỏ hoặc chia thành nhiều PR.
- Reviewer tập trung:
  - correctness, security, error handling, logs/metrics, naming, edge cases.

### 4.6 Merge strategy (khuyến nghị)
**Squash merge** (khuyên cho đồ án):
- Lịch sử gọn: 1 PR → 1 commit chính trên `develop`

---

## 5) Quy tắc đồng bộ code để tránh conflict

### 5.1 Mỗi ngày ít nhất 1 lần rebase
- Sáng: pull/rebase
- Cuối ngày: rebase + push

### 5.2 Khi có conflict
1) Rebase:
```
git rebase develop
```
2) Resolve conflict trong file
3) Mark resolved:
```
git add <file>
git rebase --continue
```
4) Push (nếu cần):
```
git push --force-with-lease
```

> Nếu bạn không quen rebase, có thể dùng merge, nhưng team nên thống nhất 1 cách để tránh rối lịch sử.

---

## 6) Quy tắc thay đổi Contracts (proto / Kafka events)

### 6.1 Khi thay đổi `.proto`
- Update file trong `shared/proto`
- Chạy generate/sync:
  - `pnpm gen:proto` (hoặc script tương đương)
- Update docs: `docs/architecture/grpc-contracts.md`

### 6.2 Khi thay đổi Kafka event schema
- Update `shared/kafka/events/...`
- Versioning khuyến nghị:
  - `events/order/v1/...` → nếu breaking thì tạo `v2` thay vì sửa phá v1
- Update docs: `docs/architecture/kafka-events.md`

---

## 7) Lệnh chuẩn (khuyến nghị) cho monorepo Turbo

- Build all:
  - `pnpm build` (turbo run build)
- Dev all (song song):
  - `pnpm dev`
- Chỉ build 1 service:
  - `pnpm -w turbo run build --filter=@services/order-service` (nếu đặt name chuẩn)

---

## 8) Ownership & chia việc (khuyến nghị cho 2 người)

Để giảm conflict:
- Bạn A: core backend (`order`, `payment`, `inventory`) + Kafka
- Bạn B: `api-gateway` + frontend + `notification/livestream` + docs/demo

---

**Last updated:** 2026-02-28
