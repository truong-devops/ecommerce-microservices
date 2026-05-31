package repository

import (
	"strings"
	"testing"
)

func TestIdempotencyQueriesUsePaymentIDColumn(t *testing.T) {
	t.Parallel()

	queries := map[string]string{
		"find":   findIdempotencyRecordQuery,
		"create": createIdempotencyRecordQuery,
		"update": updateIdempotencyResultQuery,
	}

	for name, query := range queries {
		query := strings.ToLower(query)
		if strings.Contains(query, "order_id") {
			t.Fatalf("%s idempotency query must not reference missing order_id column: %s", name, query)
		}
		if !strings.Contains(query, "payment_id") {
			t.Fatalf("%s idempotency query must reference payment_id column: %s", name, query)
		}
	}
}
