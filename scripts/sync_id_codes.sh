#!/usr/bin/env bash

set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ecommerce-microservices-postgres-1}"
MONGO_CONTAINER="${MONGO_CONTAINER:-ecommerce-microservices-mongo-1}"
AUTH_DB="${AUTH_DB:-auth_db}"
USER_DB="${USER_DB:-ecommerce_user}"
ORDER_DB="${ORDER_DB:-ecommerce}"
MONGO_PRODUCT_DB="${MONGO_PRODUCT_DB:-ecommerce_product}"
MONGO_CHAT_DB="${MONGO_CHAT_DB:-ecommerce_chat}"

echo "[sync] reading seller IDs from auth database..."
AUTH_SELLER_IDS_RAW="$(docker exec -i "${POSTGRES_CONTAINER}" psql -U postgres -d "${AUTH_DB}" -tA -c "select id from users where role = 'SELLER' order by created_at asc;")"
if [[ -z "${AUTH_SELLER_IDS_RAW}" ]]; then
  echo "[sync] no SELLER account in auth_db, stop."
  exit 1
fi

IFS=$'\n' read -r -d '' -a AUTH_SELLER_IDS < <(printf '%s\0' "${AUTH_SELLER_IDS_RAW}")
CANONICAL_SELLER_ID="${CANONICAL_SELLER_ID:-${AUTH_SELLER_IDS[0]}}"

echo "[sync] canonical seller ID: ${CANONICAL_SELLER_ID}"

AUTH_SELLER_JS="["
for i in "${!AUTH_SELLER_IDS[@]}"; do
  id="${AUTH_SELLER_IDS[$i]}"
  if [[ "${i}" -gt 0 ]]; then
    AUTH_SELLER_JS+=","
  fi
  AUTH_SELLER_JS+="'${id}'"
done
AUTH_SELLER_JS+="]"

echo "[sync] align product-service Mongo sellerId with canonical seller..."
docker exec -i "${MONGO_CONTAINER}" mongosh --quiet "${MONGO_PRODUCT_DB}" --eval "
const canonicalSellerId = '${CANONICAL_SELLER_ID}';
const validSellerIds = ${AUTH_SELLER_JS};
const productResult = db.products.updateMany(
  { sellerId: { \$nin: validSellerIds } },
  { \$set: { sellerId: canonicalSellerId } }
);
const decorResult = db.shop_decors.updateMany(
  { sellerId: { \$nin: validSellerIds } },
  { \$set: { sellerId: canonicalSellerId } }
);
printjson({ productsMatched: productResult.matchedCount, productsModified: productResult.modifiedCount, decorsMatched: decorResult.matchedCount, decorsModified: decorResult.modifiedCount });
"

echo "[sync] align chat-service Mongo sellerId with canonical seller..."
docker exec -i "${MONGO_CONTAINER}" mongosh --quiet "${MONGO_CHAT_DB}" --eval "
const canonicalSellerId = '${CANONICAL_SELLER_ID}';
const validSellerIds = ${AUTH_SELLER_JS};
const convResult = db.conversations.updateMany(
  { sellerId: { \$nin: validSellerIds } },
  { \$set: { sellerId: canonicalSellerId } }
);
const msgResult = db.messages.updateMany(
  { senderRole: 'SELLER', senderId: { \$nin: validSellerIds } },
  { \$set: { senderId: canonicalSellerId } }
);
printjson({ conversationsMatched: convResult.matchedCount, conversationsModified: convResult.modifiedCount, messagesMatched: msgResult.matchedCount, messagesModified: msgResult.modifiedCount });
"

echo "[sync] align user-service IDs by email with auth IDs..."
AUTH_USERS_RAW="$(docker exec -i "${POSTGRES_CONTAINER}" psql -U postgres -d "${AUTH_DB}" -tA -F '|' -c "select id,email,role from users order by created_at asc;")"
while IFS='|' read -r auth_id auth_email auth_role; do
  [[ -z "${auth_id}" || -z "${auth_email}" ]] && continue
  auth_id="${auth_id//$'\r'/}"
  auth_email="${auth_email//$'\r'/}"
  auth_role="${auth_role//$'\r'/}"
  role_lc="buyer"
  case "${auth_role}" in
    SELLER) role_lc="seller" ;;
    ADMIN|SUPER_ADMIN|SUPPORT|WAREHOUSE) role_lc="admin" ;;
    *) role_lc="buyer" ;;
  esac

  docker exec -i "${POSTGRES_CONTAINER}" psql -U postgres -d "${USER_DB}" -c "
    UPDATE users u
    SET id = '${auth_id}'::uuid,
        role = '${role_lc}'::users_role_enum,
        status = CASE WHEN u.status = 'deleted'::users_status_enum THEN 'deleted'::users_status_enum ELSE 'active'::users_status_enum END,
        updated_at = now()
    WHERE lower(u.email) = lower('${auth_email}')
      AND u.id <> '${auth_id}'::uuid
      AND NOT EXISTS (SELECT 1 FROM users e WHERE e.id = '${auth_id}'::uuid);
  " >/dev/null
done <<< "${AUTH_USERS_RAW}"

echo "[sync] normalize order numbers to EMX format..."
docker exec -i "${POSTGRES_CONTAINER}" psql -U ecommerce -d "${ORDER_DB}" -c "
WITH ranked AS (
  SELECT id,
         'EMX' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC)::text, 7, '0') AS new_order_number
  FROM orders
)
UPDATE orders o
SET order_number = r.new_order_number,
    updated_at = now()
FROM ranked r
WHERE o.id = r.id
  AND o.order_number !~ '^EMX[0-9]+$';
" >/dev/null

echo "[sync] done."
