package domain

import "time"

type Role string

const (
	RoleCustomer   Role = "CUSTOMER"
	RoleAdmin      Role = "ADMIN"
	RoleSupport    Role = "SUPPORT"
	RoleWarehouse  Role = "WAREHOUSE"
	RoleSeller     Role = "SELLER"
	RoleSuperAdmin Role = "SUPER_ADMIN"
)

var ManageNotificationRoles = map[Role]struct{}{
	RoleAdmin:      {},
	RoleSupport:    {},
	RoleSuperAdmin: {},
}

type NotificationStatus string

type NotificationChannel string

type NotificationCategory string

const (
	NotificationStatusPending   NotificationStatus = "PENDING"
	NotificationStatusSent      NotificationStatus = "SENT"
	NotificationStatusFailed    NotificationStatus = "FAILED"
	NotificationStatusCancelled NotificationStatus = "CANCELLED"
)

const (
	NotificationChannelEmail NotificationChannel = "EMAIL"
	NotificationChannelSMS   NotificationChannel = "SMS"
	NotificationChannelPush  NotificationChannel = "PUSH"
	NotificationChannelInApp NotificationChannel = "IN_APP"
)

const (
	NotificationCategoryAuth     NotificationCategory = "AUTH"
	NotificationCategoryOrder    NotificationCategory = "ORDER"
	NotificationCategoryShipping NotificationCategory = "SHIPPING"
	NotificationCategoryCampaign NotificationCategory = "CAMPAIGN"
	NotificationCategorySystem   NotificationCategory = "SYSTEM"
)

type UserContext struct {
	UserID       string
	Email        string
	Role         Role
	SessionID    string
	JTI          string
	TokenVersion int
}

type Notification struct {
	ID          string
	RecipientID string
	Channel     NotificationChannel
	Category    NotificationCategory
	EventType   *string
	Subject     *string
	Content     string
	Payload     map[string]any
	Status      NotificationStatus
	RetryCount  int
	NextRetryAt *time.Time
	SentAt      *time.Time
	ReadAt      *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type NotificationListQuery struct {
	Page        int
	PageSize    int
	Status      *NotificationStatus
	Channel     *NotificationChannel
	Category    *NotificationCategory
	RecipientID *string
	EventType   *string
	Search      *string
	SortBy      string
	SortOrder   string
}

type Pagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	TotalItems int `json:"totalItems"`
	TotalPages int `json:"totalPages"`
}

const (
	SortByCreatedAt = "createdAt"
	SortBySentAt    = "sentAt"
	SortByStatus    = "status"
)

func IsReadableRole(role Role) bool {
	switch role {
	case RoleCustomer, RoleAdmin, RoleSupport, RoleWarehouse, RoleSeller, RoleSuperAdmin:
		return true
	default:
		return false
	}
}

func IsValidRole(role Role) bool {
	return IsReadableRole(role)
}

func IsValidStatus(status NotificationStatus) bool {
	switch status {
	case NotificationStatusPending, NotificationStatusSent, NotificationStatusFailed, NotificationStatusCancelled:
		return true
	default:
		return false
	}
}

func IsValidChannel(channel NotificationChannel) bool {
	switch channel {
	case NotificationChannelEmail, NotificationChannelSMS, NotificationChannelPush, NotificationChannelInApp:
		return true
	default:
		return false
	}
}

func IsValidCategory(category NotificationCategory) bool {
	switch category {
	case NotificationCategoryAuth, NotificationCategoryOrder, NotificationCategoryShipping, NotificationCategoryCampaign, NotificationCategorySystem:
		return true
	default:
		return false
	}
}
