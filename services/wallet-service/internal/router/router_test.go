package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"wallet-service/internal/config"
	"wallet-service/internal/domain"
	"wallet-service/internal/handler"
	"wallet-service/internal/observability"
	"wallet-service/internal/repository"
	"wallet-service/internal/service"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

const routerTestSecret = "dev-shared-jwt-access-secret-min-32-chars"

type routerStore struct {
	sellerID string
}

func (s *routerStore) ApplyCapture(context.Context, repository.CaptureInput) (bool, error) {
	return true, nil
}

func (s *routerStore) ApplyDelivery(context.Context, repository.DeliveryInput) (bool, error) {
	return true, nil
}

func (s *routerStore) ApplyReversal(context.Context, repository.ReversalInput) (bool, error) {
	return true, nil
}

func (s *routerStore) ReleaseDueHolds(context.Context, time.Time, int) (int, error) {
	return 0, nil
}

func (s *routerStore) GetBalance(_ context.Context, sellerID, currency string) (domain.WalletBalance, error) {
	s.sellerID = sellerID
	return domain.WalletBalance{SellerID: sellerID, Currency: currency, UpdatedAt: time.Now().UTC()}, nil
}

func (s *routerStore) ListTransactions(context.Context, repository.ListTransactionsInput) (domain.TransactionPage, error) {
	return domain.TransactionPage{Items: []domain.LedgerTransaction{}, Page: 1, PageSize: 20}, nil
}

func (s *routerStore) Ping(context.Context) error { return nil }

func (s *routerStore) UpsertBankAccount(context.Context, repository.UpsertBankAccountInput) (domain.BankAccount, error) {
	return domain.BankAccount{}, nil
}
func (s *routerStore) GetBankAccount(context.Context, string, string) (domain.BankAccount, error) {
	return domain.BankAccount{}, nil
}
func (s *routerStore) CreatePayout(context.Context, repository.CreatePayoutInput) (domain.Payout, bool, error) {
	return domain.Payout{}, false, nil
}
func (s *routerStore) GetPayout(context.Context, string, string) (domain.Payout, error) {
	return domain.Payout{}, nil
}
func (s *routerStore) ListPayouts(context.Context, repository.ListPayoutsInput) (domain.PayoutPage, error) {
	return domain.PayoutPage{}, nil
}
func (s *routerStore) GetPayoutSummary(context.Context, repository.PayoutSummaryInput) (domain.PayoutSummary, error) {
	return domain.PayoutSummary{PaidThisWeek: 10_000, PaidThisMonth: 20_000, TotalPaidOut: 30_000}, nil
}
func (s *routerStore) ClaimPayouts(context.Context, time.Time, int) ([]repository.PayoutJob, error) {
	return nil, nil
}
func (s *routerStore) FindStalePayouts(context.Context, time.Time, int) ([]repository.PayoutJob, error) {
	return nil, nil
}
func (s *routerStore) CompletePayout(context.Context, repository.CompletePayoutInput) (bool, error) {
	return false, nil
}
func (s *routerStore) MarkPayoutPending(context.Context, string, string, string, time.Time) error {
	return nil
}
func (s *routerStore) ReschedulePayout(context.Context, string, time.Time) error { return nil }
func (s *routerStore) GetAdminWalletSummary(context.Context, string) (domain.AdminWalletSummary, error) {
	return domain.AdminWalletSummary{TotalWallets: 1}, nil
}
func (s *routerStore) ListAdminWallets(context.Context, repository.ListAdminWalletsInput) (domain.AdminWalletPage, error) {
	return domain.AdminWalletPage{Items: []domain.AdminWallet{}, Page: 1, PageSize: 20}, nil
}
func (s *routerStore) GetAdminWallet(context.Context, string) (domain.AdminWallet, error) {
	return domain.AdminWallet{}, nil
}
func (s *routerStore) SetAdminWalletFrozen(context.Context, repository.AdminActionInput, bool) (domain.AdminWallet, error) {
	return domain.AdminWallet{}, nil
}
func (s *routerStore) SetAdminBankAccountStatus(context.Context, repository.AdminActionInput, domain.BankAccountStatus) (domain.AdminWallet, error) {
	return domain.AdminWallet{}, nil
}
func (s *routerStore) ListAdminTransactions(context.Context, string, int, int) (domain.TransactionPage, error) {
	return domain.TransactionPage{}, nil
}
func (s *routerStore) ListAdminPayouts(context.Context, repository.ListAdminPayoutsInput) (domain.AdminPayoutPage, error) {
	return domain.AdminPayoutPage{}, nil
}
func (s *routerStore) ListAdminAuditLogs(context.Context, repository.ListAdminAuditLogsInput) (domain.AdminAuditLogPage, error) {
	return domain.AdminAuditLogPage{}, nil
}
func (s *routerStore) PrepareManualPayout(context.Context, repository.PrepareManualPayoutInput) (repository.ManualPayoutData, error) {
	return repository.ManualPayoutData{}, nil
}
func (s *routerStore) CompleteManualPayout(context.Context, repository.CompleteManualPayoutInput) (domain.AdminPayout, bool, error) {
	return domain.AdminPayout{}, true, nil
}

func TestWalletRouteRequiresAuthentication(t *testing.T) {
	router, _ := testRouter()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/wallets/me", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", response.Code, http.StatusUnauthorized)
	}
}

func TestWalletRouteRejectsNonSeller(t *testing.T) {
	router, _ := testRouter()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/wallets/me", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken(t, domain.RoleBuyer))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", response.Code, http.StatusForbidden)
	}
}

func TestWalletRouteUsesSellerFromJWT(t *testing.T) {
	router, store := testRouter()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/wallets/me", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken(t, domain.RoleSeller))
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if store.sellerID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("seller id came from unexpected source: %s", store.sellerID)
	}
}

func TestPayoutSummaryRouteValidatesDates(t *testing.T) {
	router, _ := testRouter()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/payouts/summary?weekStart=invalid&monthStart=invalid", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken(t, domain.RoleSeller))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestAdminWalletRouteAllowsAdmin(t *testing.T) {
	router, _ := testRouter()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/wallets/summary", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken(t, domain.RoleAdmin))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestAdminWalletRouteRejectsModerator(t *testing.T) {
	router, _ := testRouter()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/wallets/summary", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken(t, domain.RoleModerator))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func testRouter() (http.Handler, *routerStore) {
	store := &routerStore{}
	walletService := service.NewWalletService(store, zap.NewNop(), time.Minute, 100)
	cipher, _ := service.NewBankAccountCipher("dev-bank-account-encryption-key-32-chars")
	payoutService := service.NewPayoutService(store, cipher, true, 10_000, 10_000_000, 24*time.Hour)
	adminService := service.NewAdminService(store, cipher, true, "manual_vietqr")
	healthService := service.NewHealthService("wallet-service", store)
	return New(
		config.Config{AppName: "wallet-service", APIPrefix: "api/v1", JWTAccessSecret: routerTestSecret},
		zap.NewNop(), nil, handler.NewWalletHandler(walletService), handler.NewPayoutHandler(payoutService), handler.NewAdminHandler(adminService), handler.NewHealthHandler(healthService), observability.NewMetrics(),
	), store
}

func signedToken(t *testing.T, role domain.Role) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "11111111-1111-4111-8111-111111111111", "email": "seller@example.com",
		"role": string(role), "sessionId": "session-1", "jti": "jti-1",
		"tokenVersion": 1, "exp": time.Now().Add(time.Hour).Unix(),
	})
	value, err := token.SignedString([]byte(routerTestSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return value
}
