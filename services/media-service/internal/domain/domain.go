package domain

type Role string

const (
	RoleCustomer   Role = "CUSTOMER"
	RoleAdmin      Role = "ADMIN"
	RoleSupport    Role = "SUPPORT"
	RoleWarehouse  Role = "WAREHOUSE"
	RoleSeller     Role = "SELLER"
	RoleModerator  Role = "MODERATOR"
	RoleSuperAdmin Role = "SUPER_ADMIN"
)

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
	case RoleCustomer, RoleAdmin, RoleSupport, RoleWarehouse, RoleSeller, RoleModerator, RoleSuperAdmin:
		return true
	default:
		return false
	}
}
