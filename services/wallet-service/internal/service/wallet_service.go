package service

import (
	"context"
	"math"
	"net/http"
	"strings"
	"time"

	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"
	"wallet-service/internal/repository"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

const supportedCurrency = "VND"

type WalletStore interface {
	ApplyCapture(ctx context.Context, input repository.CaptureInput) (bool, error)
	ApplyDelivery(ctx context.Context, input repository.DeliveryInput) (bool, error)
	ApplyReversal(ctx context.Context, input repository.ReversalInput) (bool, error)
	ReleaseDueHolds(ctx context.Context, now time.Time, limit int) (int, error)
	GetBalance(ctx context.Context, ownerID string, ownerType domain.WalletOwnerType, currency string) (domain.WalletBalance, error)
	ListTransactions(ctx context.Context, input repository.ListTransactionsInput) (domain.TransactionPage, error)
}

type WalletService struct {
	store        WalletStore
	logger       *zap.Logger
	holdDuration time.Duration
	releaseBatch int
	now          func() time.Time
}

func NewWalletService(store WalletStore, logger *zap.Logger, holdDuration time.Duration, releaseBatch int) *WalletService {
	return &WalletService{
		store: store, logger: logger, holdDuration: holdDuration, releaseBatch: releaseBatch,
		now: func() time.Time { return time.Now().UTC() },
	}
}

func (s *WalletService) HandlePaymentCaptured(ctx context.Context, event domain.PaymentCapturedEvent, meta domain.EventMeta) (bool, error) {
	if err := validateEventIdentity(event.PaymentID, event.OrderID, event.SellerID); err != nil {
		return false, err
	}
	currency, err := normalizeEventCurrency(event.Currency)
	if err != nil {
		return false, err
	}
	amountMinor, err := toMinorVND(event.Amount)
	if err != nil {
		return false, err
	}
	meta = normalizeEventMeta(meta, s.now())
	return s.store.ApplyCapture(ctx, repository.CaptureInput{
		PaymentID: event.PaymentID, OrderID: event.OrderID, SellerID: event.SellerID,
		AmountMinor: amountMinor, Currency: currency, HoldDuration: s.holdDuration, Meta: meta,
	})
}

func (s *WalletService) HandleOrderDelivered(ctx context.Context, event domain.OrderDeliveredEvent, meta domain.EventMeta) (bool, error) {
	if _, err := uuid.Parse(strings.TrimSpace(event.OrderID)); err != nil {
		return false, invalidEvent("orderId must be UUID")
	}
	if _, err := uuid.Parse(strings.TrimSpace(event.SellerID)); err != nil {
		return false, invalidEvent("sellerId must be UUID")
	}
	meta = normalizeEventMeta(meta, s.now())
	deliveredAt := event.DeliveredAt.UTC()
	if deliveredAt.IsZero() {
		deliveredAt = meta.OccurredAt
	}
	return s.store.ApplyDelivery(ctx, repository.DeliveryInput{
		OrderID: event.OrderID, SellerID: event.SellerID, DeliveredAt: deliveredAt,
		HoldDuration: s.holdDuration, Meta: meta,
	})
}

func (s *WalletService) HandlePaymentReversed(ctx context.Context, event domain.PaymentReversedEvent, meta domain.EventMeta) (bool, error) {
	if err := validateEventIdentity(event.PaymentID, event.OrderID, event.SellerID); err != nil {
		return false, err
	}
	currency, err := normalizeEventCurrency(event.Currency)
	if err != nil {
		return false, err
	}
	amount := event.RefundedAmount
	if event.IsChargeback {
		amount = event.Amount
		if amount <= 0 {
			amount = event.RefundedAmount
		}
	}
	amountMinor, err := toMinorVND(amount)
	if err != nil {
		return false, err
	}
	meta = normalizeEventMeta(meta, s.now())
	if !event.IsChargeback {
		if _, err := uuid.Parse(strings.TrimSpace(event.CustomerID)); err != nil {
			return false, invalidEvent("userId must be UUID for a refund")
		}
	}
	return s.store.ApplyReversal(ctx, repository.ReversalInput{
		PaymentID: event.PaymentID, OrderID: event.OrderID, CustomerID: event.CustomerID, SellerID: event.SellerID,
		CumulativeAmountMinor: amountMinor, Currency: currency, IsChargeback: event.IsChargeback, Meta: meta,
	})
}

func (s *WalletService) ReleaseDueFunds(ctx context.Context) (int, error) {
	return s.store.ReleaseDueHolds(ctx, s.now(), s.releaseBatch)
}

func (s *WalletService) GetMyWallet(ctx context.Context, user domain.UserContext, currency string) (map[string]any, error) {
	ownerType, err := walletOwnerTypeForRole(user.Role)
	if err != nil {
		return nil, err
	}
	if _, err := uuid.Parse(strings.TrimSpace(user.UserID)); err != nil {
		return nil, httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Invalid authenticated user", nil)
	}
	normalizedCurrency, err := normalizeCurrency(currency)
	if err != nil {
		return nil, err
	}
	balance, err := s.store.GetBalance(ctx, user.UserID, ownerType, normalizedCurrency)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"walletId": balance.WalletID, "ownerId": balance.OwnerID, "ownerType": balance.OwnerType,
		"sellerId": balance.SellerID, "currency": balance.Currency,
		"heldAmount": balance.HeldAmount, "availableAmount": balance.AvailableAmount,
		"payoutPendingAmount": balance.PayoutPendingAmount, "totalPaidOut": balance.TotalPaidOut,
		"isFrozen": balance.IsFrozen, "updatedAt": balance.UpdatedAt,
	}, nil
}

func (s *WalletService) ListMyTransactions(ctx context.Context, user domain.UserContext, currency string, page, pageSize int) (map[string]any, error) {
	ownerType, err := walletOwnerTypeForRole(user.Role)
	if err != nil {
		return nil, err
	}
	if _, err := uuid.Parse(strings.TrimSpace(user.UserID)); err != nil {
		return nil, httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Invalid authenticated user", nil)
	}
	normalizedCurrency, err := normalizeCurrency(currency)
	if err != nil {
		return nil, err
	}
	result, err := s.store.ListTransactions(ctx, repository.ListTransactionsInput{
		OwnerID: user.UserID, OwnerType: ownerType, Currency: normalizedCurrency, Page: page, PageSize: pageSize,
	})
	if err != nil {
		return nil, err
	}
	totalPages := 0
	if result.TotalItems > 0 {
		totalPages = int((result.TotalItems + int64(pageSize) - 1) / int64(pageSize))
	}
	return map[string]any{
		"items": result.Items,
		"pagination": map[string]any{
			"page": page, "pageSize": pageSize, "totalItems": result.TotalItems, "totalPages": totalPages,
		},
	}, nil
}

func walletOwnerTypeForRole(role domain.Role) (domain.WalletOwnerType, error) {
	switch role {
	case domain.RoleSeller:
		return domain.WalletOwnerSeller, nil
	case domain.RoleCustomer, domain.RoleBuyer:
		return domain.WalletOwnerCustomer, nil
	default:
		return "", httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Role cannot access a wallet", nil)
	}
}

func validateEventIdentity(paymentID, orderID, sellerID string) error {
	for field, value := range map[string]string{"paymentId": paymentID, "orderId": orderID, "sellerId": sellerID} {
		if _, err := uuid.Parse(strings.TrimSpace(value)); err != nil {
			return invalidEvent(field + " must be UUID")
		}
	}
	return nil
}

func normalizeCurrency(currency string) (string, error) {
	value := strings.ToUpper(strings.TrimSpace(currency))
	if value == "" {
		value = supportedCurrency
	}
	if value != supportedCurrency {
		return "", httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Only VND is supported", map[string]any{"currency": value})
	}
	return value, nil
}

func normalizeEventCurrency(currency string) (string, error) {
	if strings.TrimSpace(currency) == "" {
		return "", invalidEvent("currency is required")
	}
	return normalizeCurrency(currency)
}

func toMinorVND(amount float64) (int64, error) {
	if math.IsNaN(amount) || math.IsInf(amount, 0) || amount <= 0 {
		return 0, invalidEvent("amount must be a positive VND integer")
	}
	rounded := math.Round(amount)
	if math.Abs(amount-rounded) > 0.000001 || rounded > math.MaxInt64 {
		return 0, invalidEvent("amount must be a positive VND integer")
	}
	return int64(rounded), nil
}

func normalizeEventMeta(meta domain.EventMeta, fallback time.Time) domain.EventMeta {
	if meta.OccurredAt.IsZero() {
		meta.OccurredAt = fallback.UTC()
	}
	return meta
}

func invalidEvent(message string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeInvalidEvent, message, nil)
}
