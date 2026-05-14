package service

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cart-service/internal/domain"
	"cart-service/internal/httpx"
	"cart-service/internal/repository"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

type CartService struct {
	repo             *repository.CartRepository
	redis            *RedisService
	logger           *zap.Logger
	validationClient *CartValidationClient
	eventsPublisher  *CartEventsPublisher
	ttlSeconds       int
	maxQtyPerItem    int
	defaultCurrency  string
}

type AddCartItemRequest struct {
	ProductID       string
	VariantID       *string
	SKU             string
	Name            string
	Image           *string
	UnitPrice       float64
	Quantity        int
	SellerID        string
	Metadata        map[string]any
	Currency        *string
	ExpectedVersion *int
}

type UpdateCartItemRequest struct {
	Quantity        int
	ExpectedVersion *int
}

func NewCartService(
	repo *repository.CartRepository,
	redis *RedisService,
	logger *zap.Logger,
	validationClient *CartValidationClient,
	eventsPublisher *CartEventsPublisher,
	ttlSeconds int,
	maxQtyPerItem int,
	defaultCurrency string,
) *CartService {
	return &CartService{
		repo:             repo,
		redis:            redis,
		logger:           logger,
		validationClient: validationClient,
		eventsPublisher:  eventsPublisher,
		ttlSeconds:       ttlSeconds,
		maxQtyPerItem:    maxQtyPerItem,
		defaultCurrency:  strings.ToUpper(defaultCurrency),
	}
}

func (s *CartService) GetCart(ctx context.Context, user domain.UserContext) (domain.CartSnapshot, error) {
	if err := s.assertBuyer(user); err != nil {
		return domain.CartSnapshot{}, err
	}
	return s.loadOrCreateCart(ctx, user.UserID)
}

func (s *CartService) AddItem(ctx context.Context, user domain.UserContext, requestID string, req AddCartItemRequest) (domain.CartSnapshot, error) {
	if err := s.assertBuyer(user); err != nil {
		return domain.CartSnapshot{}, err
	}

	cart, err := s.loadOrCreateCart(ctx, user.UserID)
	if err != nil {
		return domain.CartSnapshot{}, err
	}
	if err := s.assertExpectedVersion(req.ExpectedVersion, cart.Version); err != nil {
		return domain.CartSnapshot{}, err
	}
	if err := s.assertQuantity(req.Quantity); err != nil {
		return domain.CartSnapshot{}, err
	}

	currency := cart.Currency
	if req.Currency != nil && strings.TrimSpace(*req.Currency) != "" {
		currency = strings.ToUpper(strings.TrimSpace(*req.Currency))
	}
	if len(cart.Items) == 0 {
		cart.Currency = currency
	}

	mergeKey := buildMergeKey(req.ProductID, req.VariantID, req.SellerID)
	existingIndex := -1
	nextQty := req.Quantity
	for idx := range cart.Items {
		if buildMergeKey(cart.Items[idx].ProductID, cart.Items[idx].VariantID, cart.Items[idx].SellerID) == mergeKey {
			existingIndex = idx
			nextQty = cart.Items[idx].Quantity + req.Quantity
			break
		}
	}
	if err := s.assertQuantity(nextQty); err != nil {
		return domain.CartSnapshot{}, err
	}

	candidate := domain.CartItem{
		ProductID: strings.TrimSpace(req.ProductID),
		VariantID: req.VariantID,
		SKU:       strings.TrimSpace(req.SKU),
		Name:      strings.TrimSpace(req.Name),
		Image:     req.Image,
		UnitPrice: roundMoney(req.UnitPrice),
		Quantity:  nextQty,
		SellerID:  strings.TrimSpace(req.SellerID),
		Metadata:  req.Metadata,
	}
	resolved, issues, err := s.validationClient.ValidateAndResolveItem(ctx, candidate, cart.Currency, true)
	if err != nil {
		return domain.CartSnapshot{}, err
	}
	if len(issues) > 0 {
		return domain.CartSnapshot{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, joinIssueMessages(issues), issues)
	}

	authoritativeName := strings.TrimSpace(resolved.Name)
	if authoritativeName == "" {
		authoritativeName = strings.TrimSpace(req.Name)
	}
	authoritativeUnitPrice := roundMoney(resolved.UnitPrice)

	var affected *domain.CartItem
	if existingIndex == -1 {
		item := domain.CartItem{
			ID:        uuid.NewString(),
			ProductID: strings.TrimSpace(req.ProductID),
			VariantID: req.VariantID,
			SKU:       strings.TrimSpace(req.SKU),
			Name:      authoritativeName,
			Image:     req.Image,
			UnitPrice: authoritativeUnitPrice,
			Quantity:  nextQty,
			LineTotal: roundMoney(authoritativeUnitPrice * float64(nextQty)),
			SellerID:  strings.TrimSpace(req.SellerID),
			Metadata:  req.Metadata,
		}
		if item.Metadata == nil {
			item.Metadata = map[string]any{}
		}
		cart.Items = append(cart.Items, item)
		affected = &cart.Items[len(cart.Items)-1]
	} else {
		item := &cart.Items[existingIndex]
		item.Quantity = nextQty
		item.UnitPrice = authoritativeUnitPrice
		item.Name = authoritativeName
		item.SKU = strings.TrimSpace(req.SKU)
		if req.Image != nil {
			item.Image = req.Image
		}
		if req.Metadata != nil {
			item.Metadata = req.Metadata
		}
		item.LineTotal = roundMoney(item.UnitPrice * float64(item.Quantity))
		affected = item
	}

	s.recalculateCart(&cart, true)
	if err := s.persistCart(ctx, &cart); err != nil {
		return domain.CartSnapshot{}, err
	}
	s.eventsPublisher.PublishCartItemAdded(ctx, cart, *affected, user, requestID)
	return cart, nil
}

func (s *CartService) UpdateItem(ctx context.Context, user domain.UserContext, requestID, itemID string, req UpdateCartItemRequest) (domain.CartSnapshot, error) {
	if err := s.assertBuyer(user); err != nil {
		return domain.CartSnapshot{}, err
	}

	cart, found, err := s.loadCart(ctx, user.UserID, false)
	if err != nil {
		return domain.CartSnapshot{}, err
	}
	if !found {
		return domain.CartSnapshot{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeCartNotFound, "Cart not found", nil)
	}
	if err := s.assertExpectedVersion(req.ExpectedVersion, cart.Version); err != nil {
		return domain.CartSnapshot{}, err
	}

	foundIdx := -1
	for idx := range cart.Items {
		if cart.Items[idx].ID == itemID {
			foundIdx = idx
			break
		}
	}
	if foundIdx == -1 {
		return domain.CartSnapshot{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeCartItemNotFound, "Cart item not found", nil)
	}

	item := cart.Items[foundIdx]
	if req.Quantity == 0 {
		cart.Items = append(cart.Items[:foundIdx], cart.Items[foundIdx+1:]...)
		s.recalculateCart(&cart, true)
		if err := s.persistCart(ctx, &cart); err != nil {
			return domain.CartSnapshot{}, err
		}
		s.eventsPublisher.PublishCartItemRemoved(ctx, cart, item, user, requestID)
		return cart, nil
	}

	if err := s.assertQuantity(req.Quantity); err != nil {
		return domain.CartSnapshot{}, err
	}
	candidate := cart.Items[foundIdx]
	candidate.Quantity = req.Quantity
	resolved, issues, err := s.validationClient.ValidateAndResolveItem(ctx, candidate, cart.Currency, true)
	if err != nil {
		return domain.CartSnapshot{}, err
	}
	if len(issues) > 0 {
		return domain.CartSnapshot{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, joinIssueMessages(issues), issues)
	}
	cart.Items[foundIdx].Quantity = req.Quantity
	cart.Items[foundIdx].UnitPrice = roundMoney(resolved.UnitPrice)
	if strings.TrimSpace(resolved.Name) != "" {
		cart.Items[foundIdx].Name = strings.TrimSpace(resolved.Name)
	}
	cart.Items[foundIdx].LineTotal = roundMoney(cart.Items[foundIdx].UnitPrice * float64(req.Quantity))

	s.recalculateCart(&cart, true)
	if err := s.persistCart(ctx, &cart); err != nil {
		return domain.CartSnapshot{}, err
	}
	s.eventsPublisher.PublishCartItemUpdated(ctx, cart, cart.Items[foundIdx], user, requestID)
	return cart, nil
}

func (s *CartService) RemoveItem(ctx context.Context, user domain.UserContext, requestID, itemID string) (domain.CartSnapshot, error) {
	return s.UpdateItem(ctx, user, requestID, itemID, UpdateCartItemRequest{Quantity: 0})
}

func (s *CartService) ClearCart(ctx context.Context, user domain.UserContext, requestID string) (domain.CartSnapshot, error) {
	if err := s.assertBuyer(user); err != nil {
		return domain.CartSnapshot{}, err
	}

	existing, found, err := s.loadCart(ctx, user.UserID, false)
	if err != nil {
		return domain.CartSnapshot{}, err
	}

	if err := s.redis.Del(ctx, buildCartCacheKey(user.UserID)); err != nil {
		s.logger.Warn("redis del cart failed", zap.Error(err))
	}
	if err := s.repo.DeleteByUserID(ctx, user.UserID); err != nil {
		return domain.CartSnapshot{}, err
	}
	if found {
		s.eventsPublisher.PublishCartCleared(ctx, existing.ID, user.UserID, user, requestID)
	}
	return s.createEmptyCart(user.UserID), nil
}

func (s *CartService) ValidateCart(ctx context.Context, user domain.UserContext, includeExternal bool) (map[string]any, error) {
	if err := s.assertBuyer(user); err != nil {
		return nil, err
	}
	cart, err := s.loadOrCreateCart(ctx, user.UserID)
	if err != nil {
		return nil, err
	}

	issues := make([]domain.CartValidationIssue, 0)
	for _, item := range cart.Items {
		if item.Quantity <= 0 {
			issues = append(issues, domain.CartValidationIssue{
				Code:    domain.ErrorCodeCartQuantityInvalid,
				Message: "Item quantity must be greater than 0",
				ItemID:  item.ID,
				SKU:     item.SKU,
			})
		}
		if item.Quantity > s.maxQtyPerItem {
			issues = append(issues, domain.CartValidationIssue{
				Code:    domain.ErrorCodeCartQuantityExceeded,
				Message: "Item quantity exceeds max " + intToString(s.maxQtyPerItem),
				ItemID:  item.ID,
				SKU:     item.SKU,
			})
		}
		externalIssues, err := s.validationClient.ValidateItem(ctx, item, includeExternal)
		if err != nil {
			return nil, err
		}
		issues = append(issues, externalIssues...)
	}

	return map[string]any{
		"cart":   cart,
		"valid":  len(issues) == 0,
		"issues": issues,
	}, nil
}

func (s *CartService) loadOrCreateCart(ctx context.Context, userID string) (domain.CartSnapshot, error) {
	cart, found, err := s.loadCart(ctx, userID, true)
	if err != nil {
		return domain.CartSnapshot{}, err
	}
	if !found {
		return domain.CartSnapshot{}, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Unable to initialize cart", nil)
	}
	return cart, nil
}

func (s *CartService) loadCart(ctx context.Context, userID string, createIfMissing bool) (domain.CartSnapshot, bool, error) {
	if raw, err := s.redis.Get(ctx, buildCartCacheKey(userID)); err == nil && raw != "" {
		var cached domain.CartSnapshot
		if unmarshalErr := json.Unmarshal([]byte(raw), &cached); unmarshalErr == nil {
			return cached, true, nil
		}
	}

	persisted, err := s.repo.LoadByUserID(ctx, userID)
	if err != nil {
		return domain.CartSnapshot{}, false, err
	}
	if persisted != nil {
		_ = s.saveCartToCache(ctx, *persisted)
		return *persisted, true, nil
	}

	if !createIfMissing {
		return domain.CartSnapshot{}, false, nil
	}
	return s.createEmptyCart(userID), true, nil
}

func (s *CartService) persistCart(ctx context.Context, cart *domain.CartSnapshot) error {
	if err := s.saveCartToCache(ctx, *cart); err != nil {
		return err
	}
	return s.repo.Save(ctx, cart)
}

func (s *CartService) saveCartToCache(ctx context.Context, cart domain.CartSnapshot) error {
	body, err := json.Marshal(cart)
	if err != nil {
		return err
	}
	return s.redis.Set(ctx, buildCartCacheKey(cart.UserID), string(body), time.Duration(s.ttlSeconds)*time.Second)
}

func (s *CartService) assertBuyer(user domain.UserContext) error {
	if _, ok := domain.BuyerRoles[user.Role]; !ok {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only buyer can manage cart", nil)
	}
	return nil
}

func (s *CartService) assertExpectedVersion(expected *int, actual int) error {
	if expected == nil {
		return nil
	}
	if *expected != actual {
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeCartVersionConflict, "Cart version conflict", nil)
	}
	return nil
}

func (s *CartService) assertQuantity(quantity int) error {
	if quantity <= 0 {
		return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeCartQuantityInvalid, "Quantity must be greater than 0", nil)
	}
	if quantity > s.maxQtyPerItem {
		return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeCartQuantityExceeded, "Quantity cannot exceed "+intToString(s.maxQtyPerItem), nil)
	}
	return nil
}

func (s *CartService) recalculateCart(cart *domain.CartSnapshot, incrementVersion bool) {
	subtotal := 0.0
	for idx := range cart.Items {
		cart.Items[idx].LineTotal = roundMoney(cart.Items[idx].UnitPrice * float64(cart.Items[idx].Quantity))
		subtotal += cart.Items[idx].LineTotal
	}

	cart.Subtotal = roundMoney(subtotal)
	cart.DiscountTotal = roundMoney(cart.DiscountTotal)
	cart.GrandTotal = roundMoney(cart.Subtotal - cart.DiscountTotal)
	if incrementVersion {
		cart.Version++
	}
	now := time.Now().UTC()
	cart.UpdatedAt = now.Format(time.RFC3339)
	cart.ExpiresAt = now.Add(time.Duration(s.ttlSeconds) * time.Second).Format(time.RFC3339)
}

func (s *CartService) createEmptyCart(userID string) domain.CartSnapshot {
	now := time.Now().UTC()
	return domain.CartSnapshot{
		ID:            uuid.NewString(),
		UserID:        userID,
		Currency:      s.defaultCurrency,
		Items:         []domain.CartItem{},
		Subtotal:      0,
		DiscountTotal: 0,
		GrandTotal:    0,
		ExpiresAt:     now.Add(time.Duration(s.ttlSeconds) * time.Second).Format(time.RFC3339),
		Version:       1,
		CreatedAt:     now.Format(time.RFC3339),
		UpdatedAt:     now.Format(time.RFC3339),
	}
}

func buildMergeKey(productID string, variantID *string, sellerID string) string {
	value := ""
	if variantID != nil {
		value = *variantID
	}
	return productID + "::" + value + "::" + sellerID
}

func buildCartCacheKey(userID string) string {
	return "cart:" + userID
}

func joinIssueMessages(issues []domain.CartValidationIssue) string {
	if len(issues) == 0 {
		return ""
	}
	msg := issues[0].Message
	for i := 1; i < len(issues); i++ {
		msg += ", " + issues[i].Message
	}
	return msg
}

func intToString(value int) string {
	return strconv.Itoa(value)
}

func roundMoney(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
