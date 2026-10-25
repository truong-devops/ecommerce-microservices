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

type AccountType string

type WalletOwnerType string

const (
	WalletOwnerSeller   WalletOwnerType = "SELLER"
	WalletOwnerCustomer WalletOwnerType = "CUSTOMER"
)

const (
	AccountTypePlatformClearing  AccountType = "PLATFORM_CLEARING"
	AccountTypePlatformPayout    AccountType = "PLATFORM_PAYOUT_CLEARING"
	AccountTypeSellerHeld        AccountType = "SELLER_HELD"
	AccountTypeSellerAvailable   AccountType = "SELLER_AVAILABLE"
	AccountTypeCustomerAvailable AccountType = "CUSTOMER_AVAILABLE"
	AccountTypePayoutPending     AccountType = "PAYOUT_PENDING"
)

type HoldStatus string

const (
	HoldStatusHeld              HoldStatus = "HELD"
	HoldStatusPartiallyRefunded HoldStatus = "PARTIALLY_REFUNDED"
	HoldStatusRefunded          HoldStatus = "REFUNDED"
	HoldStatusReleased          HoldStatus = "RELEASED"
)

type TransactionType string

const (
	TransactionTypePaymentHeld          TransactionType = "PAYMENT_HELD"
	TransactionTypeFundsReleased        TransactionType = "FUNDS_RELEASED"
	TransactionTypePaymentRefund        TransactionType = "PAYMENT_REFUND"
	TransactionTypeCustomerRefundCredit TransactionType = "CUSTOMER_REFUND_CREDIT"
	TransactionTypeChargeback           TransactionType = "CHARGEBACK"
	TransactionTypePayoutRequest        TransactionType = "PAYOUT_REQUESTED"
	TransactionTypePayoutSuccess        TransactionType = "PAYOUT_SUCCEEDED"
	TransactionTypePayoutFailure        TransactionType = "PAYOUT_FAILED"
	TransactionTypePayoutCancel         TransactionType = "PAYOUT_CANCELLED"
)

type BankAccountStatus string

const (
	BankAccountStatusUnverified  BankAccountStatus = "UNVERIFIED"
	BankAccountStatusAllowlisted BankAccountStatus = "ALLOWLISTED"
	BankAccountStatusDisabled    BankAccountStatus = "DISABLED"
)

type BankAccount struct {
	ID                  string            `json:"id"`
	BankCode            string            `json:"bankCode"`
	AccountHolderName   string            `json:"accountHolderName"`
	MaskedAccountNumber string            `json:"maskedAccountNumber"`
	Status              BankAccountStatus `json:"status"`
	IsDefault           bool              `json:"isDefault"`
	CreatedAt           time.Time         `json:"createdAt"`
	UpdatedAt           time.Time         `json:"updatedAt"`
}

type PayoutStatus string

const (
	PayoutStatusRequested  PayoutStatus = "REQUESTED"
	PayoutStatusProcessing PayoutStatus = "PROCESSING"
	PayoutStatusSucceeded  PayoutStatus = "SUCCEEDED"
	PayoutStatusFailed     PayoutStatus = "FAILED"
	PayoutStatusCancelled  PayoutStatus = "CANCELLED"
)

type Payout struct {
	ID                  string       `json:"id"`
	AmountMinor         int64        `json:"amount"`
	Currency            string       `json:"currency"`
	Status              PayoutStatus `json:"status"`
	BankCode            string       `json:"bankCode"`
	AccountHolderName   string       `json:"accountHolderName"`
	MaskedAccountNumber string       `json:"maskedAccountNumber"`
	Provider            *string      `json:"provider,omitempty"`
	ProviderReference   *string      `json:"providerReference,omitempty"`
	FailureCode         *string      `json:"failureCode,omitempty"`
	FailureMessage      *string      `json:"failureMessage,omitempty"`
	RequestedAt         time.Time    `json:"requestedAt"`
	ProcessedAt         *time.Time   `json:"processedAt,omitempty"`
	CreatedAt           time.Time    `json:"createdAt"`
	UpdatedAt           time.Time    `json:"updatedAt"`
}

type PayoutPage struct {
	Items      []Payout
	Page       int
	PageSize   int
	TotalItems int64
}

type PayoutSummary struct {
	PaidThisWeek  int64 `json:"paidThisWeek"`
	PaidThisMonth int64 `json:"paidThisMonth"`
	TotalPaidOut  int64 `json:"totalPaidOut"`
}

type EventMeta struct {
	EventID     string
	EventType   string
	RequestID   string
	Topic       string
	Partition   int
	OffsetValue int64
	OccurredAt  time.Time
}

type PaymentCapturedEvent struct {
	PaymentID string
	OrderID   string
	SellerID  string
	Amount    float64
	Currency  string
}

type PaymentReversedEvent struct {
	PaymentID      string
	OrderID        string
	CustomerID     string
	SellerID       string
	Amount         float64
	RefundedAmount float64
	Currency       string
	IsChargeback   bool
}

type OrderDeliveredEvent struct {
	OrderID     string
	SellerID    string
	DeliveredAt time.Time
}

type WalletBalance struct {
	WalletID            *string         `json:"walletId"`
	OwnerID             string          `json:"ownerId"`
	OwnerType           WalletOwnerType `json:"ownerType"`
	SellerID            string          `json:"sellerId,omitempty"`
	Currency            string          `json:"currency"`
	HeldAmount          int64           `json:"heldAmount"`
	AvailableAmount     int64           `json:"availableAmount"`
	PayoutPendingAmount int64           `json:"payoutPendingAmount"`
	TotalPaidOut        int64           `json:"totalPaidOut"`
	IsFrozen            bool            `json:"isFrozen"`
	UpdatedAt           time.Time       `json:"updatedAt"`
}

type LedgerTransaction struct {
	ID              string          `json:"id"`
	TransactionType TransactionType `json:"type"`
	ReferenceType   string          `json:"referenceType"`
	ReferenceID     string          `json:"referenceId"`
	AmountMinor     int64           `json:"amount"`
	Currency        string          `json:"currency"`
	Description     *string         `json:"description,omitempty"`
	OccurredAt      time.Time       `json:"occurredAt"`
	CreatedAt       time.Time       `json:"createdAt"`
}

type TransactionPage struct {
	Items      []LedgerTransaction
	Page       int
	PageSize   int
	TotalItems int64
}

type AdminWallet struct {
	ID                  string          `json:"id"`
	OwnerID             string          `json:"ownerId"`
	OwnerType           WalletOwnerType `json:"ownerType"`
	SellerID            string          `json:"sellerId,omitempty"`
	Currency            string          `json:"currency"`
	HeldAmount          int64           `json:"heldAmount"`
	AvailableAmount     int64           `json:"availableAmount"`
	PayoutPendingAmount int64           `json:"payoutPendingAmount"`
	TotalPaidOut        int64           `json:"totalPaidOut"`
	IsFrozen            bool            `json:"isFrozen"`
	BankAccount         *BankAccount    `json:"bankAccount,omitempty"`
	CreatedAt           time.Time       `json:"createdAt"`
	UpdatedAt           time.Time       `json:"updatedAt"`
}

type AdminWalletPage struct {
	Items      []AdminWallet
	Page       int
	PageSize   int
	TotalItems int64
}

type AdminWalletSummary struct {
	TotalWallets           int64 `json:"totalWallets"`
	FrozenWallets          int64 `json:"frozenWallets"`
	UnverifiedBankAccounts int64 `json:"unverifiedBankAccounts"`
	DisabledBankAccounts   int64 `json:"disabledBankAccounts"`
	PendingPayouts         int64 `json:"pendingPayouts"`
	HeldAmount             int64 `json:"heldAmount"`
	AvailableAmount        int64 `json:"availableAmount"`
	PayoutPendingAmount    int64 `json:"payoutPendingAmount"`
	TotalPaidOut           int64 `json:"totalPaidOut"`
}

type AdminPayout struct {
	Payout
	WalletID   string          `json:"walletId"`
	OwnerID    string          `json:"ownerId"`
	OwnerType  WalletOwnerType `json:"ownerType"`
	PayoutType string          `json:"payoutType"`
	SellerID   string          `json:"sellerId,omitempty"`
}

type AdminPayoutPage struct {
	Items      []AdminPayout
	Page       int
	PageSize   int
	TotalItems int64
}

type AdminPayoutTransfer struct {
	PayoutID          string          `json:"payoutId"`
	WalletID          string          `json:"walletId"`
	OwnerID           string          `json:"ownerId"`
	OwnerType         WalletOwnerType `json:"ownerType"`
	PayoutType        string          `json:"payoutType"`
	SellerID          string          `json:"sellerId,omitempty"`
	AmountMinor       int64           `json:"amount"`
	Currency          string          `json:"currency"`
	Status            PayoutStatus    `json:"status"`
	BankCode          string          `json:"bankCode"`
	AccountNumber     string          `json:"accountNumber"`
	AccountHolderName string          `json:"accountHolderName"`
	TransferContent   string          `json:"transferContent"`
	QRCodeURL         string          `json:"qrCodeUrl"`
}

type AdminAuditLog struct {
	ID             string    `json:"id"`
	ActorID        string    `json:"actorId"`
	ActorEmail     string    `json:"actorEmail"`
	Action         string    `json:"action"`
	WalletID       string    `json:"walletId"`
	BankAccountID  *string   `json:"bankAccountId,omitempty"`
	PreviousStatus *string   `json:"previousStatus,omitempty"`
	NewStatus      *string   `json:"newStatus,omitempty"`
	Reason         string    `json:"reason"`
	CreatedAt      time.Time `json:"createdAt"`
}

type AdminAuditLogPage struct {
	Items      []AdminAuditLog
	Page       int
	PageSize   int
	TotalItems int64
}
