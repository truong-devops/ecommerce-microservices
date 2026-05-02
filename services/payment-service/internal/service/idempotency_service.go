package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"payment-service-go/internal/domain"
	"payment-service-go/internal/httpx"
	"payment-service-go/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type AcquireResult struct {
	Replay       bool
	RequestHash  string
	LockKey      string
	ResponseBody map[string]any
}

type IdempotencyService struct {
	repo             *repository.PaymentRepository
	redis            *RedisService
	recordTTLMinutes int
	lockTTLSeconds   int
}

func NewIdempotencyService(repo *repository.PaymentRepository, redis *RedisService, recordTTLMinutes, lockTTLSeconds int) *IdempotencyService {
	return &IdempotencyService{
		repo:             repo,
		redis:            redis,
		recordTTLMinutes: recordTTLMinutes,
		lockTTLSeconds:   lockTTLSeconds,
	}
}

func (s *IdempotencyService) AcquireForCreatePaymentIntent(ctx context.Context, userID, idempotencyKey string, requestBody any) (AcquireResult, error) {
	requestHash, err := hashValue(requestBody)
	if err != nil {
		return AcquireResult{}, httpx.NewAppError(http.StatusInternalServerError, domain.ErrorCodeInternalServerError, "Failed to hash request payload", nil)
	}

	existing, err := s.repo.FindIdempotencyRecord(ctx, userID, idempotencyKey)
	if err != nil {
		return AcquireResult{}, err
	}
	if existing != nil {
		return s.handleExisting(*existing, requestHash)
	}

	lockKey := "idem:lock:" + userID + ":" + idempotencyKey
	lockOK, err := s.redis.SetNXWithTTL(ctx, lockKey, uuid.NewString(), time.Duration(s.lockTTLSeconds)*time.Second)
	if err != nil {
		return AcquireResult{}, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Failed to acquire idempotency lock", nil)
	}
	if !lockOK {
		return AcquireResult{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeIdempotencyConflict, "Request with this idempotency key is in progress", nil)
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		_ = s.redis.Del(ctx, lockKey)
		return AcquireResult{}, err
	}
	defer tx.Rollback(ctx)

	insertErr := s.repo.CreateIdempotencyRecord(ctx, tx, repository.IdempotencyRecord{
		UserID:         userID,
		IdempotencyKey: idempotencyKey,
		RequestHash:    requestHash,
		PaymentID:      nil,
		ResponseStatus: nil,
		ResponseBody:   nil,
		ExpiresAt:      time.Now().UTC().Add(time.Duration(s.recordTTLMinutes) * time.Minute),
	})

	if insertErr != nil {
		_ = s.redis.Del(ctx, lockKey)
		concurrent, findErr := s.repo.FindIdempotencyRecord(ctx, userID, idempotencyKey)
		if findErr != nil {
			return AcquireResult{}, findErr
		}
		if concurrent != nil {
			return s.handleExisting(*concurrent, requestHash)
		}
		return AcquireResult{}, insertErr
	}

	if err := tx.Commit(ctx); err != nil {
		_ = s.redis.Del(ctx, lockKey)
		return AcquireResult{}, err
	}

	return AcquireResult{Replay: false, RequestHash: requestHash, LockKey: lockKey}, nil
}

func (s *IdempotencyService) PersistResult(
	ctx context.Context,
	tx pgx.Tx,
	userID,
	idempotencyKey,
	requestHash string,
	responseStatus int,
	responseBody map[string]any,
	paymentID string,
) error {
	existing, err := s.repo.FindIdempotencyRecord(ctx, userID, idempotencyKey)
	if err != nil {
		return err
	}
	if existing == nil {
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeIdempotencyConflict, "Idempotency record not found", nil)
	}
	if existing.RequestHash != requestHash {
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeIdempotencyConflict, "Idempotency key is already used with different payload", nil)
	}

	return s.repo.UpdateIdempotencyResult(
		ctx,
		tx,
		userID,
		idempotencyKey,
		requestHash,
		responseStatus,
		responseBody,
		paymentID,
		time.Now().UTC().Add(time.Duration(s.recordTTLMinutes)*time.Minute),
	)
}

func (s *IdempotencyService) ReleaseLock(ctx context.Context, lockKey string) {
	if lockKey == "" {
		return
	}
	_ = s.redis.Del(ctx, lockKey)
}

func (s *IdempotencyService) handleExisting(existing repository.IdempotencyRecord, requestHash string) (AcquireResult, error) {
	if existing.RequestHash != requestHash {
		return AcquireResult{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeIdempotencyConflict, "Idempotency key is already used with different payload", nil)
	}
	if existing.ResponseBody != nil {
		return AcquireResult{Replay: true, RequestHash: requestHash, ResponseBody: existing.ResponseBody}, nil
	}
	return AcquireResult{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeIdempotencyConflict, "Request with this idempotency key is in progress", nil)
}

func hashValue(value any) (string, error) {
	b, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), nil
}
