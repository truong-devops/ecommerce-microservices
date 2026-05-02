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

var StaffRoles = map[Role]struct{}{
	RoleAdmin:      {},
	RoleSupport:    {},
	RoleWarehouse:  {},
	RoleSeller:     {},
	RoleSuperAdmin: {},
}

var BuyerRoles = map[Role]struct{}{
	RoleBuyer:    {},
	RoleCustomer: {},
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

type CartItem struct {
	ID        string         `json:"id"`
	ProductID string         `json:"productId"`
	VariantID *string        `json:"variantId"`
	SKU       string         `json:"sku"`
	Name      string         `json:"name"`
	Image     *string        `json:"image"`
	UnitPrice float64        `json:"unitPrice"`
	Quantity  int            `json:"quantity"`
	LineTotal float64        `json:"lineTotal"`
	SellerID  string         `json:"sellerId"`
	Metadata  map[string]any `json:"metadata"`
}

type CartSnapshot struct {
	ID            string     `json:"id"`
	UserID        string     `json:"userId"`
	Currency      string     `json:"currency"`
	Items         []CartItem `json:"items"`
	Subtotal      float64    `json:"subtotal"`
	DiscountTotal float64    `json:"discountTotal"`
	GrandTotal    float64    `json:"grandTotal"`
	ExpiresAt     string     `json:"expiresAt"`
	Version       int        `json:"version"`
	CreatedAt     string     `json:"createdAt"`
	UpdatedAt     string     `json:"updatedAt"`
}

type CartValidationIssue struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	ItemID    string `json:"itemId,omitempty"`
	ProductID string `json:"productId,omitempty"`
	SKU       string `json:"sku,omitempty"`
}
