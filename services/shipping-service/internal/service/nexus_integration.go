package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"shipping-service/internal/domain"
	"shipping-service/internal/nexus"
	"shipping-service/internal/repository"

	"github.com/jackc/pgx/v5"
)

type NexusIntegration struct {
	Enabled          bool
	WebhookEnabled   bool
	Client           *nexus.Client
	WebhookSecret    string
	Mappings         map[string]nexus.MerchantMapping
	AutoCreatePickup bool
	ServiceType      string
	PickupType       string
	PaymentPayer     string
	WeightGram       int
	LengthCM         int
	WidthCM          int
	HeightCM         int
}

type NexusWebhookHeaders struct {
	PartnerCode string
	Timestamp   string
	Nonce       string
	EventID     string
	Signature   string
}

func (s *ShippingService) enqueueNexusCreateOrder(ctx context.Context, tx pgx.Tx, shipment domain.Shipment, orderPayload map[string]any) error {
	if s.nexus.Client == nil {
		return fmt.Errorf("Nexus client is not configured")
	}
	mapping, ok := s.nexus.Mappings[shipment.SellerID]
	if !ok {
		return fmt.Errorf("Nexus merchant mapping is missing for seller %s", shipment.SellerID)
	}

	items, declaredValue, err := nexusItemsFromOrderEvent(orderPayload["items"])
	if err != nil {
		return err
	}
	if subtotal := asNonNegativeNumber(orderPayload["subtotalAmount"]); subtotal != nil {
		declaredValue = *subtotal
		if discount := asNonNegativeNumber(orderPayload["discountAmount"]); discount != nil && *discount <= declaredValue {
			declaredValue -= *discount
		}
	}
	orderCreatedAt := asString(orderPayload["createdAt"])
	if orderCreatedAt == "" {
		orderCreatedAt = shipment.CreatedAt.UTC().Format(time.RFC3339)
	}
	paymentMethod := strings.ToUpper(asString(orderPayload["paymentMethod"]))

	input := nexus.CreateOrderRequest{
		External: nexus.ExternalOrder{
			Platform:          s.nexus.Client.PartnerCode(),
			ShopID:            shipment.SellerID,
			ExternalOrderID:   shipment.OrderID,
			ExternalOrderCode: asString(orderPayload["orderNumber"]),
			OrderCreatedAt:    orderCreatedAt,
			OrderStatus:       "READY_TO_SHIP",
		},
		Merchant: nexus.Merchant{MerchantID: mapping.MerchantID, ShopName: mapping.ShopName},
		Sender:   mapping.Sender,
		Receiver: nexus.Receiver{
			Name:     shipment.RecipientName,
			Phone:    shipment.RecipientPhone,
			Address:  shipment.RecipientAddress,
			Ward:     asString(orderPayload["recipientWard"]),
			District: asString(orderPayload["recipientDistrict"]),
			Province: asString(orderPayload["recipientProvince"]),
			Note:     asString(orderPayload["note"]),
		},
		Parcel: nexus.Parcel{
			Items:         items,
			WeightGram:    s.nexus.WeightGram,
			LengthCM:      s.nexus.LengthCM,
			WidthCM:       s.nexus.WidthCM,
			HeightCM:      s.nexus.HeightCM,
			DeclaredValue: roundMoney(declaredValue),
		},
		Service: nexus.DeliveryService{ServiceType: s.nexus.ServiceType, PickupType: s.nexus.PickupType},
		Payment: nexus.Payment{
			CODAmount:              shipment.CODAmount,
			ShippingFee:            shipment.ShippingFee,
			Payer:                  s.nexus.PaymentPayer,
			CODIncludesShippingFee: paymentMethod == "COD",
		},
		Options: nexus.CreateOptions{AutoCreatePickup: s.nexus.AutoCreatePickup, PrintLabelFormat: "A6"},
	}
	payload, err := structToMap(input)
	if err != nil {
		return err
	}
	return s.repo.CreateProviderRequest(ctx, tx, repository.CreateProviderRequestInput{
		ShipmentID:     shipment.ID,
		Provider:       "NEXUS",
		Action:         "CREATE_ORDER",
		IdempotencyKey: s.nexus.Client.PartnerCode() + ":" + shipment.SellerID + ":" + shipment.OrderID,
		RequestPayload: payload,
	})
}

func nexusItemsFromOrderEvent(raw any) ([]nexus.ParcelItem, float64, error) {
	rawItems, ok := raw.([]any)
	if !ok || len(rawItems) == 0 {
		return nil, 0, fmt.Errorf("confirmed order event does not contain items")
	}
	items := make([]nexus.ParcelItem, 0, len(rawItems))
	declaredValue := 0.0
	for _, rawItem := range rawItems {
		item, ok := rawItem.(map[string]any)
		if !ok {
			return nil, 0, fmt.Errorf("confirmed order event contains an invalid item")
		}
		quantity := asNonNegativeNumber(item["quantity"])
		unitPrice := asNonNegativeNumber(item["unitPrice"])
		if asString(item["sku"]) == "" || quantity == nil || unitPrice == nil || *quantity < 1 {
			return nil, 0, fmt.Errorf("confirmed order event contains incomplete parcel item data")
		}
		quantityInt := int(math.Round(*quantity))
		items = append(items, nexus.ParcelItem{
			SKU:       asString(item["sku"]),
			Name:      asString(item["productName"]),
			Quantity:  quantityInt,
			UnitPrice: roundMoney(*unitPrice),
		})
		declaredValue += float64(quantityInt) * *unitPrice
	}
	return items, declaredValue, nil
}

func (s *ShippingService) DispatchNexusProviderRequests(ctx context.Context, batchSize, maxRetry int) error {
	if !s.nexus.Enabled || s.nexus.Client == nil {
		return nil
	}
	requests, err := s.repo.ClaimProviderRequests(ctx, batchSize)
	if err != nil {
		return err
	}
	for _, request := range requests {
		if err := s.dispatchNexusCreateOrder(ctx, request); err != nil {
			retryCount := request.RetryCount + 1
			var nextRetryAt *time.Time
			if shouldRetryNexus(err) && retryCount < maxRetry {
				delay := time.Duration(nexusMinInt(1<<nexusMinInt(retryCount, 8), 300)) * time.Second
				next := time.Now().UTC().Add(delay)
				nextRetryAt = &next
			}
			if markErr := s.repo.MarkProviderRequestFailed(ctx, request.ID, retryCount, nextRetryAt, truncateError(err.Error(), 1000)); markErr != nil {
				return markErr
			}
		}
	}
	return nil
}

func (s *ShippingService) HandleNexusWebhook(ctx context.Context, requestID string, headers NexusWebhookHeaders, rawBody []byte) (map[string]any, error) {
	if !s.nexus.WebhookEnabled || s.nexus.Client == nil || strings.TrimSpace(s.nexus.WebhookSecret) == "" {
		return nil, fmt.Errorf("Nexus webhook integration is not enabled")
	}
	timestamp, err := time.Parse(time.RFC3339, strings.TrimSpace(headers.Timestamp))
	if err != nil || time.Since(timestamp).Abs() > 5*time.Minute {
		return nil, fmt.Errorf("Nexus webhook timestamp is invalid or expired")
	}
	if strings.TrimSpace(headers.Nonce) == "" || strings.TrimSpace(headers.EventID) == "" ||
		!nexus.VerifySignature(http.MethodPost, "/api/v1/shipments/webhooks/nexus", headers.Timestamp, headers.Nonce, rawBody, s.nexus.WebhookSecret, headers.Signature) {
		return nil, fmt.Errorf("invalid Nexus webhook signature")
	}
	if partnerCode := s.nexus.Client.PartnerCode(); partnerCode != "" && strings.TrimSpace(headers.PartnerCode) != partnerCode {
		return nil, fmt.Errorf("invalid Nexus webhook partner code")
	}

	var event nexus.WebhookEvent
	if err := json.Unmarshal(rawBody, &event); err != nil {
		return nil, fmt.Errorf("invalid Nexus webhook payload: %w", err)
	}
	eventID := strings.TrimSpace(event.EventID)
	if eventID == "" {
		eventID = strings.TrimSpace(headers.EventID)
	}
	if eventID != strings.TrimSpace(headers.EventID) {
		return nil, fmt.Errorf("Nexus webhook event id does not match header")
	}
	if strings.EqualFold(strings.TrimSpace(event.EventType), "webhook.ping") {
		return map[string]any{"processed": true, "provider": "nexus", "eventId": eventID, "eventType": "webhook.ping"}, nil
	}

	status, ok := nexusShipmentStatus(asString(event.Data["currentStatus"]))
	if !ok {
		return nil, fmt.Errorf("unsupported Nexus shipment status")
	}
	orderID := asString(event.Data["externalOrderId"])
	shipmentCode := asString(event.Data["shipmentCode"])
	description := asString(event.Data["statusDescription"])
	if description == "" {
		description = asString(event.Data["reason"])
	}
	location := ""
	if locationData, ok := event.Data["location"].(map[string]any); ok {
		location = asString(locationData["hubName"])
	}
	req := ShippingWebhookRequest{
		ProviderEventID: eventID,
		OrderID:         strPtr(orderID),
		AWB:             strPtr(shipmentCode),
		TrackingNumber:  strPtr(shipmentCode),
		Status:          status,
		OccurredAt:      strPtr(event.OccurredAt),
		EventCode:       strPtr(asString(event.Data["currentStatus"])),
		Description:     strPtr(description),
		Location:        strPtr(location),
		RawPayload:      event.Data,
	}
	return s.HandleProviderWebhook(ctx, requestID, "nexus", s.internalWebhookSignature("nexus", req), req)
}

func nexusShipmentStatus(value string) (domain.ShipmentStatus, bool) {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "CREATED":
		return domain.ShipmentStatusAWBCreated, true
	case "UPDATED", "TASK_ASSIGNED":
		return domain.ShipmentStatusAWBCreated, true
	case "PICKUP_COMPLETED":
		return domain.ShipmentStatusPickedUp, true
	case "MANIFEST_SEALED", "SEND_GOODS", "IN_TRANSIT", "MANIFEST_RECEIVED", "MANIFEST_UNSEALED", "SCAN_INBOUND", "SCAN_OUTBOUND", "INVENTORY_CHECK":
		return domain.ShipmentStatusInTransit, true
	case "DELIVERED":
		return domain.ShipmentStatusDelivered, true
	case "DELIVERY_FAILED", "NDR_CREATED", "EXCEPTION":
		return domain.ShipmentStatusFailed, true
	case "RETURN_STARTED", "RETURN_COMPLETED":
		return domain.ShipmentStatusReturned, true
	case "CANCELLED":
		return domain.ShipmentStatusCancelled, true
	default:
		return "", false
	}
}

func (s *ShippingService) internalWebhookSignature(provider string, req ShippingWebhookRequest) string {
	mac := hmac.New(sha256.New, []byte(s.webhookSigningSecret))
	_, _ = mac.Write([]byte(canonicalize(map[string]any{"provider": provider, "payload": req})))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *ShippingService) dispatchNexusCreateOrder(ctx context.Context, request domain.ProviderRequest) error {
	var input nexus.CreateOrderRequest
	data, err := json.Marshal(request.RequestPayload)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, &input); err != nil {
		return err
	}
	response, err := s.nexus.Client.CreateOrder(ctx, request.IdempotencyKey, input)
	if err != nil {
		return err
	}
	shipmentCode := strings.TrimSpace(response.Data.ShipmentCode)
	if shipmentCode == "" {
		return fmt.Errorf("Nexus create order response is missing shipmentCode")
	}
	responsePayload, err := structToMap(response)
	if err != nil {
		return err
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	shipment, err := s.repo.FindShipmentByIDForUpdate(ctx, tx, request.ShipmentID)
	if err != nil || shipment == nil {
		if err != nil {
			return err
		}
		return fmt.Errorf("shipment not found for Nexus provider request")
	}
	metadata := shipment.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadata["nexus"] = map[string]any{
		"trackingUrl": response.Data.TrackingURL,
		"pickupCode":  response.Data.Pickup.PickupCode,
		"labelUrl":    response.Data.Label.URL,
		"status":      response.Data.Status,
		"createdAt":   response.Data.CreatedAt,
	}
	targetStatus := shipment.Status
	if targetStatus == domain.ShipmentStatusPending {
		targetStatus = domain.ShipmentStatusAWBCreated
	}
	updated, err := s.repo.UpdateShipmentProviderResult(ctx, tx, shipment.ID, shipmentCode, shipmentCode, targetStatus, metadata)
	if err != nil {
		return err
	}
	if shipment.Status == domain.ShipmentStatusPending {
		if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
			ShipmentID: updated.ID, FromStatus: &shipment.Status, ToStatus: updated.Status,
			ChangedBy: systemActorID, ChangedByRole: domain.RoleSuperAdmin, Reason: strPtr("Nexus created AWB"),
		}); err != nil {
			return err
		}
		if err := s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentStatusUpdated, updated, domain.UserContext{UserID: systemActorID, Role: domain.RoleSuperAdmin}, "nexus-create-order"); err != nil {
			return err
		}
	}
	if _, err := s.repo.CreateTrackingEvent(ctx, tx, repository.CreateTrackingEventInput{
		ShipmentID: updated.ID, Status: domain.ShipmentStatusAWBCreated,
		EventCode: strPtr("CREATED"), Description: strPtr("Nexus created shipment"),
		OccurredAt: time.Now().UTC(), RawPayload: responsePayload,
	}); err != nil {
		return err
	}
	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		ShipmentID: updated.ID, Action: "NEXUS_ORDER_CREATED", ActorID: systemActorID,
		ActorRole: domain.RoleSuperAdmin, RequestID: "nexus-create-order",
		Metadata: map[string]any{"shipmentCode": shipmentCode, "providerRequestId": request.ID},
	}); err != nil {
		return err
	}
	if err := s.repo.MarkProviderRequestSucceeded(ctx, tx, request.ID, responsePayload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func shouldRetryNexus(err error) bool {
	var apiErr *nexus.APIError
	if errors.As(err, &apiErr) {
		return apiErr.Status == http.StatusTooManyRequests || apiErr.Status >= 500
	}
	return true
}

func structToMap(value any) (map[string]any, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func truncateError(value string, maximum int) string {
	if len(value) <= maximum {
		return value
	}
	return value[:maximum]
}

func nexusMinInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
