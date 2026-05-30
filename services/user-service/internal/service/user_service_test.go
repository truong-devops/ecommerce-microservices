package service

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"user-service-go/internal/domain"
	"user-service-go/internal/httpx"
)

func TestNormalizeCreateDefaultsAndTrimsInput(t *testing.T) {
	svc := NewUserService(nil, nil)
	phone := " +84901234567 "
	dob := " 1995-04-12 "

	input, err := svc.normalizeCreate(CreateUserRequest{
		Email:       "  Buyer@example.COM ",
		FirstName:   "  Van ",
		LastName:    " Truong  ",
		Phone:       &phone,
		DateOfBirth: &dob,
	})
	if err != nil {
		t.Fatalf("normalizeCreate returned error: %v", err)
	}

	if input.Email != "buyer@example.com" {
		t.Fatalf("email was not normalized: %q", input.Email)
	}
	if input.FirstName != "Van" || input.LastName != "Truong" {
		t.Fatalf("names were not trimmed: first=%q last=%q", input.FirstName, input.LastName)
	}
	if input.Phone == nil || *input.Phone != "+84901234567" {
		t.Fatalf("phone was not normalized: %#v", input.Phone)
	}
	if input.DateOfBirth == nil || *input.DateOfBirth != "1995-04-12" {
		t.Fatalf("dateOfBirth was not normalized: %#v", input.DateOfBirth)
	}
	if input.Role != domain.UserRoleBuyer {
		t.Fatalf("default role = %q, want %q", input.Role, domain.UserRoleBuyer)
	}
	if input.Status != domain.UserStatusPending {
		t.Fatalf("default status = %q, want %q", input.Status, domain.UserStatusPending)
	}
	if input.Gender != domain.UserGenderUnspecified {
		t.Fatalf("default gender = %q, want %q", input.Gender, domain.UserGenderUnspecified)
	}
	if input.EmailVerified {
		t.Fatal("emailVerified default should be false")
	}
}

func TestNormalizeCreateRejectsInvalidFields(t *testing.T) {
	svc := NewUserService(nil, nil)
	invalidPhone := "123"
	invalidDate := "2026-99-99"
	invalidRole := domain.UserRole("root")
	invalidStatus := domain.UserStatus("blocked")
	invalidGender := domain.UserGender("robot")

	tests := []struct {
		name string
		req  CreateUserRequest
	}{
		{
			name: "missing email",
			req: CreateUserRequest{
				FirstName: "Van",
				LastName:  "Truong",
			},
		},
		{
			name: "invalid phone",
			req: CreateUserRequest{
				Email:     "user@example.com",
				FirstName: "Van",
				LastName:  "Truong",
				Phone:     &invalidPhone,
			},
		},
		{
			name: "invalid date",
			req: CreateUserRequest{
				Email:       "user@example.com",
				FirstName:   "Van",
				LastName:    "Truong",
				DateOfBirth: &invalidDate,
			},
		},
		{
			name: "invalid role",
			req: CreateUserRequest{
				Email:     "user@example.com",
				FirstName: "Van",
				LastName:  "Truong",
				Role:      &invalidRole,
			},
		},
		{
			name: "invalid status",
			req: CreateUserRequest{
				Email:     "user@example.com",
				FirstName: "Van",
				LastName:  "Truong",
				Status:    &invalidStatus,
			},
		},
		{
			name: "invalid gender",
			req: CreateUserRequest{
				Email:     "user@example.com",
				FirstName: "Van",
				LastName:  "Truong",
				Gender:    &invalidGender,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.normalizeCreate(tt.req)
			assertAppError(t, err, http.StatusBadRequest, domain.ErrorCodeValidationError)
		})
	}
}

func TestNormalizeUpdateSupportsNullableFields(t *testing.T) {
	svc := NewUserService(nil, nil)
	email := " NEW@example.COM "
	avatar := " https://cdn.example.com/avatar.png "

	var dob OptionalNullableString
	if err := json.Unmarshal([]byte("null"), &dob); err != nil {
		t.Fatalf("unmarshal nullable dateOfBirth: %v", err)
	}

	input, err := svc.normalizeUpdate(UpdateUserRequest{
		Email:       &email,
		DateOfBirth: dob,
		AvatarURL: OptionalNullableString{
			Set:   true,
			Value: avatar,
		},
	})
	if err != nil {
		t.Fatalf("normalizeUpdate returned error: %v", err)
	}

	if input.Email == nil || *input.Email != "new@example.com" {
		t.Fatalf("email was not normalized: %#v", input.Email)
	}
	if !input.DateOfBirth.Set || !input.DateOfBirth.Null {
		t.Fatalf("dateOfBirth null was not preserved: %#v", input.DateOfBirth)
	}
	if input.AvatarURL.Value == nil || *input.AvatarURL.Value != "https://cdn.example.com/avatar.png" {
		t.Fatalf("avatarUrl was not trimmed: %#v", input.AvatarURL)
	}
}

func TestResolveSelfHelpers(t *testing.T) {
	first, last := splitNameFromEmail("van.truong+buyer@example.com")
	if first != "Van" || last != "Buyer" {
		t.Fatalf("splitNameFromEmail = %q %q, want Van Buyer", first, last)
	}

	if got := mapTokenRoleToDomainRole(" seller "); got != domain.UserRoleSeller {
		t.Fatalf("seller token role mapped to %q", got)
	}
	if got := mapTokenRoleToDomainRole("support"); got != domain.UserRoleAdmin {
		t.Fatalf("support token role mapped to %q", got)
	}
	if got := mapTokenRoleToDomainRole("unknown"); got != domain.UserRoleBuyer {
		t.Fatalf("unknown token role mapped to %q", got)
	}
}

func assertAppError(t *testing.T, err error, status int, code string) {
	t.Helper()

	var appErr *httpx.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("error = %T %v, want *httpx.AppError", err, err)
	}
	if appErr.Status != status {
		t.Fatalf("status = %d, want %d", appErr.Status, status)
	}
	if appErr.Code != code {
		t.Fatalf("code = %q, want %q", appErr.Code, code)
	}
}
