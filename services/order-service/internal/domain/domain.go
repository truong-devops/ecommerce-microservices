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

type SagaStatus string

const (
	SagaStatusPending   SagaStatus = "PENDING"
	SagaStatusCompleted SagaStatus = "COMPLETED"
	SagaStatusFailed    SagaStatus = "FAILED"
)

type SagaInventoryStatus string

const (
	SagaInventoryStatusPending   SagaInventoryStatus = "PENDING"
	SagaInventoryStatusReserved  SagaInventoryStatus = "RESERVED"
	SagaInventoryStatusFailed    SagaInventoryStatus = "FAILED"
	SagaInventoryStatusReleased  SagaInventoryStatus = "RELEASED"
	SagaInventoryStatusConfirmed SagaInventoryStatus = "CONFIRMED"
	SagaInventoryStatusExpired   SagaInventoryStatus = "EXPIRED"
)

type SagaPaymentStatus string

const (
	SagaPaymentStatusPending  SagaPaymentStatus = "PENDING"
	SagaPaymentStatusCaptured SagaPaymentStatus = "CAPTURED"
	SagaPaymentStatusFailed   SagaPaymentStatus = "FAILED"
)

type Order struct {
	ID                string
	OrderNumber       string
	UserID            string
	SellerID          string
	Status            OrderStatus
	Currency          string
	SubtotalAmount    float64
	ShippingAmount    float64
	DiscountAmount    float64
	TotalAmount       float64
	Note              *string
	PaymentMethod     string
	RecipientName     string
	RecipientPhone    string
	RecipientAddress  string
	RecipientWard     *string
	RecipientDistrict *string
	RecipientProvince *string
	CreatedAt         time.Time
	UpdatedAt         time.Time
	Items             []OrderItem
}

type OrderSagaState struct {
	OrderID          string
	SagaStatus       SagaStatus
	InventoryStatus  SagaInventoryStatus
	PaymentStatus    SagaPaymentStatus
	InventoryEventID *string
	PaymentEventID   *string
	FailureCode      *string
	FailureReason    *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
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

type CompletedOrder struct {
	ID          string
	UserID      string
	SellerID    *string
	CompletedAt time.Time
	Items       []OrderItem
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
