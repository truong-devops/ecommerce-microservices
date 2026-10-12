package service

import (
	"context"
	"fmt"
	"time"

	"wallet-service/internal/domain"
	"wallet-service/internal/repository"

	"go.uber.org/zap"
)

type PayoutWorker struct {
	store                                   PayoutStore
	provider                                PayoutProvider
	cipher                                  *BankAccountCipher
	logger                                  *zap.Logger
	interval, reconcileInterval, staleAfter time.Duration
	batch                                   int
	now                                     func() time.Time
	metrics                                 PayoutMetrics
}

func NewPayoutWorker(store PayoutStore, provider PayoutProvider, cipher *BankAccountCipher, logger *zap.Logger, interval, reconcileInterval, staleAfter time.Duration, batch int) *PayoutWorker {
	return &PayoutWorker{store: store, provider: provider, cipher: cipher, logger: logger, interval: interval, reconcileInterval: reconcileInterval, staleAfter: staleAfter, batch: batch, now: func() time.Time { return time.Now().UTC() }, metrics: noopPayoutMetrics{}}
}

func (w *PayoutWorker) SetMetrics(metrics PayoutMetrics) {
	if metrics != nil {
		w.metrics = metrics
	}
}

func (w *PayoutWorker) Run(ctx context.Context) {
	processTicker := time.NewTicker(w.interval)
	reconcileTicker := time.NewTicker(w.reconcileInterval)
	defer processTicker.Stop()
	defer reconcileTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-processTicker.C:
			if _, err := w.Process(ctx); err != nil {
				w.logger.Error("process payouts failed", zap.Error(err))
			}
		case <-reconcileTicker.C:
			if _, err := w.Reconcile(ctx); err != nil {
				w.logger.Error("reconcile payouts failed", zap.Error(err))
			}
		}
	}
}

func (w *PayoutWorker) Process(ctx context.Context) (int, error) {
	jobs, err := w.store.ClaimPayouts(ctx, w.now(), w.batch)
	if err != nil {
		return 0, err
	}
	completed := 0
	for _, job := range jobs {
		accountNumber, decryptErr := w.cipher.Decrypt(job.EncryptedAccountNumber, job.EncryptionNonce)
		if decryptErr != nil {
			_ = w.store.ReschedulePayout(ctx, job.PayoutID, w.now().Add(time.Minute))
			return completed, decryptErr
		}
		result, providerErr := w.provider.CreatePayout(ctx, ProviderPayoutRequest{PayoutID: job.PayoutID, IdempotencyKey: job.IdempotencyKey, AmountMinor: job.AmountMinor, Currency: job.Currency, BankCode: job.BankCode, AccountNumber: accountNumber, AccountHolderName: job.AccountHolderName})
		accountNumber = ""
		if providerErr != nil {
			w.metrics.RecordProviderRetry()
			if err := w.store.ReschedulePayout(ctx, job.PayoutID, w.now().Add(5*time.Second)); err != nil {
				return completed, err
			}
			continue
		}
		changed, err := w.applyResult(ctx, job, result)
		if err != nil {
			return completed, err
		}
		if changed {
			completed++
		}
	}
	return completed, nil
}

func (w *PayoutWorker) Reconcile(ctx context.Context) (int, error) {
	now := w.now()
	jobs, err := w.store.FindStalePayouts(ctx, now.Add(-w.staleAfter), w.batch)
	if err != nil {
		return 0, err
	}
	completed := 0
	for _, job := range jobs {
		var result ProviderPayoutResult
		if job.ProviderReference == nil || *job.ProviderReference == "" {
			accountNumber, err := w.cipher.Decrypt(job.EncryptedAccountNumber, job.EncryptionNonce)
			if err != nil {
				return completed, err
			}
			result, err = w.provider.CreatePayout(ctx, ProviderPayoutRequest{PayoutID: job.PayoutID, IdempotencyKey: job.IdempotencyKey, AmountMinor: job.AmountMinor, Currency: job.Currency, BankCode: job.BankCode, AccountNumber: accountNumber, AccountHolderName: job.AccountHolderName})
			accountNumber = ""
			if err != nil {
				continue
			}
		} else {
			result, err = w.provider.GetPayout(ctx, *job.ProviderReference, job.IdempotencyKey)
			if err != nil {
				continue
			}
		}
		changed, err := w.applyResult(ctx, job, result)
		if err != nil {
			return completed, err
		}
		if changed {
			completed++
		}
	}
	return completed, nil
}

func (w *PayoutWorker) applyResult(ctx context.Context, job repository.PayoutJob, result ProviderPayoutResult) (bool, error) {
	switch result.Status {
	case domain.PayoutStatusSucceeded, domain.PayoutStatusFailed:
		changed, err := w.store.CompletePayout(ctx, repository.CompletePayoutInput{PayoutID: job.PayoutID, Provider: w.provider.Name(), ProviderReference: result.ProviderReference, FailureCode: result.FailureCode, FailureMessage: result.FailureMessage, Status: result.Status, ProcessedAt: w.now()})
		if err == nil && changed {
			w.metrics.RecordPayoutCompleted(string(result.Status))
		}
		return changed, err
	case domain.PayoutStatusProcessing:
		return false, w.store.MarkPayoutPending(ctx, job.PayoutID, w.provider.Name(), result.ProviderReference, w.now())
	default:
		return false, fmt.Errorf("provider returned unsupported payout status %s", result.Status)
	}
}
