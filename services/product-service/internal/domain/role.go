package domain

type Role string

const (
	RoleBuyer      Role = "BUYER"
	RoleCustomer   Role = "CUSTOMER"
	RoleSeller     Role = "SELLER"
	RoleAdmin      Role = "ADMIN"
	RoleModerator  Role = "MODERATOR"
	RoleSupport    Role = "SUPPORT"
	RoleSuperAdmin Role = "SUPER_ADMIN"
)

type UserContext struct {
	UserID       string
	Email        string
	Role         Role
	JTI          string
	SessionID    string
	TokenVersion float64
}

func IsStaff(role Role) bool {
	return role == RoleAdmin || role == RoleModerator || role == RoleSupport || role == RoleSuperAdmin
}

func IsSeller(role Role) bool {
	return role == RoleSeller
}

func IsBuyer(role Role) bool {
	return role == RoleBuyer || role == RoleCustomer
}

func IsKnownRole(role Role) bool {
	switch role {
	case RoleBuyer, RoleCustomer, RoleSeller, RoleAdmin, RoleModerator, RoleSupport, RoleSuperAdmin:
		return true
	default:
		return false
	}
}
