package domain

import "time"

type Role string

const (
	RoleBuyer      Role = "BUYER"
	RoleCustomer   Role = "CUSTOMER"
	RoleSeller     Role = "SELLER"
	RoleAdmin      Role = "ADMIN"
	RoleModerator  Role = "MODERATOR"
	RoleSupport    Role = "SUPPORT"
	RoleWarehouse  Role = "WAREHOUSE"
	RoleSuperAdmin Role = "SUPER_ADMIN"
	RoleService    Role = "SERVICE"
)

var StaffRoles = map[Role]struct{}{
	RoleAdmin:      {},
	RoleSupport:    {},
	RoleWarehouse:  {},
	RoleSeller:     {},
	RoleSuperAdmin: {},
}

var ReadableRoles = map[Role]struct{}{
	RoleCustomer:   {},
	RoleAdmin:      {},
	RoleSupport:    {},
	RoleWarehouse:  {},
	RoleSeller:     {},
	RoleSuperAdmin: {},
}

type UserContext struct {
	UserID       string
	Email        string
	Role         Role
	SessionID    string
	JTI          string
	TokenVersion int
}

func IsValidRole(role Role) bool {
	switch role {
	case RoleBuyer, RoleCustomer, RoleSeller, RoleAdmin, RoleModerator, RoleSupport, RoleWarehouse, RoleSuperAdmin, RoleService:
		return true
	default:
		return false
	}
}

type InventoryReservationStatus string

const (
	InventoryReservationStatusActive    InventoryReservationStatus = "ACTIVE"
	InventoryReservationStatusReleased  InventoryReservationStatus = "RELEASED"
	InventoryReservationStatusConfirmed InventoryReservationStatus = "CONFIRMED"
	InventoryReservationStatusExpired   InventoryReservationStatus = "EXPIRED"
)

func IsValidReservationStatus(status InventoryReservationStatus) bool {
	switch status {
	case InventoryReservationStatusActive, InventoryReservationStatusReleased, InventoryReservationStatusConfirmed, InventoryReservationStatusExpired:
		return true
	default:
		return false
	}
}

type InventoryMovementType string

const (
	InventoryMovementTypeAdjust  InventoryMovementType = "ADJUST"
	InventoryMovementTypeReserve InventoryMovementType = "RESERVE"
	InventoryMovementTypeRelease InventoryMovementType = "RELEASE"
	InventoryMovementTypeConfirm InventoryMovementType = "CONFIRM"
	InventoryMovementTypeExpire  InventoryMovementType = "EXPIRE"
)

type InventoryItem struct {
	ID        string
	SKU       string
	ProductID string
	SellerID  string
	OnHand    int
	Reserved  int
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

type InventoryReservation struct {
	ID        string
	OrderID   string
	SKU       string
	Quantity  int
	Status    InventoryReservationStatus
	ExpiresAt time.Time
	RequestID string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type InventoryMovement struct {
	ID            string
	SKU           string
	OrderID       *string
	MovementType  InventoryMovementType
	DeltaOnHand   int
	DeltaReserved int
	Reason        *string
	ActorID       string
	ActorRole     Role
	RequestID     string
	CreatedAt     time.Time
}

type OutboxStatus string

const (
	OutboxStatusPending   OutboxStatus = "PENDING"
	OutboxStatusPublished OutboxStatus = "PUBLISHED"
	OutboxStatusFailed    OutboxStatus = "FAILED"
)

type OutboxEvent struct {
	ID            string
	AggregateType string
	AggregateID   string
	EventType     string
	Payload       map[string]any
	Status        OutboxStatus
	RetryCount    int
	NextRetryAt   *time.Time
	CreatedAt     time.Time
	PublishedAt   *time.Time
}
