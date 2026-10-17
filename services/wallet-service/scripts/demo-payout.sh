#!/usr/bin/env sh
set -eu

: "${SELLER_ACCESS_TOKEN:?SELLER_ACCESS_TOKEN is required}"
: "${ADMIN_ACCESS_TOKEN:?ADMIN_ACCESS_TOKEN is required to verify the demo bank account}"

gateway_base_url="${GATEWAY_BASE_URL:-http://localhost:12000/api/v1}"
bank_code="${DEMO_BANK_CODE:-VCB}"
bank_account_number="${DEMO_BANK_ACCOUNT_NUMBER:-0123456789}"
bank_account_holder="${DEMO_BANK_ACCOUNT_HOLDER:-DEMO SELLER}"
payout_amount="${DEMO_PAYOUT_AMOUNT:-10000}"
idempotency_key="wallet-demo-$(date +%s)-$$"
authorization_header="Authorization: Bearer ${SELLER_ACCESS_TOKEN}"
admin_authorization_header="Authorization: Bearer ${ADMIN_ACCESS_TOKEN}"

command -v jq >/dev/null 2>&1 || { printf '%s\n' 'jq is required'; exit 1; }

bank_payload=$(jq -n --arg bankCode "$bank_code" --arg accountNumber "$bank_account_number" --arg accountHolderName "$bank_account_holder" '{bankCode:$bankCode,accountNumber:$accountNumber,accountHolderName:$accountHolderName}')
curl --fail --silent --show-error --request PUT "${gateway_base_url}/wallets/me/bank-account" \
  --header "$authorization_header" --header 'Content-Type: application/json' --data "$bank_payload" >/dev/null
printf '%s\n' '✓ Tài khoản nhận tiền đã lưu (response chỉ chứa số đã mask).'

wallet_response=$(curl --fail --silent --show-error "${gateway_base_url}/wallets/me" --header "$authorization_header")
wallet_id=$(printf '%s' "$wallet_response" | jq -r '.data.walletId')
verification_payload=$(jq -n '{status:"ALLOWLISTED",reason:"Automated payout demo verification"}')
curl --fail --silent --show-error --request PATCH "${gateway_base_url}/admin/wallets/${wallet_id}/bank-account/status" \
  --header "$admin_authorization_header" --header 'Content-Type: application/json' --data "$verification_payload" >/dev/null
printf '%s\n' '✓ Admin đã xác minh tài khoản nhận tiền.'

available_amount=$(printf '%s' "$wallet_response" | jq -r '.data.availableAmount')
printf 'Số dư khả dụng: %s VND\n' "$available_amount"

if [ "$available_amount" -lt "$payout_amount" ]; then
  printf 'Không đủ số dư để demo payout %s VND.\n' "$payout_amount"
  exit 1
fi

payout_payload=$(jq -n --argjson amount "$payout_amount" '{amount:$amount,currency:"VND"}')
payout_response=$(curl --fail --silent --show-error --request POST "${gateway_base_url}/payouts" \
  --header "$authorization_header" --header 'Content-Type: application/json' \
  --header "Idempotency-Key: ${idempotency_key}" --data "$payout_payload")
payout_id=$(printf '%s' "$payout_response" | jq -r '.data.id')
printf '✓ Đã tạo payout %s với Idempotency-Key duy nhất.\n' "$payout_id"

attempt=1
while [ "$attempt" -le 12 ]; do
  payout_response=$(curl --fail --silent --show-error "${gateway_base_url}/payouts/${payout_id}" --header "$authorization_header")
  payout_status=$(printf '%s' "$payout_response" | jq -r '.data.status')
  printf '  Lần kiểm tra %s: %s\n' "$attempt" "$payout_status"
  case "$payout_status" in
    SUCCEEDED|FAILED|CANCELLED) break ;;
  esac
  attempt=$((attempt + 1))
  sleep 1
done

printf '%s\n' 'Số dư sau xử lý:'
curl --fail --silent --show-error "${gateway_base_url}/wallets/me" --header "$authorization_header" | jq '.data | {heldAmount,availableAmount,payoutPendingAmount,totalPaidOut,isFrozen}'
