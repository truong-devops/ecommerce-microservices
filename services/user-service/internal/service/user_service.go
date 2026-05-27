package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"user-service-go/internal/domain"
	"user-service-go/internal/events"
	"user-service-go/internal/httpx"
	"user-service-go/internal/repository"

	"github.com/jackc/pgx/v5/pgconn"
)

var phoneRegex = regexp.MustCompile(`^\+?[1-9]\d{7,14}$`)

type CreateUserRequest struct {
	Email               string             `json:"email"`
	FirstName           string             `json:"firstName"`
	LastName            string             `json:"lastName"`
	Phone               *string            `json:"phone,omitempty"`
	Address             *string            `json:"address,omitempty"`
	AddressProvince     *string            `json:"addressProvince,omitempty"`
	AddressProvinceCode *string            `json:"addressProvinceCode,omitempty"`
	AddressWard         *string            `json:"addressWard,omitempty"`
	AddressWardCode     *string            `json:"addressWardCode,omitempty"`
	Gender              *domain.UserGender `json:"gender,omitempty"`
	DateOfBirth         *string            `json:"dateOfBirth,omitempty"`
	AvatarURL           *string            `json:"avatarUrl,omitempty"`
	Role                *domain.UserRole   `json:"role,omitempty"`
	Status              *domain.UserStatus `json:"status,omitempty"`
	EmailVerified       *bool              `json:"emailVerified,omitempty"`
}

type UpdateUserRequest struct {
	Email               *string                `json:"email,omitempty"`
	FirstName           *string                `json:"firstName,omitempty"`
	LastName            *string                `json:"lastName,omitempty"`
	Phone               *string                `json:"phone,omitempty"`
	Address             *string                `json:"address,omitempty"`
	AddressProvince     *string                `json:"addressProvince,omitempty"`
	AddressProvinceCode *string                `json:"addressProvinceCode,omitempty"`
	AddressWard         *string                `json:"addressWard,omitempty"`
	AddressWardCode     *string                `json:"addressWardCode,omitempty"`
	Gender              *domain.UserGender     `json:"gender,omitempty"`
	DateOfBirth         OptionalNullableString `json:"dateOfBirth,omitempty"`
	AvatarURL           OptionalNullableString `json:"avatarUrl,omitempty"`
	Role                *domain.UserRole       `json:"role,omitempty"`
	Status              *domain.UserStatus     `json:"status,omitempty"`
	EmailVerified       *bool                  `json:"emailVerified,omitempty"`
}

type UpdateUserStatusRequest struct {
	Status domain.UserStatus `json:"status"`
}

type UserService struct {
	repo      *repository.UserRepository
	publisher events.UserEventsPublisher
}

func NewUserService(repo *repository.UserRepository, publisher events.UserEventsPublisher) *UserService {
	return &UserService{repo: repo, publisher: publisher}
}

func (s *UserService) Ping(ctx context.Context) error {
	return s.repo.Ping(ctx)
}

func (s *UserService) Create(ctx context.Context, req CreateUserRequest) (*domain.User, error) {
	normalized, err := s.normalizeCreate(req)
	if err != nil {
		return nil, err
	}

	existing, err := s.repo.FindByEmailAnyStatus(ctx, normalized.Email)
	if err != nil {
		return nil, err
	}
	if existing != nil && existing.Status != domain.UserStatusDeleted {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeUserEmailExists, "User email already exists", nil)
	}

	if existing != nil && existing.Status == domain.UserStatusDeleted {
		revived, reviveErr := s.repo.ReviveDeletedUser(ctx, existing.ID, normalized)
		if reviveErr != nil {
			return nil, reviveErr
		}
		if revived != nil {
			return revived, nil
		}
	}

	created, err := s.repo.Create(ctx, normalized)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeUserEmailExists, "User email already exists", nil)
		}
		return nil, httpx.NewAppError(http.StatusInternalServerError, domain.ErrorCodeUserCreateFailed, "Failed to create user", nil)
	}

	if publishErr := s.publisher.PublishUserRegistered(ctx, events.UserRegisteredEventPayload{
		UserID: created.ID,
		Email:  created.Email,
		Role:   string(created.Role),
	}); publishErr != nil {
		return nil, httpx.NewAppError(http.StatusInternalServerError, domain.ErrorCodeUserCreateFailed, "Failed to create user", nil)
	}

	return created, nil
}

func (s *UserService) List(ctx context.Context, query domain.ListUsersQuery) ([]domain.User, domain.Pagination, error) {
	result, err := s.repo.List(ctx, query)
	if err != nil {
		return nil, domain.Pagination{}, err
	}

	totalPages := 1
	if result.TotalItems > 0 {
		totalPages = (result.TotalItems + query.PageSize - 1) / query.PageSize
	}

	pagination := domain.Pagination{
		Page:       query.Page,
		PageSize:   query.PageSize,
		TotalItems: result.TotalItems,
		TotalPages: totalPages,
	}

	return result.Items, pagination, nil
}

func (s *UserService) FindOne(ctx context.Context, id string) (*domain.User, error) {
	user, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeUserNotFound, "User not found", nil)
	}
	return user, nil
}

func (s *UserService) ListPublicProfiles(ctx context.Context, ids []string) ([]domain.User, error) {
	uniqueIDs := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		normalized := strings.TrimSpace(id)
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		uniqueIDs = append(uniqueIDs, normalized)
		if len(uniqueIDs) >= 100 {
			break
		}
	}

	return s.repo.FindByIDs(ctx, uniqueIDs)
}

func (s *UserService) ResolveSelf(ctx context.Context, subjectID, email, role string) (*domain.User, error) {
	subjectID = strings.TrimSpace(subjectID)
	email = strings.ToLower(strings.TrimSpace(email))
	if subjectID == "" || email == "" {
		return nil, httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
	}

	if byID, err := s.repo.FindByID(ctx, subjectID); err != nil {
		return nil, err
	} else if byID != nil {
		return byID, nil
	}

	if byEmail, err := s.repo.FindByEmailAnyStatus(ctx, email); err != nil {
		return nil, err
	} else if byEmail != nil && byEmail.Status != domain.UserStatusDeleted {
		return byEmail, nil
	}

	firstName, lastName := splitNameFromEmail(email)
	created, err := s.repo.Create(ctx, repository.CreateUserInput{
		Email:               email,
		FirstName:           firstName,
		LastName:            lastName,
		Phone:               nil,
		Address:             nil,
		AddressProvince:     nil,
		AddressProvinceCode: nil,
		AddressWard:         nil,
		AddressWardCode:     nil,
		Gender:              domain.UserGenderUnspecified,
		DateOfBirth:         nil,
		AvatarURL:           nil,
		Role:                mapTokenRoleToDomainRole(role),
		Status:              domain.UserStatusActive,
		EmailVerified:       true,
	})
	if err != nil {
		if isUniqueViolation(err) {
			existing, findErr := s.repo.FindByEmailAnyStatus(ctx, email)
			if findErr != nil {
				return nil, findErr
			}
			if existing != nil && existing.Status != domain.UserStatusDeleted {
				return existing, nil
			}
		}
		return nil, err
	}

	return created, nil
}

func (s *UserService) UpdateSelf(ctx context.Context, subjectID, email, role string, req UpdateUserRequest) (*domain.User, error) {
	self, err := s.ResolveSelf(ctx, subjectID, email, role)
	if err != nil {
		return nil, err
	}
	return s.Update(ctx, self.ID, req)
}

func (s *UserService) Update(ctx context.Context, id string, req UpdateUserRequest) (*domain.User, error) {
	_, err := s.FindOne(ctx, id)
	if err != nil {
		return nil, err
	}

	normalized, err := s.normalizeUpdate(req)
	if err != nil {
		return nil, err
	}

	if normalized.Email != nil {
		existing, findErr := s.repo.FindByEmailAnyStatus(ctx, *normalized.Email)
		if findErr != nil {
			return nil, findErr
		}
		if existing != nil && existing.ID != id && existing.Status != domain.UserStatusDeleted {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeUserEmailExists, "User email already exists", nil)
		}
	}

	updated, err := s.repo.Update(ctx, id, normalized)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeUserEmailExists, "User email already exists", nil)
		}
		return nil, err
	}
	if updated == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeUserNotFound, "User not found", nil)
	}
	return updated, nil
}

func (s *UserService) UpdateStatus(ctx context.Context, id string, req UpdateUserStatusRequest) (*domain.User, error) {
	if !domain.IsValidStatus(req.Status) {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"status": "invalid status"})
	}

	_, err := s.FindOne(ctx, id)
	if err != nil {
		return nil, err
	}

	updated, err := s.repo.UpdateStatus(ctx, id, req.Status)
	if err != nil {
		return nil, err
	}
	if updated == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeUserNotFound, "User not found", nil)
	}
	return updated, nil
}

func (s *UserService) Remove(ctx context.Context, id string) (*domain.User, error) {
	deleted, err := s.repo.SoftDelete(ctx, id)
	if err != nil {
		return nil, err
	}
	if deleted == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeUserNotFound, "User not found", nil)
	}
	return deleted, nil
}

func (s *UserService) normalizeCreate(req CreateUserRequest) (repository.CreateUserInput, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if err := validateEmail(email); err != nil {
		return repository.CreateUserInput{}, err
	}

	firstName, err := validateTrimmedString(req.FirstName, "firstName", 1, 100)
	if err != nil {
		return repository.CreateUserInput{}, err
	}
	lastName, err := validateTrimmedString(req.LastName, "lastName", 1, 100)
	if err != nil {
		return repository.CreateUserInput{}, err
	}

	phone, err := validateOptionalPhone(req.Phone)
	if err != nil {
		return repository.CreateUserInput{}, err
	}
	address, err := validateOptionalTrimmed(req.Address, "address", 255)
	if err != nil {
		return repository.CreateUserInput{}, err
	}
	addressProvince, err := validateOptionalTrimmed(req.AddressProvince, "addressProvince", 128)
	if err != nil {
		return repository.CreateUserInput{}, err
	}
	addressProvinceCode, err := validateOptionalTrimmed(req.AddressProvinceCode, "addressProvinceCode", 32)
	if err != nil {
		return repository.CreateUserInput{}, err
	}
	addressWard, err := validateOptionalTrimmed(req.AddressWard, "addressWard", 128)
	if err != nil {
		return repository.CreateUserInput{}, err
	}
	addressWardCode, err := validateOptionalTrimmed(req.AddressWardCode, "addressWardCode", 32)
	if err != nil {
		return repository.CreateUserInput{}, err
	}
	avatarURL, err := validateOptionalTrimmed(req.AvatarURL, "avatarUrl", 500)
	if err != nil {
		return repository.CreateUserInput{}, err
	}
	dob, err := validateOptionalDate(req.DateOfBirth)
	if err != nil {
		return repository.CreateUserInput{}, err
	}

	gender := domain.UserGenderUnspecified
	if req.Gender != nil {
		if !domain.IsValidGender(*req.Gender) {
			return repository.CreateUserInput{}, validationError("gender", "invalid gender")
		}
		gender = *req.Gender
	}

	role := domain.UserRoleBuyer
	if req.Role != nil {
		if !domain.IsValidRole(*req.Role) {
			return repository.CreateUserInput{}, validationError("role", "invalid role")
		}
		role = *req.Role
	}

	status := domain.UserStatusPending
	if req.Status != nil {
		if !domain.IsValidStatus(*req.Status) {
			return repository.CreateUserInput{}, validationError("status", "invalid status")
		}
		status = *req.Status
	}

	emailVerified := false
	if req.EmailVerified != nil {
		emailVerified = *req.EmailVerified
	}

	return repository.CreateUserInput{
		Email:               email,
		FirstName:           firstName,
		LastName:            lastName,
		Phone:               phone,
		Address:             address,
		AddressProvince:     addressProvince,
		AddressProvinceCode: addressProvinceCode,
		AddressWard:         addressWard,
		AddressWardCode:     addressWardCode,
		Gender:              gender,
		DateOfBirth:         dob,
		AvatarURL:           avatarURL,
		Role:                role,
		Status:              status,
		EmailVerified:       emailVerified,
	}, nil
}

func (s *UserService) normalizeUpdate(req UpdateUserRequest) (repository.UpdateUserInput, error) {
	out := repository.UpdateUserInput{}
	if req.Email != nil {
		email := strings.ToLower(strings.TrimSpace(*req.Email))
		if err := validateEmail(email); err != nil {
			return out, err
		}
		out.Email = &email
	}
	if req.FirstName != nil {
		v, err := validateTrimmedString(*req.FirstName, "firstName", 1, 100)
		if err != nil {
			return out, err
		}
		out.FirstName = &v
	}
	if req.LastName != nil {
		v, err := validateTrimmedString(*req.LastName, "lastName", 1, 100)
		if err != nil {
			return out, err
		}
		out.LastName = &v
	}
	if req.Phone != nil {
		v, err := validateOptionalPhone(req.Phone)
		if err != nil {
			return out, err
		}
		out.Phone = v
	}
	if req.Address != nil {
		v, err := validateOptionalTrimmed(req.Address, "address", 255)
		if err != nil {
			return out, err
		}
		out.Address = v
	}
	if req.AddressProvince != nil {
		v, err := validateOptionalTrimmed(req.AddressProvince, "addressProvince", 128)
		if err != nil {
			return out, err
		}
		out.AddressProvince = v
	}
	if req.AddressProvinceCode != nil {
		v, err := validateOptionalTrimmed(req.AddressProvinceCode, "addressProvinceCode", 32)
		if err != nil {
			return out, err
		}
		out.AddressProvinceCode = v
	}
	if req.AddressWard != nil {
		v, err := validateOptionalTrimmed(req.AddressWard, "addressWard", 128)
		if err != nil {
			return out, err
		}
		out.AddressWard = v
	}
	if req.AddressWardCode != nil {
		v, err := validateOptionalTrimmed(req.AddressWardCode, "addressWardCode", 32)
		if err != nil {
			return out, err
		}
		out.AddressWardCode = v
	}
	if req.Gender != nil {
		if !domain.IsValidGender(*req.Gender) {
			return out, validationError("gender", "invalid gender")
		}
		out.Gender = req.Gender
	}
	if req.DateOfBirth.Set {
		if req.DateOfBirth.Null {
			out.DateOfBirth = repository.OptionalNullableString{
				Set:  true,
				Null: true,
			}
		} else {
			v, err := validateOptionalDate(&req.DateOfBirth.Value)
			if err != nil {
				return out, err
			}
			out.DateOfBirth = repository.OptionalNullableString{
				Set:   true,
				Value: v,
			}
		}
	}
	if req.AvatarURL.Set {
		if req.AvatarURL.Null {
			out.AvatarURL = repository.OptionalNullableString{
				Set:  true,
				Null: true,
			}
		} else {
			v, err := validateOptionalTrimmed(&req.AvatarURL.Value, "avatarUrl", 500)
			if err != nil {
				return out, err
			}
			out.AvatarURL = repository.OptionalNullableString{
				Set:   true,
				Value: v,
			}
		}
	}
	if req.Role != nil {
		if !domain.IsValidRole(*req.Role) {
			return out, validationError("role", "invalid role")
		}
		out.Role = req.Role
	}
	if req.Status != nil {
		if !domain.IsValidStatus(*req.Status) {
			return out, validationError("status", "invalid status")
		}
		out.Status = req.Status
	}
	if req.EmailVerified != nil {
		out.EmailVerified = req.EmailVerified
	}

	return out, nil
}

func validateEmail(email string) error {
	if email == "" {
		return validationError("email", "email is required")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return validationError("email", "email must be a valid email")
	}
	return nil
}

func validateTrimmedString(value, field string, minLen, maxLen int) (string, error) {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < minLen || len(trimmed) > maxLen {
		return "", validationError(field, "invalid length")
	}
	return trimmed, nil
}

func validateOptionalTrimmed(value *string, field string, maxLen int) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if len(trimmed) > maxLen {
		return nil, validationError(field, "invalid length")
	}
	return &trimmed, nil
}

func validateOptionalPhone(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, validationError("phone", "invalid phone")
	}
	if !phoneRegex.MatchString(trimmed) {
		return nil, validationError("phone", "invalid phone")
	}
	return &trimmed, nil
}

func validateOptionalDate(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, validationError("dateOfBirth", "invalid date")
	}
	t, err := time.Parse("2006-01-02", trimmed)
	if err != nil || t.Format("2006-01-02") != trimmed {
		return nil, validationError("dateOfBirth", "invalid date")
	}
	return &trimmed, nil
}

func validationError(field, reason string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{field: reason})
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "SQLSTATE 23505")
}

type OptionalNullableString struct {
	Set   bool
	Null  bool
	Value string
}

func (o *OptionalNullableString) UnmarshalJSON(data []byte) error {
	o.Set = true
	if string(data) == "null" {
		o.Null = true
		o.Value = ""
		return nil
	}
	o.Null = false
	return json.Unmarshal(data, &o.Value)
}

func splitNameFromEmail(email string) (string, string) {
	base := strings.TrimSpace(strings.Split(email, "@")[0])
	if base == "" {
		return "Buyer", "User"
	}

	parts := strings.FieldsFunc(base, func(r rune) bool {
		return r == '.' || r == '_' || r == '-' || r == '+'
	})
	if len(parts) == 0 {
		return "Buyer", "User"
	}

	first := strings.TrimSpace(parts[0])
	last := first
	if len(parts) > 1 {
		last = strings.TrimSpace(parts[len(parts)-1])
	}

	first = capitalizeFirst(strings.ToLower(first))
	last = capitalizeFirst(strings.ToLower(last))
	if first == "" {
		first = "Buyer"
	}
	if last == "" {
		last = "User"
	}

	if len(first) > 100 {
		first = first[:100]
	}
	if len(last) > 100 {
		last = last[:100]
	}
	return first, last
}

func mapTokenRoleToDomainRole(role string) domain.UserRole {
	switch strings.ToUpper(strings.TrimSpace(role)) {
	case "SELLER":
		return domain.UserRoleSeller
	case "ADMIN", "SUPER_ADMIN", "SUPPORT":
		return domain.UserRoleAdmin
	default:
		return domain.UserRoleBuyer
	}
}

func capitalizeFirst(value string) string {
	if value == "" {
		return value
	}
	return strings.ToUpper(value[:1]) + value[1:]
}
