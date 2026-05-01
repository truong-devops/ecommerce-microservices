package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"notification-service/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type NotificationRepository struct {
	pool *pgxpool.Pool
}

type CreateNotificationInput struct {
	RecipientID string
	Channel     domain.NotificationChannel
	Category    domain.NotificationCategory
	EventType   *string
	Subject     *string
	Content     string
	Payload     map[string]any
}

type CreateAttemptInput struct {
	NotificationID  string
	Provider        string
	Status          string
	ResponseMessage *string
	ErrorCode       *string
	Metadata        map[string]any
}

const notificationColumns = `
	id, recipient_id, channel, category, event_type, subject, content, payload,
	status, retry_count, next_retry_at, sent_at, read_at, created_at, updated_at
`

func NewNotificationRepository(pool *pgxpool.Pool) *NotificationRepository {
	return &NotificationRepository{pool: pool}
}

func (r *NotificationRepository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

func (r *NotificationRepository) Pool() *pgxpool.Pool {
	return r.pool
}

func (r *NotificationRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.BeginTx(ctx, pgx.TxOptions{})
}

func (r *NotificationRepository) SaveNotifications(ctx context.Context, tx pgx.Tx, inputs []CreateNotificationInput) ([]domain.Notification, error) {
	if len(inputs) == 0 {
		return []domain.Notification{}, nil
	}

	query := `
		INSERT INTO notifications (
			recipient_id, channel, category, event_type, subject, content, payload
		) VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING ` + notificationColumns

	items := make([]domain.Notification, 0, len(inputs))
	for _, input := range inputs {
		payload, err := toJSONB(input.Payload)
		if err != nil {
			return nil, err
		}
		row := tx.QueryRow(ctx, query,
			input.RecipientID,
			input.Channel,
			input.Category,
			input.EventType,
			input.Subject,
			input.Content,
			payload,
		)
		notification, err := scanNotification(row)
		if err != nil {
			return nil, err
		}
		items = append(items, notification)
	}

	return items, nil
}

func (r *NotificationRepository) SaveInboxEvent(ctx context.Context, tx pgx.Tx, eventKey, eventType string, payload map[string]any) error {
	payloadJSON, err := toJSONB(payload)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO inbox_events (event_key, event_type, payload)
		VALUES ($1,$2,$3)
	`, eventKey, eventType, payloadJSON)
	return err
}

func (r *NotificationRepository) FindByID(ctx context.Context, id string) (*domain.Notification, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+notificationColumns+` FROM notifications WHERE id = $1`, id)
	notification, err := scanNotification(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &notification, nil
}

func (r *NotificationRepository) FindByIDForUpdate(ctx context.Context, tx pgx.Tx, id string) (*domain.Notification, error) {
	row := tx.QueryRow(ctx, `SELECT `+notificationColumns+` FROM notifications WHERE id = $1 FOR UPDATE`, id)
	notification, err := scanNotification(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &notification, nil
}

func (r *NotificationRepository) UpdateReadAt(ctx context.Context, tx pgx.Tx, id string, readAt time.Time) (*domain.Notification, error) {
	row := tx.QueryRow(ctx, `
		UPDATE notifications
		SET read_at = $2, updated_at = now()
		WHERE id = $1
		RETURNING `+notificationColumns,
		id,
		readAt,
	)
	notification, err := scanNotification(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &notification, nil
}

func (r *NotificationRepository) List(ctx context.Context, q domain.NotificationListQuery, forcedRecipientID *string) ([]domain.Notification, int, error) {
	where := []string{"1=1"}
	args := make([]any, 0)

	if q.Status != nil {
		args = append(args, *q.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	if q.Channel != nil {
		args = append(args, *q.Channel)
		where = append(where, fmt.Sprintf("channel = $%d", len(args)))
	}
	if q.Category != nil {
		args = append(args, *q.Category)
		where = append(where, fmt.Sprintf("category = $%d", len(args)))
	}
	if q.EventType != nil {
		args = append(args, *q.EventType)
		where = append(where, fmt.Sprintf("event_type = $%d", len(args)))
	}

	if forcedRecipientID != nil {
		args = append(args, *forcedRecipientID)
		where = append(where, fmt.Sprintf("recipient_id = $%d", len(args)))
	} else if q.RecipientID != nil {
		args = append(args, *q.RecipientID)
		where = append(where, fmt.Sprintf("recipient_id = $%d", len(args)))
	}

	if q.Search != nil {
		args = append(args, "%"+*q.Search+"%")
		where = append(where, fmt.Sprintf("(subject ILIKE $%d OR content ILIKE $%d)", len(args), len(args)))
	}

	whereSQL := strings.Join(where, " AND ")
	countQuery := "SELECT COUNT(*) FROM notifications WHERE " + whereSQL
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	sortCol := "created_at"
	switch q.SortBy {
	case domain.SortBySentAt:
		sortCol = "sent_at"
	case domain.SortByStatus:
		sortCol = "status"
	}
	order := "DESC"
	if strings.ToUpper(q.SortOrder) == "ASC" {
		order = "ASC"
	}

	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	dataQuery := `SELECT ` + notificationColumns + `
		FROM notifications
		WHERE ` + whereSQL + `
		ORDER BY ` + sortCol + ` ` + order + `
		OFFSET $` + fmt.Sprint(len(args)-1) + `
		LIMIT $` + fmt.Sprint(len(args))

	rows, err := r.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]domain.Notification, 0)
	for rows.Next() {
		notification, scanErr := scanNotification(rows)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		items = append(items, notification)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return items, total, nil
}

func (r *NotificationRepository) FindDispatchable(ctx context.Context, batchSize int) ([]domain.Notification, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+notificationColumns+`
		FROM notifications
		WHERE status = $1
		   OR (status = $2 AND next_retry_at <= now())
		ORDER BY created_at ASC
		LIMIT $3
	`, domain.NotificationStatusPending, domain.NotificationStatusFailed, batchSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.Notification, 0)
	for rows.Next() {
		notification, scanErr := scanNotification(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, notification)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func (r *NotificationRepository) SaveAttempt(ctx context.Context, tx pgx.Tx, input CreateAttemptInput) error {
	metadata, err := toJSONB(input.Metadata)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO notification_attempts (
			notification_id, provider, status, response_message, error_code, metadata
		) VALUES ($1,$2,$3,$4,$5,$6)
	`, input.NotificationID, input.Provider, input.Status, input.ResponseMessage, input.ErrorCode, metadata)
	return err
}

func (r *NotificationRepository) MarkSent(ctx context.Context, tx pgx.Tx, id string) error {
	_, err := tx.Exec(ctx, `
		UPDATE notifications
		SET status = $2, sent_at = now(), next_retry_at = null, updated_at = now()
		WHERE id = $1
	`, id, domain.NotificationStatusSent)
	return err
}

func (r *NotificationRepository) MarkFailed(ctx context.Context, tx pgx.Tx, id string, retryCount int, nextRetryAt *time.Time) error {
	_, err := tx.Exec(ctx, `
		UPDATE notifications
		SET status = $2, retry_count = $3, next_retry_at = $4, updated_at = now()
		WHERE id = $1
	`, id, domain.NotificationStatusFailed, retryCount, nextRetryAt)
	return err
}

func scanNotification(row interface {
	Scan(dest ...any) error
}) (domain.Notification, error) {
	var n domain.Notification
	var eventType *string
	var subject *string
	var payloadBytes []byte
	var nextRetryAt *time.Time
	var sentAt *time.Time
	var readAt *time.Time

	err := row.Scan(
		&n.ID,
		&n.RecipientID,
		&n.Channel,
		&n.Category,
		&eventType,
		&subject,
		&n.Content,
		&payloadBytes,
		&n.Status,
		&n.RetryCount,
		&nextRetryAt,
		&sentAt,
		&readAt,
		&n.CreatedAt,
		&n.UpdatedAt,
	)
	if err != nil {
		return domain.Notification{}, err
	}

	n.EventType = eventType
	n.Subject = subject
	n.NextRetryAt = nextRetryAt
	n.SentAt = sentAt
	n.ReadAt = readAt

	if len(payloadBytes) > 0 {
		if err := json.Unmarshal(payloadBytes, &n.Payload); err != nil {
			return domain.Notification{}, err
		}
	}

	return n, nil
}

func toJSONB(value any) ([]byte, error) {
	if value == nil {
		return nil, nil
	}
	return json.Marshal(value)
}
