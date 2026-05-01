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

type OrderStatus string

const (
	OrderStatusPending    OrderStatus = "PENDING"
	OrderStatusConfirmed  OrderStatus = "CONFIRMED"
	OrderStatusProcessing OrderStatus = "PROCESSING"
	OrderStatusShipped    OrderStatus = "SHIPPED"
	OrderStatusDelivered  OrderStatus = "DELIVERED"
	OrderStatusCancelled  OrderStatus = "CANCELLED"
	OrderStatusFailed     OrderStatus = "FAILED"
)

var OrderStatusTransitions = map[OrderStatus]map[OrderStatus]struct{}{
	OrderStatusPending: {
		OrderStatusConfirmed: {},
		OrderStatusCancelled: {},
		OrderStatusFailed:    {},
	},
	OrderStatusConfirmed: {
		OrderStatusProcessing: {},
		OrderStatusCancelled:  {},
		OrderStatusFailed:     {},
	},
	OrderStatusProcessing: {
		OrderStatusShipped: {},
		OrderStatusFailed:  {},
	},
	OrderStatusShipped: {
		OrderStatusDelivered: {},
		OrderStatusFailed:    {},
	},
	OrderStatusDelivered: {},
	OrderStatusCancelled: {},
	OrderStatusFailed:    {},
}

func IsValidRole(role Role) bool {
	switch role {
	case RoleBuyer, RoleCustomer, RoleSeller, RoleAdmin, RoleModerator, RoleSupport, RoleWarehouse, RoleSuperAdmin, RoleService:
		return true
	default:
		return false
	}
}

func IsValidOrderStatus(status OrderStatus) bool {
	switch status {
	case OrderStatusPending, OrderStatusConfirmed, OrderStatusProcessing, OrderStatusShipped, OrderStatusDelivered, OrderStatusCancelled, OrderStatusFailed:
		return true
	default:
		return false
	}
}

type Order struct {
	ID             string
	OrderNumber    string
	UserID         string
	Status         OrderStatus
	Currency       string
	SubtotalAmount float64
	ShippingAmount float64
	DiscountAmount float64
	TotalAmount    float64
	Note           *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Items          []OrderItem
}

type OrderItem struct {
	ID                  string
	OrderID             string
	ProductID           string
	SKU                 string
	ProductNameSnapshot string
	Quantity            int
	UnitPrice           float64
	TotalPrice          float64
}

type OrderStatusHistory struct {
	ID            string
	OrderID       string
	FromStatus    *OrderStatus
	ToStatus      OrderStatus
	ChangedBy     string
	ChangedByRole Role
	Reason        *string
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
