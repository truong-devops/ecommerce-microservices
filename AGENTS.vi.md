# AGENTS.vi.md

Quy tắc Codex cho repo này (bản ngắn, dùng hằng ngày).
Mục tiêu: giảm token, không giảm chất lượng code.

## 1) Nguyên tắc nhanh

- Chỉ đọc đúng phạm vi task, không quét cả repo.
- Sửa tối thiểu, tránh refactor lan rộng nếu không bắt buộc.
- Test theo tầng: nhỏ trước, lớn sau.
- Báo cáo ngắn: file đổi, lý do, test đã chạy, rủi ro còn lại.

## 2) Định tuyến phạm vi

- Backend runtime: `services/*`
- Shared contract: `shared/*` (`proto`, `kafka`, `types`, `contracts`)
- NestJS shared runtime: `packages/backend-shared/*`
- Frontend: `frontend/*`
- Chuẩn code: `docs/development/code-standards.md`

Rule: task thuộc service nào thì ưu tiên đọc/sửa trong service đó trước.

## 3) Ladder kiểm thử (bắt buộc)

- `L0` (nhỏ, ít rủi ro): kiểm tra module/file bị chạm.
- `L1` (mặc định):
  - Go service: `cd services/<name> && go test ./...`
  - NestJS (`auth-service`):
    - `npm --workspace services/auth-service run test`
  - Legacy shadow (`product-service-nest`): chỉ khi sửa script so sánh Nest vs Go
- `L2` (đổi API/event): chạy script tích hợp tương ứng trong `scripts/`.
- `L3` (đắt, chỉ khi cần): `npm run test` hoặc full turbo.

Không nhảy lên `L3` nếu chưa thử `L0/L1`.

## 4) Lệnh chuẩn tiết kiệm token

- Tìm file: `rg --files <path>`
- Tìm code: `rg -n "<pattern>" <path>`
- Go test theo service: `cd services/<go-service> && go test ./...`
- Nest build:
  - `npm --workspace services/auth-service run build`
  - `cd services/product-service && go test ./...` (catalog Go)

## 5) Prompt mẫu cực ngắn

```txt
Follow AGENTS.md + docs/development/code-standards.md.
Scope: <service/module>.
Do minimal patch only, keep boundaries, no broad refactor.
Validate with L0/L1 first; escalate only if needed.
Return: changed files, why, tests run, remaining risks.
```

