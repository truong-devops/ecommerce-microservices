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

var StaffRoles = map[Role]struct{}{
	RoleAdmin:      {},
	RoleSupport:    {},
	RoleWarehouse:  {},
	RoleSeller:     {},
	RoleSuperAdmin: {},
}

type ShipmentStatus string

const (
	ShipmentStatusPending        ShipmentStatus = "PENDING"
	ShipmentStatusAWBCreated     ShipmentStatus = "AWB_CREATED"
	ShipmentStatusPickedUp       ShipmentStatus = "PICKED_UP"
	ShipmentStatusInTransit      ShipmentStatus = "IN_TRANSIT"
	ShipmentStatusOutForDelivery ShipmentStatus = "OUT_FOR_DELIVERY"
	ShipmentStatusDelivered      ShipmentStatus = "DELIVERED"
	ShipmentStatusCancelled      ShipmentStatus = "CANCELLED"
	ShipmentStatusFailed         ShipmentStatus = "FAILED"
	ShipmentStatusReturned       ShipmentStatus = "RETURNED"
)

var ShipmentStatusTransitions = map[ShipmentStatus]map[ShipmentStatus]struct{}{
	ShipmentStatusPending: {ShipmentStatusAWBCreated: {}},
	ShipmentStatusAWBCreated: {
		ShipmentStatusPickedUp:  {},
		ShipmentStatusCancelled: {},
	},
	ShipmentStatusPickedUp: {
		ShipmentStatusInTransit: {},
		ShipmentStatusFailed:    {},
		ShipmentStatusReturned:  {},
	},
	ShipmentStatusInTransit: {
		ShipmentStatusOutForDelivery: {},
		ShipmentStatusFailed:         {},
		ShipmentStatusReturned:       {},
	},
	ShipmentStatusOutForDelivery: {
		ShipmentStatusDelivered: {},
		ShipmentStatusFailed:    {},
		ShipmentStatusReturned:  {},
	},
	ShipmentStatusDelivered: {},
	ShipmentStatusCancelled: {},
	ShipmentStatusFailed: {
		ShipmentStatusOutForDelivery: {},
		ShipmentStatusReturned:       {},
	},
	ShipmentStatusReturned: {},
}

type OutboxStatus string

const (
	OutboxStatusPending   OutboxStatus = "PENDING"
	OutboxStatusPublished OutboxStatus = "PUBLISHED"
	OutboxStatusFailed    OutboxStatus = "FAILED"
)

type UserContext struct {
	UserID       string
	Email        string
	Role         Role
	SessionID    string
	JTI          string
	TokenVersion int
}

type Shipment struct {
	ID               string
	OrderID          string
	BuyerID          string
	SellerID         string
	Provider         string
	AWB              *string
	TrackingNumber   *string
	Status           ShipmentStatus
	Currency         string
	ShippingFee      float64
	CODAmount        float64
	RecipientName    string
	RecipientPhone   string
	RecipientAddress string
	Note             *string
	Metadata         map[string]any
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type ShipmentTrackingEvent struct {
	ID          string
	ShipmentID  string
	Status      ShipmentStatus
	EventCode   *string
	Description *string
	Location    *string
	OccurredAt  time.Time
	RawPayload  map[string]any
	CreatedAt   time.Time
}

type ShipmentStatusHistory struct {
	ID            string
	ShipmentID    string
	FromStatus    *ShipmentStatus
	ToStatus      ShipmentStatus
	ChangedBy     string
	ChangedByRole Role
	Reason        *string
	CreatedAt     time.Time
}

type ShipmentAuditLog struct {
	ID         string
	ShipmentID string
	Action     string
	ActorID    string
	ActorRole  Role
	RequestID  string
	Metadata   map[string]any
	CreatedAt  time.Time
}

type WebhookIdempotencyRecord struct {
	ID              string
	Provider        string
	ProviderEventID string
	RequestHash     string
	ShipmentID      *string
	ResponseStatus  *int
	ResponseBody    map[string]any
	ExpiresAt       time.Time
	CreatedAt       time.Time
}

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

const (
	EventShipmentCreated       = "shipment.created"
	EventShipmentStatusUpdated = "shipment.status-updated"
	EventShipmentDelivered     = "shipment.delivered"
	EventShipmentFailed        = "shipment.failed"
	EventShipmentCancelled     = "shipment.cancelled"
)

func IsValidRole(role Role) bool {
	switch role {
	case RoleCustomer, RoleAdmin, RoleSupport, RoleWarehouse, RoleSeller, RoleSuperAdmin:
		return true
	default:
		return false
	}
}

func IsValidShipmentStatus(status ShipmentStatus) bool {
	switch status {
	case ShipmentStatusPending,
		ShipmentStatusAWBCreated,
		ShipmentStatusPickedUp,
		ShipmentStatusInTransit,
		ShipmentStatusOutForDelivery,
		ShipmentStatusDelivered,
		ShipmentStatusCancelled,
		ShipmentStatusFailed,
		ShipmentStatusReturned:
		return true
	default:
		return false
	}
}
