package domain

import "time"

type UserRole string

type UserStatus string

type UserGender string

const (
	UserRoleBuyer  UserRole = "buyer"
	UserRoleSeller UserRole = "seller"
	UserRoleAdmin  UserRole = "admin"
)

const (
	UserStatusActive    UserStatus = "active"
	UserStatusPending   UserStatus = "pending"
	UserStatusSuspended UserStatus = "suspended"
	UserStatusDeleted   UserStatus = "deleted"
)

const (
	UserGenderMale        UserGender = "male"
	UserGenderFemale      UserGender = "female"
	UserGenderOther       UserGender = "other"
	UserGenderUnspecified UserGender = "unspecified"
)

type User struct {
	ID            string     `json:"id"`
	Email         string     `json:"email"`
	FirstName     string     `json:"firstName"`
	LastName      string     `json:"lastName"`
	Phone         *string    `json:"phone"`
	Address       *string    `json:"address"`
	Gender        UserGender `json:"gender"`
	DateOfBirth   *string    `json:"dateOfBirth"`
	AvatarURL     *string    `json:"avatarUrl"`
	Role          UserRole   `json:"role"`
	Status        UserStatus `json:"status"`
	EmailVerified bool       `json:"emailVerified"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

type ListUsersQuery struct {
	Page      int
	PageSize  int
	Search    string
	Role      *UserRole
	Status    *UserStatus
	SortBy    string
	SortOrder string
}

type Pagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	TotalItems int `json:"totalItems"`
	TotalPages int `json:"totalPages"`
}

func IsValidRole(role UserRole) bool {
	switch role {
	case UserRoleBuyer, UserRoleSeller, UserRoleAdmin:
		return true
	default:
		return false
	}
}

func IsValidStatus(status UserStatus) bool {
	switch status {
	case UserStatusActive, UserStatusPending, UserStatusSuspended, UserStatusDeleted:
		return true
	default:
		return false
	}
}

func IsValidGender(gender UserGender) bool {
	switch gender {
	case UserGenderMale, UserGenderFemale, UserGenderOther, UserGenderUnspecified:
		return true
	default:
		return false
	}
}
