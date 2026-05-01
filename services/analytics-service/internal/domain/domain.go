package domain

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

type UserContext struct {
	UserID       string
	Email        string
	Role         Role
	SessionID    string
	JTI          string
	TokenVersion int
}

type AnalyticsDateRange struct {
	From     string
	To       string
	SellerID string
}

type AnalyticsEventRecord struct {
	EventKey       string
	EventType      string
	SourceService  *string
	OccurredAt     string
	SellerID       *string
	UserID         *string
	OrderID        *string
	PaymentID      *string
	ShipmentID     *string
	Amount         *float64
	RefundedAmount *float64
	Currency       *string
	Status         *string
	PayloadJSON    string
	CreatedAt      string
}

func IsValidRole(role Role) bool {
	switch role {
	case RoleBuyer, RoleCustomer, RoleSeller, RoleAdmin, RoleModerator, RoleSupport, RoleWarehouse, RoleSuperAdmin, RoleService:
		return true
	default:
		return false
	}
}
