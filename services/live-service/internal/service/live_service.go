package service

import (
	"context"
	"net/http"
	"strings"
	"time"

	"live-service/internal/domain"
	"live-service/internal/httpx"
	"live-service/internal/repository"

	"github.com/google/uuid"
)

type EventPublisher interface {
	Publish(ctx context.Context, eventType string, payload map[string]any) error
}

type Broadcaster interface {
	Broadcast(ctx context.Context, sessionID string, payload any) error
}

type LiveService struct {
	repo            repository.Repository
	productVerifier ProductVerifier
	publisher       EventPublisher
	broadcaster     Broadcaster
	sendLimiter     *SendRateLimiter
	mediaSettings   MediaSettings
}

type LiveMediaMode string

const (
	LiveMediaModeP2PLegacy   LiveMediaMode = "p2p_legacy"
	LiveMediaModeMediaEngine LiveMediaMode = "media_engine"
)

type MediaSettings struct {
	Mode             LiveMediaMode
	Provider         domain.LiveMediaProvider
	IngestProtocol   domain.LiveIngestProtocol
	PlaybackProtocol domain.LivePlaybackProtocol
	IngestBaseURL    string
	PlaybackBaseURL  string
}

type LiveServiceOption func(*LiveService)

type CreateSessionRequest struct {
	Title              string     `json:"title"`
	Description        string     `json:"description,omitempty"`
	ThumbnailURL       string     `json:"thumbnailUrl,omitempty"`
	PlaybackURL        string     `json:"playbackUrl"`
	ScheduledAt        *time.Time `json:"scheduledAt,omitempty"`
	DefaultLanguage    string     `json:"defaultLanguage,omitempty"`
	SupportedLanguages []string   `json:"supportedLanguages,omitempty"`
}

type UpdateSessionRequest struct {
	Title        *string    `json:"title,omitempty"`
	Description  *string    `json:"description,omitempty"`
	ThumbnailURL *string    `json:"thumbnailUrl,omitempty"`
	PlaybackURL  *string    `json:"playbackUrl,omitempty"`
	ScheduledAt  *time.Time `json:"scheduledAt,omitempty"`
}

type ListSessionsRequest struct {
	Page     int
	PageSize int
	Status   domain.LiveSessionStatus
}

type ListMessagesRequest struct {
	Page     int
	PageSize int
}

type PinProductRequest struct {
	ProductID string `json:"productId"`
}

type SendMessageRequest struct {
	Text            string `json:"text"`
	ClientMessageID string `json:"clientMessageId,omitempty"`
	Language        string `json:"language,omitempty"`
}

type TrackMediaMetricRequest struct {
	MetricType       string         `json:"metricType"`
	PlaybackProtocol string         `json:"playbackProtocol,omitempty"`
	ValueMs          *int64         `json:"valueMs,omitempty"`
	Count            *int64         `json:"count,omitempty"`
	ErrorCode        string         `json:"errorCode,omitempty"`
	ClientEventID    string         `json:"clientEventId,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
}

func NewLiveService(repo repository.Repository, productVerifier ProductVerifier, publisher EventPublisher, broadcaster Broadcaster, sendLimiter *SendRateLimiter, opts ...LiveServiceOption) *LiveService {
	s := &LiveService{
		repo:            repo,
		productVerifier: productVerifier,
		publisher:       publisher,
		broadcaster:     broadcaster,
		sendLimiter:     sendLimiter,
		mediaSettings:   DefaultMediaSettings(),
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

func DefaultMediaSettings() MediaSettings {
	return MediaSettings{
		Mode:             LiveMediaModeP2PLegacy,
		Provider:         domain.LiveMediaProviderP2P,
		IngestProtocol:   domain.LiveIngestProtocolWHIP,
		PlaybackProtocol: domain.LivePlaybackProtocolHLS,
	}
}

func WithMediaSettings(settings MediaSettings) LiveServiceOption {
	return func(s *LiveService) {
		s.mediaSettings = settings
	}
}

func (s *LiveService) buildMediaMetadata(sessionID, fallbackPlaybackURL string) (*domain.LiveMedia, string, error) {
	if s.mediaSettings.Mode != LiveMediaModeMediaEngine {
		return &domain.LiveMedia{
			Provider: domain.LiveMediaProviderP2P,
			Playback: domain.LiveMediaPlayback{
				Protocol: domain.LivePlaybackProtocolWebRTC,
				URL:      fallbackPlaybackURL,
			},
			Status: domain.LiveMediaStatusReady,
		}, fallbackPlaybackURL, nil
	}

	streamName := "live-" + sessionID
	ingestBaseURL := strings.TrimRight(strings.TrimSpace(s.mediaSettings.IngestBaseURL), "/")
	playbackBaseURL := strings.TrimRight(strings.TrimSpace(s.mediaSettings.PlaybackBaseURL), "/")
	if ingestBaseURL == "" || playbackBaseURL == "" {
		return nil, "", httpx.NewAppError(http.StatusInternalServerError, domain.ErrorCodeInternalServerError, "Live media engine is not configured", nil)
	}

	publishURL := mediaPublishURL(ingestBaseURL, streamName, s.mediaSettings.IngestProtocol)
	playbackURL := mediaPlaybackURL(playbackBaseURL, streamName, s.mediaSettings.PlaybackProtocol)
	if len(playbackURL) < 8 || len(playbackURL) > 2000 {
		return nil, "", validationError("playbackUrl", "length must be between 8 and 2000")
	}

	return &domain.LiveMedia{
		Provider:   s.mediaSettings.Provider,
		StreamName: streamName,
		Publish: domain.LiveMediaPublish{
			Protocol:  s.mediaSettings.IngestProtocol,
			URL:       publishURL,
			StreamKey: streamName,
		},
		Playback: domain.LiveMediaPlayback{
			Protocol: s.mediaSettings.PlaybackProtocol,
			URL:      playbackURL,
		},
		Status: domain.LiveMediaStatusReady,
	}, playbackURL, nil
}

func mediaPublishURL(baseURL, streamName string, protocol domain.LiveIngestProtocol) string {
	switch protocol {
	case domain.LiveIngestProtocolWHIP:
		return baseURL + "/" + streamName + "/whip"
	default:
		return baseURL + "/" + streamName
	}
}

func mediaPlaybackURL(baseURL, streamName string, protocol domain.LivePlaybackProtocol) string {
	switch protocol {
	case domain.LivePlaybackProtocolHLS, domain.LivePlaybackProtocolLLHLS:
		return baseURL + "/" + streamName + "/index.m3u8"
	case domain.LivePlaybackProtocolWebRTC:
		return baseURL + "/" + streamName + "/whep"
	default:
		return baseURL + "/" + streamName
	}
}

func (s *LiveService) CreateSession(ctx context.Context, user domain.UserContext, req CreateSessionRequest) (domain.LiveSession, error) {
	if !canManageLive(user.Role) {
		return domain.LiveSession{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	title := strings.TrimSpace(req.Title)
	if len(title) < 3 || len(title) > 160 {
		return domain.LiveSession{}, validationError("title", "length must be between 3 and 160")
	}
	playbackURL := strings.TrimSpace(req.PlaybackURL)
	if s.mediaSettings.Mode != LiveMediaModeMediaEngine && (len(playbackURL) < 8 || len(playbackURL) > 2000) {
		return domain.LiveSession{}, validationError("playbackUrl", "length must be between 8 and 2000")
	}

	now := time.Now().UTC()
	status := domain.LiveSessionStatusDraft
	if req.ScheduledAt != nil {
		status = domain.LiveSessionStatusScheduled
	}
	defaultLanguage := strings.TrimSpace(req.DefaultLanguage)
	if defaultLanguage == "" {
		defaultLanguage = "en"
	}
	supportedLanguages := normalizeLanguages(req.SupportedLanguages, defaultLanguage)

	sessionID := uuid.NewString()
	media, resolvedPlaybackURL, err := s.buildMediaMetadata(sessionID, playbackURL)
	if err != nil {
		return domain.LiveSession{}, err
	}
	sourceType := domain.LiveSourceTypeExternalURL
	if s.mediaSettings.Mode == LiveMediaModeMediaEngine {
		sourceType = domain.LiveSourceTypeMediaEngine
	}

	session := domain.LiveSession{
		SessionID:          sessionID,
		SellerID:           user.UserID,
		Title:              title,
		Description:        strings.TrimSpace(req.Description),
		ThumbnailURL:       strings.TrimSpace(req.ThumbnailURL),
		PlaybackURL:        resolvedPlaybackURL,
		Media:              media,
		SourceType:         sourceType,
		Status:             status,
		DefaultLanguage:    defaultLanguage,
		SupportedLanguages: supportedLanguages,
		ScheduledAt:        req.ScheduledAt,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	created, err := s.repo.CreateSession(ctx, session)
	if err != nil {
		return domain.LiveSession{}, err
	}
	_ = s.publish(ctx, domain.EventSessionCreated, sessionEventPayload(created, user))
	return created, nil
}

func (s *LiveService) ListPublicSessions(ctx context.Context, req ListSessionsRequest) (map[string]any, error) {
	if req.Status == "" {
		req.Status = domain.LiveSessionStatusLive
	}
	return s.listSessions(ctx, repository.ListSessionsFilter{Status: req.Status, Page: req.Page, PageSize: req.PageSize})
}

func (s *LiveService) ListMySessions(ctx context.Context, user domain.UserContext, req ListSessionsRequest) (map[string]any, error) {
	if !canManageLive(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	return s.listSessions(ctx, repository.ListSessionsFilter{SellerID: user.UserID, Status: req.Status, Page: req.Page, PageSize: req.PageSize})
}

func (s *LiveService) GetSession(ctx context.Context, user *domain.UserContext, sessionID string) (map[string]any, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if !canViewSession(user, *session) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	products, err := s.repo.ListPinnedProducts(ctx, session.SessionID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"session": session, "pinnedProducts": products}, nil
}

func (s *LiveService) UpdateSession(ctx context.Context, user domain.UserContext, sessionID string, req UpdateSessionRequest) (domain.LiveSession, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return domain.LiveSession{}, err
	}
	if !canMutateSession(user, *session) {
		return domain.LiveSession{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	if session.Status == domain.LiveSessionStatusEnded || session.Status == domain.LiveSessionStatusCancelled {
		return domain.LiveSession{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Session is closed", nil)
	}

	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if len(title) < 3 || len(title) > 160 {
			return domain.LiveSession{}, validationError("title", "length must be between 3 and 160")
		}
		session.Title = title
	}
	if req.Description != nil {
		session.Description = strings.TrimSpace(*req.Description)
	}
	if req.ThumbnailURL != nil {
		session.ThumbnailURL = strings.TrimSpace(*req.ThumbnailURL)
	}
	if req.PlaybackURL != nil {
		playbackURL := strings.TrimSpace(*req.PlaybackURL)
		if len(playbackURL) < 8 || len(playbackURL) > 2000 {
			return domain.LiveSession{}, validationError("playbackUrl", "length must be between 8 and 2000")
		}
		session.PlaybackURL = playbackURL
	}
	if req.ScheduledAt != nil {
		session.ScheduledAt = req.ScheduledAt
		if session.Status == domain.LiveSessionStatusDraft {
			session.Status = domain.LiveSessionStatusScheduled
		}
	}
	session.UpdatedAt = time.Now().UTC()
	if err := s.repo.UpdateSession(ctx, *session); err != nil {
		return domain.LiveSession{}, err
	}
	return *session, nil
}

func (s *LiveService) StartSession(ctx context.Context, user domain.UserContext, sessionID string) (domain.LiveSession, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return domain.LiveSession{}, err
	}
	if !canMutateSession(user, *session) {
		return domain.LiveSession{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	switch session.Status {
	case domain.LiveSessionStatusLive:
		return *session, nil
	case domain.LiveSessionStatusDraft, domain.LiveSessionStatusScheduled, domain.LiveSessionStatusPaused:
	default:
		return domain.LiveSession{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Session cannot be started", nil)
	}
	now := time.Now().UTC()
	session.Status = domain.LiveSessionStatusLive
	if session.Media != nil {
		session.Media.Status = domain.LiveMediaStatusLive
	}
	if session.StartedAt == nil {
		session.StartedAt = &now
	}
	session.UpdatedAt = now
	if err := s.repo.UpdateSession(ctx, *session); err != nil {
		return domain.LiveSession{}, err
	}
	_ = s.publish(ctx, domain.EventSessionStarted, sessionEventPayload(*session, user))
	_ = s.broadcast(ctx, session.SessionID, map[string]any{"type": "live:session:status", "status": session.Status})
	return *session, nil
}

func (s *LiveService) PauseSession(ctx context.Context, user domain.UserContext, sessionID string) (domain.LiveSession, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return domain.LiveSession{}, err
	}
	if !canMutateSession(user, *session) {
		return domain.LiveSession{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	switch session.Status {
	case domain.LiveSessionStatusPaused:
		return *session, nil
	case domain.LiveSessionStatusLive:
	default:
		return domain.LiveSession{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Session cannot be paused", nil)
	}
	now := time.Now().UTC()
	session.Status = domain.LiveSessionStatusPaused
	if session.Media != nil {
		session.Media.Status = domain.LiveMediaStatusReady
	}
	session.UpdatedAt = now
	if err := s.repo.UpdateSession(ctx, *session); err != nil {
		return domain.LiveSession{}, err
	}
	_ = s.publish(ctx, domain.EventSessionPaused, sessionEventPayload(*session, user))
	_ = s.broadcast(ctx, session.SessionID, map[string]any{"type": "live:session:status", "status": session.Status})
	return *session, nil
}

func (s *LiveService) EndSession(ctx context.Context, user domain.UserContext, sessionID string) (domain.LiveSession, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return domain.LiveSession{}, err
	}
	if !canMutateSession(user, *session) {
		return domain.LiveSession{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	switch session.Status {
	case domain.LiveSessionStatusEnded:
		return *session, nil
	case domain.LiveSessionStatusLive, domain.LiveSessionStatusPaused:
	default:
		return domain.LiveSession{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Session cannot be ended", nil)
	}
	now := time.Now().UTC()
	session.Status = domain.LiveSessionStatusEnded
	if session.Media != nil {
		session.Media.Status = domain.LiveMediaStatusEnded
	}
	session.EndedAt = &now
	session.UpdatedAt = now
	if err := s.repo.UpdateSession(ctx, *session); err != nil {
		return domain.LiveSession{}, err
	}
	_ = s.publish(ctx, domain.EventSessionEnded, sessionEventPayload(*session, user))
	_ = s.broadcast(ctx, session.SessionID, map[string]any{"type": "live:session:status", "status": session.Status})
	return *session, nil
}

func (s *LiveService) CancelSession(ctx context.Context, user domain.UserContext, sessionID string) (domain.LiveSession, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return domain.LiveSession{}, err
	}
	if !canMutateSession(user, *session) {
		return domain.LiveSession{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	switch session.Status {
	case domain.LiveSessionStatusDraft, domain.LiveSessionStatusScheduled:
	default:
		return domain.LiveSession{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Session cannot be cancelled", nil)
	}
	now := time.Now().UTC()
	session.Status = domain.LiveSessionStatusCancelled
	session.UpdatedAt = now
	if err := s.repo.UpdateSession(ctx, *session); err != nil {
		return domain.LiveSession{}, err
	}
	return *session, nil
}

func (s *LiveService) PinProduct(ctx context.Context, user domain.UserContext, sessionID string, req PinProductRequest) (domain.LiveProduct, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return domain.LiveProduct{}, err
	}
	if !canMutateSession(user, *session) {
		return domain.LiveProduct{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	if session.Status != domain.LiveSessionStatusLive && session.Status != domain.LiveSessionStatusScheduled && session.Status != domain.LiveSessionStatusPaused {
		return domain.LiveProduct{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Session must be live, paused, or scheduled", nil)
	}
	productID := strings.TrimSpace(req.ProductID)
	if productID == "" {
		return domain.LiveProduct{}, validationError("productId", "is required")
	}
	snapshot, err := s.productVerifier.GetProductSnapshot(ctx, productID)
	if err != nil {
		return domain.LiveProduct{}, err
	}
	if snapshot.Status != "ACTIVE" {
		return domain.LiveProduct{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Product must be ACTIVE", nil)
	}
	if user.Role == domain.RoleSeller && snapshot.SellerID != "" && snapshot.SellerID != user.UserID {
		return domain.LiveProduct{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller cannot pin another seller's product", nil)
	}

	now := time.Now().UTC()
	product := domain.LiveProduct{
		SessionID:        session.SessionID,
		ProductID:        snapshot.ProductID,
		SellerID:         snapshot.SellerID,
		NameSnapshot:     snapshot.Name,
		PriceSnapshot:    snapshot.Price,
		CurrencySnapshot: snapshot.Currency,
		ImageSnapshot:    snapshot.ImageURL,
		StatusSnapshot:   snapshot.Status,
		PinStatus:        domain.ProductPinStatusPinned,
		SortOrder:        int(now.Unix()),
		PinnedAt:         now,
		PinnedBy:         user.UserID,
	}
	created, err := s.repo.UpsertPinnedProduct(ctx, product)
	if err != nil {
		return domain.LiveProduct{}, err
	}
	_ = s.publish(ctx, domain.EventProductPinned, productEventPayload(created, user))
	_ = s.broadcast(ctx, session.SessionID, map[string]any{"type": "live:product:pinned", "product": created})
	return created, nil
}

func (s *LiveService) UnpinProduct(ctx context.Context, user domain.UserContext, sessionID, productID string) (*domain.LiveProduct, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if !canMutateSession(user, *session) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	product, err := s.repo.UnpinProduct(ctx, session.SessionID, strings.TrimSpace(productID), time.Now().UTC())
	if err != nil {
		return nil, err
	}
	if product == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Pinned product not found", nil)
	}
	_ = s.publish(ctx, domain.EventProductUnpinned, productEventPayload(*product, user))
	_ = s.broadcast(ctx, session.SessionID, map[string]any{"type": "live:product:unpinned", "productId": product.ProductID})
	return product, nil
}

func (s *LiveService) ListPinnedProducts(ctx context.Context, sessionID string) ([]domain.LiveProduct, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	return s.repo.ListPinnedProducts(ctx, session.SessionID)
}

func (s *LiveService) ListMessages(ctx context.Context, user *domain.UserContext, sessionID string, req ListMessagesRequest) (map[string]any, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if !canViewSession(user, *session) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient permission", nil)
	}
	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 {
		req.PageSize = 50
	}
	if req.PageSize > 100 {
		req.PageSize = 100
	}
	items, totalItems, err := s.repo.ListMessages(ctx, repository.ListMessagesFilter{
		SessionID: session.SessionID,
		Page:      req.Page,
		PageSize:  req.PageSize,
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"items": items,
		"pagination": map[string]any{
			"page":       req.Page,
			"pageSize":   req.PageSize,
			"totalItems": totalItems,
			"totalPages": totalPages(totalItems, req.PageSize),
		},
	}, nil
}

func (s *LiveService) SendMessage(ctx context.Context, user domain.UserContext, sessionID string, req SendMessageRequest) (domain.LiveMessage, error) {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return domain.LiveMessage{}, err
	}
	if session.Status != domain.LiveSessionStatusLive {
		return domain.LiveMessage{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Session is not live", nil)
	}
	text := strings.TrimSpace(req.Text)
	if len(text) < 1 || len(text) > 1000 {
		return domain.LiveMessage{}, validationError("text", "length must be between 1 and 1000")
	}
	clientMessageID := strings.TrimSpace(req.ClientMessageID)
	if len(clientMessageID) > 128 {
		return domain.LiveMessage{}, validationError("clientMessageId", "max length is 128")
	}
	if s.sendLimiter != nil && !s.sendLimiter.Allow(user.UserID) {
		return domain.LiveMessage{}, httpx.NewAppError(http.StatusTooManyRequests, domain.ErrorCodeRateLimited, "Message rate limit exceeded", nil)
	}
	if existing, err := s.repo.FindMessageByClientID(ctx, session.SessionID, clientMessageID); err != nil {
		return domain.LiveMessage{}, err
	} else if existing != nil {
		return *existing, nil
	}

	language := strings.TrimSpace(req.Language)
	if language == "" {
		language = session.DefaultLanguage
	}
	now := time.Now().UTC()
	message := domain.LiveMessage{
		MessageID:       uuid.NewString(),
		SessionID:       session.SessionID,
		SenderID:        user.UserID,
		SenderRole:      user.Role,
		Text:            text,
		ClientMessageID: clientMessageID,
		Language:        language,
		Status:          domain.LiveMessageStatusVisible,
		CreatedAt:       now,
	}
	created, err := s.repo.CreateMessage(ctx, message)
	if err != nil {
		return domain.LiveMessage{}, err
	}
	if err := s.repo.IncrementMessageCount(ctx, session.SessionID); err != nil {
		return domain.LiveMessage{}, err
	}
	_ = s.publish(ctx, domain.EventMessageCreated, messageEventPayload(created, user))
	_ = s.broadcast(ctx, session.SessionID, map[string]any{"type": "live:message:new", "message": created})
	return created, nil
}

func (s *LiveService) TrackProductClicked(ctx context.Context, user *domain.UserContext, sessionID, productID string) error {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return err
	}
	actorID := ""
	actorRole := ""
	if user != nil {
		actorID = user.UserID
		actorRole = string(user.Role)
	}
	_ = s.publish(ctx, domain.EventProductClicked, map[string]any{
		"sessionId": session.SessionID,
		"productId": strings.TrimSpace(productID),
		"actorId":   actorID,
		"actorRole": actorRole,
	})
	return nil
}

func (s *LiveService) TrackMediaMetric(ctx context.Context, user *domain.UserContext, sessionID string, req TrackMediaMetricRequest) error {
	session, err := s.requireSession(ctx, sessionID)
	if err != nil {
		return err
	}
	metricType := strings.TrimSpace(req.MetricType)
	if metricType == "" || len(metricType) > 80 {
		return validationError("metricType", "is required and must be at most 80 characters")
	}
	clientEventID := strings.TrimSpace(req.ClientEventID)
	if len(clientEventID) > 128 {
		return validationError("clientEventId", "max length is 128")
	}

	actorID := ""
	actorRole := ""
	if user != nil {
		actorID = user.UserID
		actorRole = string(user.Role)
	}
	payload := map[string]any{
		"sessionId":        session.SessionID,
		"metricType":       metricType,
		"playbackProtocol": strings.TrimSpace(req.PlaybackProtocol),
		"errorCode":        strings.TrimSpace(req.ErrorCode),
		"clientEventId":    clientEventID,
		"actorId":          actorID,
		"actorRole":        actorRole,
	}
	if req.ValueMs != nil {
		payload["valueMs"] = *req.ValueMs
	}
	if req.Count != nil {
		payload["count"] = *req.Count
	}
	if len(req.Metadata) > 0 {
		payload["metadata"] = req.Metadata
	}
	_ = s.publish(ctx, domain.EventMediaMetric, payload)
	return nil
}

func (s *LiveService) TrackViewerJoined(ctx context.Context, user domain.UserContext, sessionID string, viewerCount int64) {
	_ = s.publish(ctx, domain.EventViewerJoined, map[string]any{
		"sessionId":   sessionID,
		"viewerId":    user.UserID,
		"viewerRole":  user.Role,
		"viewerCount": viewerCount,
	})
}

func (s *LiveService) TrackViewerLeft(ctx context.Context, user domain.UserContext, sessionID string, viewerCount int64) {
	_ = s.publish(ctx, domain.EventViewerLeft, map[string]any{
		"sessionId":   sessionID,
		"viewerId":    user.UserID,
		"viewerRole":  user.Role,
		"viewerCount": viewerCount,
	})
}

func (s *LiveService) listSessions(ctx context.Context, filter repository.ListSessionsFilter) (map[string]any, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 {
		filter.PageSize = 20
	}
	if filter.PageSize > 100 {
		filter.PageSize = 100
	}
	items, totalItems, err := s.repo.ListSessions(ctx, filter)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"items": items,
		"pagination": map[string]any{
			"page":       filter.Page,
			"pageSize":   filter.PageSize,
			"totalItems": totalItems,
			"totalPages": totalPages(totalItems, filter.PageSize),
		},
	}, nil
}

func (s *LiveService) requireSession(ctx context.Context, sessionID string) (*domain.LiveSession, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil, validationError("sessionId", "is required")
	}
	session, err := s.repo.FindSessionByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Live session not found", nil)
	}
	return session, nil
}

func (s *LiveService) publish(ctx context.Context, eventType string, payload map[string]any) error {
	if s.publisher == nil {
		return nil
	}
	return s.publisher.Publish(ctx, eventType, payload)
}

func (s *LiveService) broadcast(ctx context.Context, sessionID string, payload any) error {
	if s.broadcaster == nil {
		return nil
	}
	return s.broadcaster.Broadcast(ctx, sessionID, payload)
}

func canManageLive(role domain.Role) bool {
	return role == domain.RoleSeller || role == domain.RoleAdmin || role == domain.RoleSuperAdmin
}

func canMutateSession(user domain.UserContext, session domain.LiveSession) bool {
	return domain.IsStaffRole(user.Role) || user.Role == domain.RoleSuperAdmin || (user.Role == domain.RoleSeller && user.UserID == session.SellerID)
}

func canViewSession(user *domain.UserContext, session domain.LiveSession) bool {
	if session.Status == domain.LiveSessionStatusLive || session.Status == domain.LiveSessionStatusPaused || session.Status == domain.LiveSessionStatusEnded {
		return true
	}
	if user == nil {
		return false
	}
	return canMutateSession(*user, session)
}

func normalizeLanguages(values []string, defaultLanguage string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values)+1)
	add := func(v string) {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" {
			return
		}
		if _, ok := seen[v]; ok {
			return
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	add(defaultLanguage)
	for _, value := range values {
		add(value)
	}
	return out
}

func validationError(field, message string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{field: message})
}

func totalPages(totalItems int64, pageSize int) int64 {
	if pageSize <= 0 {
		return 0
	}
	pages := totalItems / int64(pageSize)
	if totalItems%int64(pageSize) != 0 {
		pages++
	}
	return pages
}

func sessionEventPayload(session domain.LiveSession, user domain.UserContext) map[string]any {
	return map[string]any{
		"sessionId": session.SessionID,
		"sellerId":  session.SellerID,
		"status":    session.Status,
		"actorId":   user.UserID,
		"actorRole": user.Role,
	}
}

func productEventPayload(product domain.LiveProduct, user domain.UserContext) map[string]any {
	return map[string]any{
		"sessionId": product.SessionID,
		"productId": product.ProductID,
		"sellerId":  product.SellerID,
		"actorId":   user.UserID,
		"actorRole": user.Role,
	}
}

func messageEventPayload(message domain.LiveMessage, user domain.UserContext) map[string]any {
	return map[string]any{
		"sessionId":  message.SessionID,
		"messageId":  message.MessageID,
		"senderId":   user.UserID,
		"senderRole": user.Role,
		"language":   message.Language,
	}
}
