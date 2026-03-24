# Buyer Profile Phase A QA Checklist

## Scope

Phase A covers profile fields:

- `name`
- `phone`
- `address`
- `gender`
- `dateOfBirth`
- `avatarUrl`

No email-change flow in this checklist.

## Preconditions

1. Run latest migrations for `user-service`:
   - `npm run migration:run --workspace services/user-service`
2. Ensure services are up:
   - `user-service` (default `http://localhost:3100/api/v1`)
   - `buyer-web` (default `http://localhost:3000`)
3. Have a valid buyer `ACCESS_TOKEN`.

## Quick API Smoke (through buyer-web proxy)

Set env:

```bash
export ACCESS_TOKEN="<buyer_access_token>"
export BUYER_WEB_BASE_URL="http://localhost:3000"
```

### 1) Get current profile

```bash
curl -sS -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BUYER_WEB_BASE_URL/api/buyer/profile"
```

Expected:

- `success: true`
- `data` contains `gender`, `dateOfBirth`, `avatarUrl`

### 2) Update all Phase A fields

```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Buyer Phase A",
    "phone":"+84901234567",
    "address":"4429 Nguyen Cuu Phu",
    "gender":"female",
    "dateOfBirth":"2000-01-15",
    "avatarUrl":"https://cdn.example.com/avatar-phase-a.png"
  }' \
  "$BUYER_WEB_BASE_URL/api/buyer/profile"
```

Expected:

- `success: true`
- `data.gender === "female"`
- `data.dateOfBirth === "2000-01-15"`
- `data.avatarUrl` updated

### 3) Validation checks

- Invalid gender:
```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gender":"invalid"}' \
  "$BUYER_WEB_BASE_URL/api/buyer/profile"
```

Expected: `success: false`, `error.code = INVALID_PROFILE_GENDER`

- Invalid `dateOfBirth`:
```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dateOfBirth":"15-01-2000"}' \
  "$BUYER_WEB_BASE_URL/api/buyer/profile"
```

Expected: `success: false`, `error.code = INVALID_PROFILE_DATE_OF_BIRTH`

- Invalid `avatarUrl`:
```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"avatarUrl":"not-a-url"}' \
  "$BUYER_WEB_BASE_URL/api/buyer/profile"
```

Expected: `success: false`, `error.code = INVALID_PROFILE_AVATAR_URL`

## UI Manual Checklist (`/account`)

1. Load account page and verify existing values appear.
2. Edit `gender`, `dateOfBirth`, `avatarUrl`, click save.
3. Confirm success notice appears.
4. Refresh page: values remain persisted.
5. Enter invalid phone/date/url and verify field-level error appears.
6. Save button is disabled when there is no change.

## Rollback (Phase A migration)

Use helper script from repo root:

```bash
./scripts/rollback-user-service-profile-phase-a.sh
```

Or run manually:

```bash
npm run migration:revert --workspace services/user-service
```
