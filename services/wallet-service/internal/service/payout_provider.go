package service

import (
	"context"
	"sync"

	"wallet-service/internal/domain"
)

type ProviderPayoutRequest struct {
	PayoutID          string
	IdempotencyKey    string
	AmountMinor       int64
	Currency          string
	BankCode          string
	AccountNumber     string
	AccountHolderName string
}

type ProviderPayoutResult struct {
	Status            domain.PayoutStatus
	ProviderReference string
	FailureCode       string
	FailureMessage    string
}

type PayoutProvider interface {
	Name() string
	CreatePayout(ctx context.Context, request ProviderPayoutRequest) (ProviderPayoutResult, error)
	GetPayout(ctx context.Context, providerReference, idempotencyKey string) (ProviderPayoutResult, error)
}

type MockPayoutProvider struct {
	mode    string
	mu      sync.RWMutex
	results map[string]ProviderPayoutResult
}

func NewMockPayoutProvider(mode string) *MockPayoutProvider {
	return &MockPayoutProvider{mode: mode, results: make(map[string]ProviderPayoutResult)}
}

func (p *MockPayoutProvider) Name() string { return "mock" }

func (p *MockPayoutProvider) CreatePayout(_ context.Context, request ProviderPayoutRequest) (ProviderPayoutResult, error) {
	providerReference := "mock_" + request.PayoutID
	result := p.resultFor(providerReference)
	p.mu.Lock()
	p.results[providerReference] = result
	p.mu.Unlock()
	return result, nil
}

func (p *MockPayoutProvider) resultFor(providerReference string) ProviderPayoutResult {
	result := ProviderPayoutResult{Status: domain.PayoutStatusSucceeded, ProviderReference: providerReference}
	switch p.mode {
	case "failure":
		result.Status = domain.PayoutStatusFailed
		result.FailureCode = "MOCK_REJECTED"
		result.FailureMessage = "Mock provider rejected the payout"
	case "pending":
		result.Status = domain.PayoutStatusProcessing
	}
	return result
}

func (p *MockPayoutProvider) GetPayout(_ context.Context, providerReference, _ string) (ProviderPayoutResult, error) {
	p.mu.RLock()
	result, ok := p.results[providerReference]
	p.mu.RUnlock()
	if ok {
		return result, nil
	}
	return p.resultFor(providerReference), nil
}
