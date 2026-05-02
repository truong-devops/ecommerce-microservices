package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cart-service/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CartRepository struct {
	db                 *pgxpool.Pool
	persistenceEnabled bool
}

func NewCartRepository(db *pgxpool.Pool, persistenceEnabled bool) *CartRepository {
	return &CartRepository{
		db:                 db,
		persistenceEnabled: persistenceEnabled,
	}
}

func (r *CartRepository) PersistenceEnabled() bool {
	return r.persistenceEnabled
}

func (r *CartRepository) Ping(ctx context.Context) error {
	if r.db == nil {
		return nil
	}
	return r.db.Ping(ctx)
}

func (r *CartRepository) LoadByUserID(ctx context.Context, userID string) (*domain.CartSnapshot, error) {
	if !r.persistenceEnabled {
		return nil, nil
	}

	row := r.db.QueryRow(ctx, `
		SELECT id, user_id, currency, subtotal, discount_total, grand_total, expires_at, version, created_at, updated_at
		FROM carts
		WHERE user_id = $1
	`, userID)

	var (
		cart      domain.CartSnapshot
		expiresAt time.Time
		createdAt time.Time
		updatedAt time.Time
	)

	if err := row.Scan(
		&cart.ID,
		&cart.UserID,
		&cart.Currency,
		&cart.Subtotal,
		&cart.DiscountTotal,
		&cart.GrandTotal,
		&expiresAt,
		&cart.Version,
		&createdAt,
		&updatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("load cart failed", err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, product_id, variant_id, sku, name, image, unit_price, quantity, line_total, seller_id, metadata
		FROM cart_items
		WHERE cart_id = $1
		ORDER BY created_at ASC
	`, cart.ID)
	if err != nil {
		return nil, queryFailed("load cart items failed", err)
	}
	defer rows.Close()

	cart.Items = make([]domain.CartItem, 0)
	for rows.Next() {
		var (
			item      domain.CartItem
			variantID *string
			image     *string
			metadata  []byte
		)

		if err := rows.Scan(
			&item.ID,
			&item.ProductID,
			&variantID,
			&item.SKU,
			&item.Name,
			&image,
			&item.UnitPrice,
			&item.Quantity,
			&item.LineTotal,
			&item.SellerID,
			&metadata,
		); err != nil {
			return nil, queryFailed("scan cart item failed", err)
		}

		item.VariantID = variantID
		item.Image = image
		item.Metadata = map[string]any{}
		if len(metadata) > 0 {
			if err := json.Unmarshal(metadata, &item.Metadata); err != nil {
				return nil, queryFailed("decode cart item metadata failed", err)
			}
		}
		cart.Items = append(cart.Items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, queryFailed("iterate cart items failed", err)
	}

	cart.ExpiresAt = expiresAt.UTC().Format(time.RFC3339)
	cart.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	cart.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return &cart, nil
}

func (r *CartRepository) Save(ctx context.Context, cart *domain.CartSnapshot) error {
	if !r.persistenceEnabled {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return queryFailed("begin tx failed", err)
	}
	defer tx.Rollback(ctx)

	expiresAt, err := time.Parse(time.RFC3339, cart.ExpiresAt)
	if err != nil {
		return fmt.Errorf("parse expiresAt: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO carts (
			id, user_id, currency, subtotal, discount_total, grand_total, expires_at, version, created_at, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (user_id) DO UPDATE SET
			currency = EXCLUDED.currency,
			subtotal = EXCLUDED.subtotal,
			discount_total = EXCLUDED.discount_total,
			grand_total = EXCLUDED.grand_total,
			expires_at = EXCLUDED.expires_at,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at
	`, cart.ID, cart.UserID, cart.Currency, cart.Subtotal, cart.DiscountTotal, cart.GrandTotal, expiresAt, cart.Version, parseTimeOrNow(cart.CreatedAt), parseTimeOrNow(cart.UpdatedAt)); err != nil {
		return queryFailed("upsert cart failed", err)
	}

	if _, err := tx.Exec(ctx, `DELETE FROM cart_items WHERE cart_id = $1`, cart.ID); err != nil {
		return queryFailed("delete old cart items failed", err)
	}

	for _, item := range cart.Items {
		if item.Metadata == nil {
			item.Metadata = map[string]any{}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO cart_items (
				id, cart_id, product_id, variant_id, sku, name, image, unit_price, quantity, line_total, seller_id, metadata
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		`, item.ID, cart.ID, item.ProductID, item.VariantID, item.SKU, item.Name, item.Image, item.UnitPrice, item.Quantity, item.LineTotal, item.SellerID, item.Metadata); err != nil {
			return queryFailed("insert cart item failed", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return queryFailed("commit tx failed", err)
	}
	return nil
}

func (r *CartRepository) DeleteByUserID(ctx context.Context, userID string) error {
	if !r.persistenceEnabled {
		return nil
	}
	if _, err := r.db.Exec(ctx, `DELETE FROM carts WHERE user_id = $1`, userID); err != nil {
		return queryFailed("delete cart failed", err)
	}
	return nil
}

func queryFailed(message string, err error) error {
	return fmt.Errorf("%s: %w", message, err)
}

func parseTimeOrNow(raw string) time.Time {
	if raw == "" {
		return time.Now().UTC()
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Now().UTC()
	}
	return t.UTC()
}
