package service

import (
	"context"
	"testing"
	"time"

	"wallet-service/internal/domain"
	"wallet-service/internal/repository"

	"go.uber.org/zap"
)

const (
	testSellerID   = "11111111-1111-4111-8111-111111111111"
	testPaymentID  = "22222222-2222-4222-8222-222222222222"
	testOrderID    = "33333333-3333-4333-8333-333333333333"
	testCustomerID = "44444444-4444-4444-8444-444444444444"
)

type fakeWalletStore struct {
	captureInput  repository.CaptureInput
	deliveryInput repository.DeliveryInput
	reversalInput repository.ReversalInput
	balanceSeller string
	listInput     repository.ListTransactionsInput
	releaseCalls  int
	balance       domain.WalletBalance
	transactions  domain.TransactionPage
}

func (f *fakeWalletStore) ApplyCapture(_ context.Context, input repository.CaptureInput) (bool, error) {
	f.captureInput = input
	return true, nil
}

func (f *fakeWalletStore) ApplyDelivery(_ context.Context, input repository.DeliveryInput) (bool, error) {
	f.deliveryInput = input
	return true, nil
}

func (f *fakeWalletStore) ApplyReversal(_ context.Context, input repository.ReversalInput) (bool, error) {
	f.reversalInput = input
	return true, nil
}

func (f *fakeWalletStore) ReleaseDueHolds(_ context.Context, _ time.Time, _ int) (int, error) {
	f.releaseCalls++
	return 2, nil
}

func (f *fakeWalletStore) GetBalance(_ context.Context, sellerID string, _ domain.WalletOwnerType, _ string) (domain.WalletBalance, error) {
	f.balanceSeller = sellerID
	return f.balance, nil
}

func (f *fakeWalletStore) ListTransactions(_ context.Context, input repository.ListTransactionsInput) (domain.TransactionPage, error) {
	f.listInput = input
	return f.transactions, nil
}

func newTestWalletService(store WalletStore) *WalletService {
	service := NewWalletService(store, zap.NewNop(), time.Minute, 100)
	service.now = func() time.Time { return time.Date(2026, 10, 11, 8, 0, 0, 0, time.UTC) }
	return service
}

func TestHandlePaymentCapturedConvertsVNDToInteger(t *testing.T) {
	store := &fakeWalletStore{}
	service := newTestWalletService(store)

	processed, err := service.HandlePaymentCaptured(context.Background(), domain.PaymentCapturedEvent{
		PaymentID: testPaymentID, OrderID: testOrderID, SellerID: testSellerID,
		Amount: 125000, Currency: "vnd",
	}, domain.EventMeta{EventID: "evt-captured", EventType: "payment.captured"})
	if err != nil || !processed {
		t.Fatalf("handle payment captured: processed=%v err=%v", processed, err)
	}
	if store.captureInput.AmountMinor != 125000 || store.captureInput.Currency != "VND" {
		t.Fatalf("unexpected capture input: %+v", store.captureInput)
	}
	if store.captureInput.HoldDuration != time.Minute {
		t.Fatalf("unexpected hold duration: %s", store.captureInput.HoldDuration)
	}
}

func TestHandlePaymentCapturedRejectsFractionalVND(t *testing.T) {
	store := &fakeWalletStore{}
	service := newTestWalletService(store)

	_, err := service.HandlePaymentCaptured(context.Background(), domain.PaymentCapturedEvent{
		PaymentID: testPaymentID, OrderID: testOrderID, SellerID: testSellerID,
		Amount: 1000.5, Currency: "VND",
	}, domain.EventMeta{})
	if err == nil {
		t.Fatal("expected fractional VND amount to fail")
	}
}

func TestHandlePaymentCapturedRequiresCurrency(t *testing.T) {
	store := &fakeWalletStore{}
	service := NewWalletService(store, zap.NewNop(), time.Hour, 100)
	_, err := service.HandlePaymentCaptured(context.Background(), domain.PaymentCapturedEvent{
		PaymentID: testPaymentID, OrderID: testOrderID, SellerID: testSellerID, Amount: 125000,
	}, domain.EventMeta{EventID: "evt-missing-currency", EventType: "payment.captured"})
	if err == nil {
		t.Fatal("expected missing event currency to fail")
	}
}

func TestOrderDeliveredUsesEventTimeWhenPayloadTimeMissing(t *testing.T) {
	store := &fakeWalletStore{}
	service := newTestWalletService(store)
	eventTime := time.Date(2026, 10, 10, 10, 30, 0, 0, time.UTC)

	_, err := service.HandleOrderDelivered(context.Background(), domain.OrderDeliveredEvent{
		OrderID: testOrderID, SellerID: testSellerID,
	}, domain.EventMeta{EventType: "order.delivered", OccurredAt: eventTime})
	if err != nil {
		t.Fatalf("handle order delivered: %v", err)
	}
	if !store.deliveryInput.DeliveredAt.Equal(eventTime) {
		t.Fatalf("deliveredAt=%s, want %s", store.deliveryInput.DeliveredAt, eventTime)
	}
}

func TestChargebackUsesPaymentAmountWhenRefundedAmountMissing(t *testing.T) {
	store := &fakeWalletStore{}
	service := newTestWalletService(store)

	_, err := service.HandlePaymentReversed(context.Background(), domain.PaymentReversedEvent{
		PaymentID: testPaymentID, OrderID: testOrderID, SellerID: testSellerID,
		Amount: 99000, RefundedAmount: 25000, Currency: "VND", IsChargeback: true,
	}, domain.EventMeta{EventType: "payment.chargeback"})
	if err != nil {
		t.Fatalf("handle chargeback: %v", err)
	}
	if store.reversalInput.CumulativeAmountMinor != 99000 || !store.reversalInput.IsChargeback {
		t.Fatalf("unexpected reversal input: %+v", store.reversalInput)
	}
}

func TestRefundRequiresCustomerAndCreditsAuthenticatedOwner(t *testing.T) {
	store := &fakeWalletStore{}
	service := newTestWalletService(store)

	_, err := service.HandlePaymentReversed(context.Background(), domain.PaymentReversedEvent{
		PaymentID: testPaymentID, OrderID: testOrderID, SellerID: testSellerID,
		RefundedAmount: 25000, Currency: "VND",
	}, domain.EventMeta{EventType: "payment.refunded"})
	if err == nil {
		t.Fatal("expected refund without customer id to fail")
	}

	_, err = service.HandlePaymentReversed(context.Background(), domain.PaymentReversedEvent{
		PaymentID: testPaymentID, OrderID: testOrderID, CustomerID: testCustomerID, SellerID: testSellerID,
		RefundedAmount: 25000, Currency: "VND",
	}, domain.EventMeta{EventType: "payment.refunded"})
	if err != nil {
		t.Fatalf("handle customer refund: %v", err)
	}
	if store.reversalInput.CustomerID != testCustomerID || store.reversalInput.CumulativeAmountMinor != 25000 {
		t.Fatalf("unexpected refund input: %+v", store.reversalInput)
	}
}

func TestGetMyWalletUsesAuthenticatedSellerID(t *testing.T) {
	store := &fakeWalletStore{balance: domain.WalletBalance{SellerID: testSellerID, Currency: "VND", AvailableAmount: 50000}}
	service := newTestWalletService(store)

	result, err := service.GetMyWallet(context.Background(), domain.UserContext{UserID: testSellerID, Role: domain.RoleSeller}, "VND")
	if err != nil {
		t.Fatalf("get my wallet: %v", err)
	}
	if store.balanceSeller != testSellerID || result["availableAmount"] != int64(50000) {
		t.Fatalf("unexpected wallet result: %+v", result)
	}
}

func TestGetMyWalletUsesCustomerOwnerType(t *testing.T) {
	store := &fakeWalletStore{balance: domain.WalletBalance{
		OwnerID: testCustomerID, OwnerType: domain.WalletOwnerCustomer,
		Currency: "VND", AvailableAmount: 25000,
	}}
	service := newTestWalletService(store)

	result, err := service.GetMyWallet(context.Background(), domain.UserContext{UserID: testCustomerID, Role: domain.RoleCustomer}, "VND")
	if err != nil {
		t.Fatalf("get customer wallet: %v", err)
	}
	if store.balanceSeller != testCustomerID || result["ownerType"] != domain.WalletOwnerCustomer || result["availableAmount"] != int64(25000) {
		t.Fatalf("unexpected customer wallet result: %+v", result)
	}
}

func TestAdminCannotReadPersonalWalletEndpoint(t *testing.T) {
	service := newTestWalletService(&fakeWalletStore{})
	_, err := service.GetMyWallet(context.Background(), domain.UserContext{UserID: testSellerID, Role: domain.RoleAdmin}, "VND")
	if err == nil {
		t.Fatal("expected admin to be denied personal wallet endpoint")
	}
}

func TestListMyTransactionsBuildsPagination(t *testing.T) {
	store := &fakeWalletStore{transactions: domain.TransactionPage{Items: []domain.LedgerTransaction{}, TotalItems: 21}}
	service := newTestWalletService(store)
	result, err := service.ListMyTransactions(context.Background(), domain.UserContext{UserID: testSellerID, Role: domain.RoleSeller}, "VND", 2, 10)
	if err != nil {
		t.Fatalf("list transactions: %v", err)
	}
	pagination, ok := result["pagination"].(map[string]any)
	if !ok || pagination["totalPages"] != 3 {
		t.Fatalf("unexpected pagination: %+v", result["pagination"])
	}
	if store.listInput.OwnerID != testSellerID || store.listInput.OwnerType != domain.WalletOwnerSeller || store.listInput.Page != 2 {
		t.Fatalf("unexpected list input: %+v", store.listInput)
	}
}

func TestToMinorVNDRejectsInvalidAmounts(t *testing.T) {
	for _, amount := range []float64{0, -1, 1.25} {
		if _, err := toMinorVND(amount); err == nil {
			t.Fatalf("expected amount %v to fail", amount)
		}
	}
	if value, err := toMinorVND(10000); err != nil || value != 10000 {
		t.Fatalf("unexpected valid amount result: %d %v", value, err)
	}
}

var _ WalletStore = (*fakeWalletStore)(nil)
