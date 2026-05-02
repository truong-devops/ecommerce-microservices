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

type UserContext struct {
	UserID       string
	Email        string
	Role         Role
	SessionID    string
	JTI          string
	TokenVersion int
}

type ConversationType string

const (
	ConversationTypeBuyerSeller ConversationType = "BUYER_SELLER"
)

type ConversationStatus string

const (
	ConversationStatusActive  ConversationStatus = "ACTIVE"
	ConversationStatusBlocked ConversationStatus = "BLOCKED"
	ConversationStatusClosed  ConversationStatus = "CLOSED"
)

type MessageKind string

const (
	MessageKindText MessageKind = "TEXT"
)

type ConversationContext struct {
	ProductID *string
	OrderID   *string
	ShopID    *string
}

type LastMessage struct {
	MessageID   string
	SenderID    string
	TextPreview string
	SentAt      time.Time
}

type UnreadCount struct {
	Buyer  int64
	Seller int64
}

type Conversation struct {
	ID          string
	Key         string
	Type        ConversationType
	BuyerID     string
	SellerID    string
	Context     ConversationContext
	LastMessage *LastMessage
	Unread      UnreadCount
	NextSeq     int64
	Status      ConversationStatus
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Message struct {
	ID              string
	ConversationID  string
	Seq             int64
	ClientMessageID string
	SenderID        string
	SenderRole      Role
	Kind            MessageKind
	Text            string
	SentAt          time.Time
	EditedAt        *time.Time
	DeletedAt       *time.Time
	ReadByBuyerAt   *time.Time
	ReadBySellerAt  *time.Time
}

type OutboxStatus string

const (
	OutboxStatusPending   OutboxStatus = "PENDING"
	OutboxStatusPublished OutboxStatus = "PUBLISHED"
	OutboxStatusFailed    OutboxStatus = "FAILED"
)

type OutboxEvent struct {
	ID          string
	AggregateID string
	EventType   string
	Payload     map[string]any
	Status      OutboxStatus
	RetryCount  int
	NextRetryAt *time.Time
	CreatedAt   time.Time
	PublishedAt *time.Time
}

const (
	EventConversationCreated = "chat.conversation.created"
	EventMessageCreated      = "chat.message.created"
	EventMessageRead         = "chat.message.read"
)
