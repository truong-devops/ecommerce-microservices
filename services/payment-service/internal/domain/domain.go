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

func IsValidRole(role Role) bool {
	switch role {
	case RoleBuyer, RoleCustomer, RoleSeller, RoleAdmin, RoleModerator, RoleSupport, RoleWarehouse, RoleSuperAdmin, RoleService:
		return true
	default:
		return false
	}
}

type PaymentStatus string

const (
	PaymentStatusPending           PaymentStatus = "PENDING"
	PaymentStatusRequiresAction    PaymentStatus = "REQUIRES_ACTION"
	PaymentStatusAuthorized        PaymentStatus = "AUTHORIZED"
	PaymentStatusCaptured          PaymentStatus = "CAPTURED"
	PaymentStatusFailed            PaymentStatus = "FAILED"
	PaymentStatusCancelled         PaymentStatus = "CANCELLED"
	PaymentStatusPartiallyRefunded PaymentStatus = "PARTIALLY_REFUNDED"
	PaymentStatusRefunded          PaymentStatus = "REFUNDED"
	PaymentStatusChargeback        PaymentStatus = "CHARGEBACK"
)

var PaymentStatusTransitions = map[PaymentStatus]map[PaymentStatus]struct{}{
	PaymentStatusPending: {
		PaymentStatusRequiresAction: {},
		PaymentStatusAuthorized:     {},
		PaymentStatusCaptured:       {},
		PaymentStatusFailed:         {},
		PaymentStatusCancelled:      {},
	},
	PaymentStatusRequiresAction: {
		PaymentStatusAuthorized: {},
		PaymentStatusCaptured:   {},
		PaymentStatusFailed:     {},
		PaymentStatusCancelled:  {},
	},
	PaymentStatusAuthorized: {
		PaymentStatusCaptured:   {},
		PaymentStatusCancelled:  {},
		PaymentStatusFailed:     {},
		PaymentStatusChargeback: {},
	},
	PaymentStatusCaptured: {
		PaymentStatusPartiallyRefunded: {},
		PaymentStatusRefunded:          {},
		PaymentStatusChargeback:        {},
	},
	PaymentStatusFailed:    {},
	PaymentStatusCancelled: {},
	PaymentStatusPartiallyRefunded: {
		PaymentStatusRefunded:   {},
		PaymentStatusChargeback: {},
	},
	PaymentStatusRefunded: {
		PaymentStatusChargeback: {},
	},
	PaymentStatusChargeback: {},
}

func IsValidPaymentStatus(status PaymentStatus) bool {
	switch status {
	case PaymentStatusPending,
		PaymentStatusRequiresAction,
		PaymentStatusAuthorized,
		PaymentStatusCaptured,
		PaymentStatusFailed,
		PaymentStatusCancelled,
		PaymentStatusPartiallyRefunded,
		PaymentStatusRefunded,
		PaymentStatusChargeback:
		return true
	default:
		return false
	}
}

type RefundStatus string

const (
	RefundStatusPending   RefundStatus = "PENDING"
	RefundStatusSucceeded RefundStatus = "SUCCEEDED"
	RefundStatusFailed    RefundStatus = "FAILED"
)

func IsValidRefundStatus(status RefundStatus) bool {
	switch status {
	case RefundStatusPending, RefundStatusSucceeded, RefundStatusFailed:
		return true
	default:
		return false
	}
}

type Payment struct {
	ID                string
	OrderID           string
	UserID            string
	SellerID          *string
	Provider          string
	ProviderPaymentID *string
	Status            PaymentStatus
	Currency          string
	Amount            float64
	RefundedAmount    float64
	Description       *string
	Metadata          map[string]any
	ExpiresAt         *time.Time
	CapturedAt        *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type Refund struct {
	ID               string
	PaymentID        string
	ProviderRefundID *string
	Amount           float64
	Currency         string
	Status           RefundStatus
	Reason           *string
	Metadata         map[string]any
	RequestedBy      string
	RequestedByRole  Role
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type PaymentTransaction struct {
	ID                   string
	PaymentID            string
	TransactionType      string
	GatewayTransactionID *string
	Amount               float64
	Currency             string
	Status               string
	RequestID            string
	RawPayload           map[string]any
	CreatedAt            time.Time
}

type PaymentStatusHistory struct {
	ID            string
	PaymentID     string
	FromStatus    *PaymentStatus
	ToStatus      PaymentStatus
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

type UserContext struct {
	UserID       string
	Email        string
	Role         Role
	SessionID    string
	JTI          string
	TokenVersion int
}
