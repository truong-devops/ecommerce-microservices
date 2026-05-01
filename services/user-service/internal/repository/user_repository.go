package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"user-service-go/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const userColumns = `
	id, email, first_name, last_name, phone, address,
	gender, date_of_birth, avatar_url, role, status,
	email_verified, created_at, updated_at
`

type UserRepository struct {
	pool *pgxpool.Pool
}

type CreateUserInput struct {
	Email         string
	FirstName     string
	LastName      string
	Phone         *string
	Address       *string
	Gender        domain.UserGender
	DateOfBirth   *string
	AvatarURL     *string
	Role          domain.UserRole
	Status        domain.UserStatus
	EmailVerified bool
}

type UpdateUserInput struct {
	Email         *string
	FirstName     *string
	LastName      *string
	Phone         *string
	Address       *string
	Gender        *domain.UserGender
	DateOfBirth   OptionalNullableString
	AvatarURL     OptionalNullableString
	Role          *domain.UserRole
	Status        *domain.UserStatus
	EmailVerified *bool
}

type OptionalNullableString struct {
	Set   bool
	Null  bool
	Value *string
}

type ListUsersResult struct {
	Items      []domain.User
	TotalItems int
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

func (r *UserRepository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	query := `SELECT ` + userColumns + ` FROM users WHERE id = $1 AND status != $2 LIMIT 1`
	row := r.pool.QueryRow(ctx, query, id, domain.UserStatusDeleted)
	user, err := scanUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) FindByEmailAnyStatus(ctx context.Context, email string) (*domain.User, error) {
	query := `SELECT ` + userColumns + ` FROM users WHERE lower(email) = lower($1) LIMIT 1`
	row := r.pool.QueryRow(ctx, query, email)
	user, err := scanUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) Create(ctx context.Context, input CreateUserInput) (*domain.User, error) {
	query := `
		INSERT INTO users (
			email, first_name, last_name, phone, address, gender,
			date_of_birth, avatar_url, role, status, email_verified
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING ` + userColumns

	row := r.pool.QueryRow(
		ctx,
		query,
		input.Email,
		input.FirstName,
		input.LastName,
		input.Phone,
		input.Address,
		input.Gender,
		input.DateOfBirth,
		input.AvatarURL,
		input.Role,
		input.Status,
		input.EmailVerified,
	)

	user, err := scanUser(row)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) ReviveDeletedUser(ctx context.Context, id string, input CreateUserInput) (*domain.User, error) {
	query := `
		UPDATE users
		SET
			email = $2,
			first_name = $3,
			last_name = $4,
			phone = $5,
			address = $6,
			gender = $7,
			date_of_birth = $8,
			avatar_url = $9,
			role = $10,
			status = $11,
			email_verified = $12,
			deleted_at = NULL,
			updated_at = now()
		WHERE id = $1 AND status = $13
		RETURNING ` + userColumns

	row := r.pool.QueryRow(
		ctx,
		query,
		id,
		input.Email,
		input.FirstName,
		input.LastName,
		input.Phone,
		input.Address,
		input.Gender,
		input.DateOfBirth,
		input.AvatarURL,
		input.Role,
		domain.UserStatusActive,
		input.EmailVerified,
		domain.UserStatusDeleted,
	)

	user, err := scanUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) List(ctx context.Context, query domain.ListUsersQuery) (ListUsersResult, error) {
	where := []string{}
	args := make([]any, 0)

	if query.Status != nil {
		args = append(args, *query.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	} else {
		args = append(args, domain.UserStatusDeleted)
		where = append(where, fmt.Sprintf("status != $%d", len(args)))
	}

	if query.Role != nil {
		args = append(args, *query.Role)
		where = append(where, fmt.Sprintf("role = $%d", len(args)))
	}

	if query.Search != "" {
		args = append(args, "%"+query.Search+"%")
		where = append(
			where,
			fmt.Sprintf("(email ILIKE $%d OR first_name ILIKE $%d OR last_name ILIKE $%d)", len(args), len(args), len(args)),
		)
	}

	whereSQL := ""
	if len(where) > 0 {
		whereSQL = " WHERE " + strings.Join(where, " AND ")
	}

	countQuery := `SELECT COUNT(*) FROM users` + whereSQL
	var totalItems int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&totalItems); err != nil {
		return ListUsersResult{}, err
	}

	sortCol := resolveSortColumn(query.SortBy)
	order := strings.ToUpper(query.SortOrder)
	if order != "ASC" {
		order = "DESC"
	}

	dataQuery := `SELECT ` + userColumns + ` FROM users` + whereSQL + ` ORDER BY ` + sortCol + ` ` + order + ` LIMIT $` + fmt.Sprint(len(args)+1) + ` OFFSET $` + fmt.Sprint(len(args)+2)
	args = append(args, query.PageSize, (query.Page-1)*query.PageSize)

	rows, err := r.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return ListUsersResult{}, err
	}
	defer rows.Close()

	items := make([]domain.User, 0)
	for rows.Next() {
		user, scanErr := scanUser(rows)
		if scanErr != nil {
			return ListUsersResult{}, scanErr
		}
		items = append(items, user)
	}
	if err := rows.Err(); err != nil {
		return ListUsersResult{}, err
	}

	return ListUsersResult{Items: items, TotalItems: totalItems}, nil
}

func (r *UserRepository) Update(ctx context.Context, id string, input UpdateUserInput) (*domain.User, error) {
	setParts := make([]string, 0)
	args := []any{id}

	appendSet := func(column string, value any) {
		args = append(args, value)
		setParts = append(setParts, fmt.Sprintf("%s = $%d", column, len(args)))
	}

	if input.Email != nil {
		appendSet("email", *input.Email)
	}
	if input.FirstName != nil {
		appendSet("first_name", *input.FirstName)
	}
	if input.LastName != nil {
		appendSet("last_name", *input.LastName)
	}
	if input.Phone != nil {
		appendSet("phone", *input.Phone)
	}
	if input.Address != nil {
		appendSet("address", *input.Address)
	}
	if input.Gender != nil {
		appendSet("gender", *input.Gender)
	}
	if input.DateOfBirth.Set {
		if input.DateOfBirth.Null {
			appendSet("date_of_birth", nil)
		} else if input.DateOfBirth.Value != nil {
			appendSet("date_of_birth", *input.DateOfBirth.Value)
		}
	}
	if input.AvatarURL.Set {
		if input.AvatarURL.Null {
			appendSet("avatar_url", nil)
		} else if input.AvatarURL.Value != nil {
			appendSet("avatar_url", *input.AvatarURL.Value)
		}
	}
	if input.Role != nil {
		appendSet("role", *input.Role)
	}
	if input.Status != nil {
		appendSet("status", *input.Status)
	}
	if input.EmailVerified != nil {
		appendSet("email_verified", *input.EmailVerified)
	}

	if len(setParts) == 0 {
		return r.FindByID(ctx, id)
	}

	setParts = append(setParts, "updated_at = now()")
	args = append(args, domain.UserStatusDeleted)

	query := `
		UPDATE users
		SET ` + strings.Join(setParts, ", ") + `
		WHERE id = $1 AND status != $` + fmt.Sprint(len(args)) + `
		RETURNING ` + userColumns

	row := r.pool.QueryRow(ctx, query, args...)
	user, err := scanUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) UpdateStatus(ctx context.Context, id string, status domain.UserStatus) (*domain.User, error) {
	query := `
		UPDATE users
		SET status = $2, updated_at = now()
		WHERE id = $1 AND status != $3
		RETURNING ` + userColumns

	row := r.pool.QueryRow(ctx, query, id, status, domain.UserStatusDeleted)
	user, err := scanUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) SoftDelete(ctx context.Context, id string) (*domain.User, error) {
	query := `
		UPDATE users
		SET status = $2, deleted_at = now(), updated_at = now()
		WHERE id = $1 AND status != $2
		RETURNING ` + userColumns

	row := r.pool.QueryRow(ctx, query, id, domain.UserStatusDeleted)
	user, err := scanUser(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func resolveSortColumn(sortBy string) string {
	switch sortBy {
	case "updatedAt":
		return "updated_at"
	case "email":
		return "email"
	case "firstName":
		return "first_name"
	case "lastName":
		return "last_name"
	default:
		return "created_at"
	}
}

type scannable interface {
	Scan(dest ...any) error
}

func scanUser(row scannable) (domain.User, error) {
	var (
		user      domain.User
		phone     sql.NullString
		address   sql.NullString
		dob       sql.NullTime
		avatarURL sql.NullString
		createdAt time.Time
		updatedAt time.Time
	)

	err := row.Scan(
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&phone,
		&address,
		&user.Gender,
		&dob,
		&avatarURL,
		&user.Role,
		&user.Status,
		&user.EmailVerified,
		&createdAt,
		&updatedAt,
	)
	if err != nil {
		return domain.User{}, err
	}

	user.CreatedAt = createdAt.UTC()
	user.UpdatedAt = updatedAt.UTC()
	if phone.Valid {
		v := phone.String
		user.Phone = &v
	}
	if address.Valid {
		v := address.String
		user.Address = &v
	}
	if dob.Valid {
		v := dob.Time.UTC().Format("2006-01-02")
		user.DateOfBirth = &v
	}
	if avatarURL.Valid {
		v := avatarURL.String
		user.AvatarURL = &v
	}

	return user, nil
}
