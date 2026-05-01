package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"analytics-service/internal/domain"
	"analytics-service/internal/httpx"
	"analytics-service/internal/repository"
)

type AnalyticsService struct {
	repo                   *repository.AnalyticsRepository
	redis                  *RedisService
	ingestDedupeTTLSeconds int
}

func NewAnalyticsService(repo *repository.AnalyticsRepository, redis *RedisService, ingestDedupeTTLSeconds int) *AnalyticsService {
	return &AnalyticsService{
		repo:                   repo,
		redis:                  redis,
		ingestDedupeTTLSeconds: ingestDedupeTTLSeconds,
	}
}

func (s *AnalyticsService) IngestEvent(ctx context.Context, messageKey, messageValue, predefinedEventKey string) (map[string]any, error) {
	normalized := normalizeAnalyticsEvent(messageKey, messageValue, predefinedEventKey)
	if normalized.Record == nil {
		return map[string]any{"ingested": false, "reason": normalized.Reason}, nil
	}

	record := *normalized.Record
	dedupe, err := s.isDuplicate(ctx, record.EventKey)
	if err != nil {
		return nil, err
	}
	if dedupe.Duplicate {
		return map[string]any{
			"ingested":  false,
			"duplicate": true,
			"eventKey":  record.EventKey,
			"eventType": record.EventType,
		}, nil
	}

	if err := s.repo.InsertEvent(ctx, record); err != nil {
		if dedupe.RedisClaimed {
			_ = s.safeReleaseRedisClaim(ctx, record.EventKey)
		}
		return nil, err
	}

	return map[string]any{"ingested": true, "eventKey": record.EventKey, "eventType": record.EventType}, nil
}

func (s *AnalyticsService) GetOverview(ctx context.Context, user domain.UserContext, fromInput, toInput, sellerIDInput string) (map[string]any, error) {
	rangeInput, err := resolveDateRange(user, fromInput, toInput, sellerIDInput)
	if err != nil {
		return nil, err
	}

	overview, err := s.repo.QueryOverview(ctx, rangeInput)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"from":            rangeInput.From,
		"to":              rangeInput.To,
		"sellerId":        nullableString(rangeInput.SellerID),
		"totalEvents":     overview.TotalEvents,
		"uniqueOrders":    overview.UniqueOrders,
		"uniquePayments":  overview.UniquePayments,
		"uniqueShipments": overview.UniqueShipments,
		"capturedAmount":  overview.CapturedAmount,
		"refundedAmount":  overview.RefundedAmount,
	}, nil
}

func (s *AnalyticsService) GetTimeseries(ctx context.Context, user domain.UserContext, fromInput, toInput, sellerIDInput, interval, eventType string) (map[string]any, error) {
	rangeInput, err := resolveDateRange(user, fromInput, toInput, sellerIDInput)
	if err != nil {
		return nil, err
	}

	interval = strings.TrimSpace(interval)
	if interval == "" {
		interval = "day"
	}
	if interval != "hour" && interval != "day" {
		return nil, validationError("interval", "must be one of: hour, day")
	}

	items, err := s.repo.QueryTimeseries(ctx, rangeInput, interval, eventType)
	if err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		respItems = append(respItems, map[string]any{"bucket": item.Bucket, "eventType": item.EventType, "totalEvents": item.TotalEvents})
	}

	return map[string]any{
		"from":      rangeInput.From,
		"to":        rangeInput.To,
		"sellerId":  nullableString(rangeInput.SellerID),
		"interval":  interval,
		"eventType": nullableString(strings.TrimSpace(eventType)),
		"items":     respItems,
	}, nil
}

func (s *AnalyticsService) GetPaymentsSummary(ctx context.Context, user domain.UserContext, fromInput, toInput, sellerIDInput string) (map[string]any, error) {
	rangeInput, err := resolveDateRange(user, fromInput, toInput, sellerIDInput)
	if err != nil {
		return nil, err
	}

	items, err := s.repo.QueryPaymentsSummary(ctx, rangeInput)
	if err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		respItems = append(respItems, map[string]any{
			"eventType":           item.EventType,
			"status":              nullableStringPtr(item.Status),
			"totalEvents":         item.TotalEvents,
			"totalAmount":         item.TotalAmount,
			"totalRefundedAmount": item.TotalRefundedAmount,
		})
	}

	return map[string]any{"from": rangeInput.From, "to": rangeInput.To, "sellerId": nullableString(rangeInput.SellerID), "items": respItems}, nil
}

func (s *AnalyticsService) GetShippingSummary(ctx context.Context, user domain.UserContext, fromInput, toInput, sellerIDInput string) (map[string]any, error) {
	rangeInput, err := resolveDateRange(user, fromInput, toInput, sellerIDInput)
	if err != nil {
		return nil, err
	}

	items, err := s.repo.QueryShippingSummary(ctx, rangeInput)
	if err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		respItems = append(respItems, map[string]any{"eventType": item.EventType, "status": nullableStringPtr(item.Status), "totalEvents": item.TotalEvents})
	}

	return map[string]any{"from": rangeInput.From, "to": rangeInput.To, "sellerId": nullableString(rangeInput.SellerID), "items": respItems}, nil
}

type normalizeResult struct {
	Record *domain.AnalyticsEventRecord
	Reason string
}

func normalizeAnalyticsEvent(messageKey, messageValue, predefinedEventKey string) normalizeResult {
	var parsed any
	if err := json.Unmarshal([]byte(messageValue), &parsed); err != nil {
		return normalizeResult{Reason: "invalid-json"}
	}

	obj, ok := parsed.(map[string]any)
	if !ok {
		return normalizeResult{Reason: "invalid-envelope"}
	}

	payload := obj
	if p, ok := obj["payload"].(map[string]any); ok {
		payload = p
	}

	eventType := nullableString(anyToString(obj["eventType"]))
	if eventType == nil {
		eventType = nullableString(strings.TrimSpace(messageKey))
	}
	if eventType == nil {
		return normalizeResult{Reason: "missing-event-type"}
	}

	occurredAt := extractOccurredAt(obj, payload)
	eventKey := strings.TrimSpace(predefinedEventKey)
	if eventKey == "" {
		eventKey = buildEventKey(*eventType, payload, occurredAt)
	}

	sourceService := extractSourceService(*eventType)
	record := domain.AnalyticsEventRecord{
		EventKey:       eventKey,
		EventType:      *eventType,
		SourceService:  sourceService,
		OccurredAt:     occurredAt,
		SellerID:       nullableString(anyToString(payload["sellerId"])),
		UserID:         firstNotNil(nullableString(anyToString(payload["userId"])), nullableString(anyToString(payload["buyerId"]))),
		OrderID:        nullableString(anyToString(payload["orderId"])),
		PaymentID:      nullableString(anyToString(payload["paymentId"])),
		ShipmentID:     nullableString(anyToString(payload["shipmentId"])),
		Amount:         nullableNumber(payload["amount"]),
		RefundedAmount: nullableNumber(payload["refundedAmount"]),
		Currency:       nullableString(anyToString(payload["currency"])),
		Status:         nullableString(anyToString(payload["status"])),
		PayloadJSON:    toJSON(payload),
		CreatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
	}

	if record.RefundedAmount == nil && record.EventType == "payment.refunded" {
		record.RefundedAmount = record.Amount
	}

	return normalizeResult{Record: &record}
}

func extractOccurredAt(envelope map[string]any, payload map[string]any) string {
	envelopeTime := nullableString(anyToString(envelope["occurredAt"]))
	if envelopeTime != nil {
		if t, err := time.Parse(time.RFC3339Nano, *envelopeTime); err == nil {
			return t.UTC().Format(time.RFC3339Nano)
		}
	}

	if metadata, ok := payload["metadata"].(map[string]any); ok {
		metadataTime := nullableString(anyToString(metadata["occurredAt"]))
		if metadataTime != nil {
			if t, err := time.Parse(time.RFC3339Nano, *metadataTime); err == nil {
				return t.UTC().Format(time.RFC3339Nano)
			}
		}
	}

	return time.Now().UTC().Format(time.RFC3339Nano)
}

func extractSourceService(eventType string) *string {
	parts := strings.Split(strings.TrimSpace(eventType), ".")
	if len(parts) == 0 {
		return nil
	}
	source := strings.TrimSpace(parts[0])
	if source == "" {
		return nil
	}
	return &source
}

func buildEventKey(eventType string, payload map[string]any, occurredAt string) string {
	canonical := canonicalize(map[string]any{"eventType": eventType, "payload": payload, "occurredAt": occurredAt})
	hash := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(hash[:])
}

func canonicalize(value any) string {
	switch typed := value.(type) {
	case nil:
		return "null"
	case string:
		return toJSON(typed)
	case bool, float64, int64, int32, int16, int8, int, uint64, uint32, uint16, uint8, uint, float32:
		return toJSON(typed)
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			parts = append(parts, canonicalize(item))
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			parts = append(parts, toJSON(key)+":"+canonicalize(typed[key]))
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		data, err := json.Marshal(typed)
		if err != nil {
			return "null"
		}
		var normalized any
		if err := json.Unmarshal(data, &normalized); err != nil {
			return "null"
		}
		return canonicalize(normalized)
	}
}

type dedupeResult struct {
	Duplicate    bool
	RedisClaimed bool
}

func (s *AnalyticsService) isDuplicate(ctx context.Context, eventKey string) (dedupeResult, error) {
	if s.redis.Enabled() {
		redisKey := "analytics:event:" + eventKey
		redisClaimed := false

		inserted, err := s.redis.SetNX(ctx, redisKey, "1", time.Duration(s.ingestDedupeTTLSeconds)*time.Second)
		if err == nil {
			if !inserted {
				return dedupeResult{Duplicate: true, RedisClaimed: false}, nil
			}
			redisClaimed = true
		}

		exists, err := s.repo.HasEventKey(ctx, eventKey)
		if err != nil {
			if redisClaimed {
				_ = s.safeReleaseRedisClaim(ctx, eventKey)
			}
			return dedupeResult{}, err
		}
		if exists {
			return dedupeResult{Duplicate: true, RedisClaimed: redisClaimed}, nil
		}

		return dedupeResult{Duplicate: false, RedisClaimed: redisClaimed}, nil
	}

	exists, err := s.repo.HasEventKey(ctx, eventKey)
	if err != nil {
		return dedupeResult{}, err
	}
	return dedupeResult{Duplicate: exists, RedisClaimed: false}, nil
}

func (s *AnalyticsService) safeReleaseRedisClaim(ctx context.Context, eventKey string) error {
	if !s.redis.Enabled() {
		return nil
	}
	return s.redis.Delete(ctx, "analytics:event:"+eventKey)
}

func resolveDateRange(user domain.UserContext, fromInput, toInput, sellerIDInput string) (domain.AnalyticsDateRange, error) {
	toDate := time.Now().UTC()
	if toInput = strings.TrimSpace(toInput); toInput != "" {
		parsed, err := time.Parse(time.RFC3339, toInput)
		if err != nil {
			return domain.AnalyticsDateRange{}, invalidTimeRange()
		}
		toDate = parsed.UTC()
	}

	fromDate := toDate.Add(-7 * 24 * time.Hour)
	if fromInput = strings.TrimSpace(fromInput); fromInput != "" {
		parsed, err := time.Parse(time.RFC3339, fromInput)
		if err != nil {
			return domain.AnalyticsDateRange{}, invalidTimeRange()
		}
		fromDate = parsed.UTC()
	}

	if !fromDate.Before(toDate) {
		return domain.AnalyticsDateRange{}, invalidTimeRange()
	}

	if toDate.Sub(fromDate) > 365*24*time.Hour {
		return domain.AnalyticsDateRange{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeAnalyticsInvalidTimeRange, "Time range cannot exceed 365 days.", nil)
	}

	sellerID := strings.TrimSpace(sellerIDInput)
	if user.Role == domain.RoleSeller {
		sellerID = user.UserID
	}

	return domain.AnalyticsDateRange{From: fromDate.Format(time.RFC3339Nano), To: toDate.Format(time.RFC3339Nano), SellerID: sellerID}, nil
}

func invalidTimeRange() error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeAnalyticsInvalidTimeRange, "Invalid time range. Ensure from < to and both are valid ISO-8601 values.", nil)
}

func validationError(field, message string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", map[string]any{field: message})
}

func nullableString(v string) *string {
	value := strings.TrimSpace(v)
	if value == "" {
		return nil
	}
	return &value
}

func nullableStringPtr(v *string) any {
	if v == nil {
		return nil
	}
	return *v
}

func firstNotNil(values ...*string) *string {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func anyToString(v any) string {
	switch typed := v.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func nullableNumber(v any) *float64 {
	switch typed := v.(type) {
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return nil
		}
		return &typed
	case int:
		value := float64(typed)
		return &value
	case int64:
		value := float64(typed)
		return &value
	case string:
		value := strings.TrimSpace(typed)
		if value == "" {
			return nil
		}
		parsed, err := strconv.ParseFloat(value, 64)
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func toJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(data)
}
