package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"live-service/internal/domain"
	"live-service/internal/repository"
)

func TestLiveSessionStateTransitions(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	svc := NewLiveService(repo, fakeProductVerifier{}, &fakePublisher{}, &fakeBroadcaster{}, nil)
	seller := testUser("seller-1", domain.RoleSeller)

	created, err := svc.CreateSession(ctx, seller, CreateSessionRequest{
		Title:       "Demo livestream",
		PlaybackURL: "https://example.com/live.m3u8",
	})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if created.Status != domain.LiveSessionStatusDraft {
		t.Fatalf("expected DRAFT, got %s", created.Status)
	}

	started, err := svc.StartSession(ctx, seller, created.SessionID)
	if err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}
	if started.Status != domain.LiveSessionStatusLive || started.StartedAt == nil {
		t.Fatalf("expected LIVE with startedAt, got status=%s startedAt=%v", started.Status, started.StartedAt)
	}

	startedAgain, err := svc.StartSession(ctx, seller, created.SessionID)
	if err != nil {
		t.Fatalf("idempotent StartSession returned error: %v", err)
	}
	if startedAgain.Status != domain.LiveSessionStatusLive {
		t.Fatalf("expected idempotent LIVE, got %s", startedAgain.Status)
	}

	paused, err := svc.PauseSession(ctx, seller, created.SessionID)
	if err != nil {
		t.Fatalf("PauseSession returned error: %v", err)
	}
	if paused.Status != domain.LiveSessionStatusPaused {
		t.Fatalf("expected PAUSED, got %s", paused.Status)
	}

	resumed, err := svc.StartSession(ctx, seller, created.SessionID)
	if err != nil {
		t.Fatalf("resume StartSession returned error: %v", err)
	}
	if resumed.Status != domain.LiveSessionStatusLive || resumed.StartedAt == nil {
		t.Fatalf("expected resumed LIVE with startedAt, got status=%s startedAt=%v", resumed.Status, resumed.StartedAt)
	}

	ended, err := svc.EndSession(ctx, seller, created.SessionID)
	if err != nil {
		t.Fatalf("EndSession returned error: %v", err)
	}
	if ended.Status != domain.LiveSessionStatusEnded || ended.EndedAt == nil {
		t.Fatalf("expected ENDED with endedAt, got status=%s endedAt=%v", ended.Status, ended.EndedAt)
	}

	if _, err := svc.StartSession(ctx, seller, created.SessionID); err == nil {
		t.Fatal("expected starting ended session to fail")
	}
}

func TestCreateSessionBuildsMediaEngineMetadata(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	svc := NewLiveService(repo, fakeProductVerifier{}, &fakePublisher{}, &fakeBroadcaster{}, nil, WithMediaSettings(MediaSettings{
		Mode:             LiveMediaModeMediaEngine,
		Provider:         domain.LiveMediaProviderMediaMTX,
		IngestProtocol:   domain.LiveIngestProtocolWHIP,
		PlaybackProtocol: domain.LivePlaybackProtocolWebRTC,
		IngestBaseURL:    "http://localhost:8889",
		PlaybackBaseURL:  "http://localhost:8889",
	}))
	seller := testUser("seller-1", domain.RoleSeller)

	created, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if created.SourceType != domain.LiveSourceTypeMediaEngine {
		t.Fatalf("expected media engine source type, got %s", created.SourceType)
	}
	if created.Media == nil {
		t.Fatal("expected media metadata")
	}
	if created.Media.Provider != domain.LiveMediaProviderMediaMTX {
		t.Fatalf("expected MEDIAMTX provider, got %s", created.Media.Provider)
	}
	if !strings.HasSuffix(created.Media.Publish.URL, "/whip") {
		t.Fatalf("expected WHIP publish URL, got %q", created.Media.Publish.URL)
	}
	if !strings.HasSuffix(created.PlaybackURL, "/whep") {
		t.Fatalf("expected WHEP playback URL, got %q", created.PlaybackURL)
	}

	started, err := svc.StartSession(ctx, seller, created.SessionID)
	if err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}
	if started.Media == nil || started.Media.Status != domain.LiveMediaStatusLive {
		t.Fatalf("expected media LIVE status, got %+v", started.Media)
	}
}

func TestPinProductValidatesProductAndOwnership(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	verifier := fakeProductVerifier{
		products: map[string]ProductSnapshot{
			"p-active":   {ProductID: "p-active", SellerID: "seller-1", Name: "Camera", Status: "ACTIVE", Price: 100, Currency: "VND"},
			"p-inactive": {ProductID: "p-inactive", SellerID: "seller-1", Name: "Hidden", Status: "HIDDEN", Price: 100, Currency: "VND"},
			"p-other":    {ProductID: "p-other", SellerID: "seller-2", Name: "Other", Status: "ACTIVE", Price: 100, Currency: "VND"},
		},
	}
	publisher := &fakePublisher{}
	broadcaster := &fakeBroadcaster{}
	svc := NewLiveService(repo, verifier, publisher, broadcaster, nil)
	seller := testUser("seller-1", domain.RoleSeller)

	session, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream", PlaybackURL: "https://example.com/live.m3u8"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if _, err := svc.StartSession(ctx, seller, session.SessionID); err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}

	pinned, err := svc.PinProduct(ctx, seller, session.SessionID, PinProductRequest{ProductID: "p-active"})
	if err != nil {
		t.Fatalf("PinProduct returned error: %v", err)
	}
	if pinned.ProductID != "p-active" || pinned.PinStatus != domain.ProductPinStatusPinned {
		t.Fatalf("unexpected pinned product: %+v", pinned)
	}
	if !publisher.has(domain.EventProductPinned) {
		t.Fatal("expected live.product.pinned event")
	}
	if !broadcaster.hasType("live:product:pinned") {
		t.Fatal("expected live:product:pinned broadcast")
	}

	if _, err := svc.PinProduct(ctx, seller, session.SessionID, PinProductRequest{ProductID: "p-inactive"}); err == nil {
		t.Fatal("expected inactive product pin to fail")
	}
	if _, err := svc.PinProduct(ctx, seller, session.SessionID, PinProductRequest{ProductID: "p-other"}); err == nil {
		t.Fatal("expected another seller's product pin to fail")
	}
}

func TestSendMessageIsIdempotentAndBroadcasts(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	publisher := &fakePublisher{}
	broadcaster := &fakeBroadcaster{}
	svc := NewLiveService(repo, fakeProductVerifier{}, publisher, broadcaster, nil)
	seller := testUser("seller-1", domain.RoleSeller)
	buyer := testUser("buyer-1", domain.RoleBuyer)

	session, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream", PlaybackURL: "https://example.com/live.m3u8"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if _, err := svc.StartSession(ctx, seller, session.SessionID); err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}

	first, err := svc.SendMessage(ctx, buyer, session.SessionID, SendMessageRequest{Text: "Xin chao", ClientMessageID: "client-1"})
	if err != nil {
		t.Fatalf("SendMessage returned error: %v", err)
	}
	second, err := svc.SendMessage(ctx, buyer, session.SessionID, SendMessageRequest{Text: "Xin chao again", ClientMessageID: "client-1"})
	if err != nil {
		t.Fatalf("idempotent SendMessage returned error: %v", err)
	}
	if first.MessageID != second.MessageID {
		t.Fatalf("expected same message id for idempotent send, got %s and %s", first.MessageID, second.MessageID)
	}
	if !publisher.has(domain.EventMessageCreated) {
		t.Fatal("expected live.message.created event")
	}
	if !broadcaster.hasType("live:message:new") {
		t.Fatal("expected live:message:new broadcast")
	}
	updated, err := repo.FindSessionByID(ctx, session.SessionID)
	if err != nil {
		t.Fatalf("FindSessionByID returned error: %v", err)
	}
	if updated == nil || updated.MetricsSnapshot.MessageCount != 1 {
		t.Fatalf("expected one counted message, got %+v", updated)
	}
}

func TestSendMessageBlocksUnsafeText(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	publisher := &fakePublisher{}
	broadcaster := &fakeBroadcaster{}
	svc := NewLiveService(repo, fakeProductVerifier{}, publisher, broadcaster, nil)
	seller := testUser("seller-1", domain.RoleSeller)
	buyer := testUser("buyer-1", domain.RoleBuyer)

	session, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream", PlaybackURL: "https://example.com/live.m3u8"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if _, err := svc.StartSession(ctx, seller, session.SessionID); err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}

	if _, err := svc.SendMessage(ctx, buyer, session.SessionID, SendMessageRequest{Text: "kb z a l o minh nha 090 123 4567"}); err == nil {
		t.Fatal("expected unsafe live message to be blocked")
	}
	if len(repo.messages) != 0 {
		t.Fatalf("blocked message should not be persisted, got %d messages", len(repo.messages))
	}
	if publisher.has(domain.EventMessageCreated) {
		t.Fatal("blocked message should not publish event")
	}
	if broadcaster.hasType("live:message:new") {
		t.Fatal("blocked message should not broadcast")
	}
}

func TestListMessagesReturnsVisibleHistoryForViewableSession(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	svc := NewLiveService(repo, fakeProductVerifier{}, &fakePublisher{}, &fakeBroadcaster{}, nil)
	seller := testUser("seller-1", domain.RoleSeller)
	buyer := testUser("buyer-1", domain.RoleBuyer)

	session, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream", PlaybackURL: "https://example.com/live.m3u8"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if _, err := svc.StartSession(ctx, seller, session.SessionID); err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}
	visible, err := svc.SendMessage(ctx, buyer, session.SessionID, SendMessageRequest{Text: "Xin chao", ClientMessageID: "client-visible"})
	if err != nil {
		t.Fatalf("SendMessage returned error: %v", err)
	}
	hidden := visible
	hidden.MessageID = "hidden-message"
	hidden.ClientMessageID = "client-hidden"
	hidden.Text = "hidden"
	hidden.Status = domain.LiveMessageStatusHidden
	repo.messages[hidden.MessageID] = hidden

	result, err := svc.ListMessages(ctx, nil, session.SessionID, ListMessagesRequest{Page: 1, PageSize: 50})
	if err != nil {
		t.Fatalf("ListMessages returned error: %v", err)
	}
	items, ok := result["items"].([]domain.LiveMessage)
	if !ok {
		t.Fatalf("unexpected items payload: %#v", result["items"])
	}
	if len(items) != 1 || items[0].MessageID != visible.MessageID {
		t.Fatalf("expected only visible message, got %+v", items)
	}
}

func TestListMessagesRequiresPermissionForDraftSession(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	svc := NewLiveService(repo, fakeProductVerifier{}, &fakePublisher{}, &fakeBroadcaster{}, nil)
	seller := testUser("seller-1", domain.RoleSeller)
	otherSeller := testUser("seller-2", domain.RoleSeller)

	session, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream", PlaybackURL: "https://example.com/live.m3u8"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if _, err := svc.ListMessages(ctx, nil, session.SessionID, ListMessagesRequest{}); err == nil {
		t.Fatal("expected anonymous draft history read to fail")
	}
	if _, err := svc.ListMessages(ctx, &otherSeller, session.SessionID, ListMessagesRequest{}); err == nil {
		t.Fatal("expected another seller draft history read to fail")
	}
	if _, err := svc.ListMessages(ctx, &seller, session.SessionID, ListMessagesRequest{}); err != nil {
		t.Fatalf("expected owner seller to read draft history, got %v", err)
	}
}

func TestTrackMediaMetricPublishesAnalyticsEvent(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	publisher := &fakePublisher{}
	svc := NewLiveService(repo, fakeProductVerifier{}, publisher, &fakeBroadcaster{}, nil)
	seller := testUser("seller-1", domain.RoleSeller)
	buyer := testUser("buyer-1", domain.RoleBuyer)

	session, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream", PlaybackURL: "https://example.com/live.m3u8"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	valueMs := int64(1250)
	if err := svc.TrackMediaMetric(ctx, &buyer, session.SessionID, TrackMediaMetricRequest{
		MetricType:       "first_frame",
		PlaybackProtocol: "WEBRTC",
		ValueMs:          &valueMs,
		ClientEventID:    "event-1",
	}); err != nil {
		t.Fatalf("TrackMediaMetric returned error: %v", err)
	}
	if !publisher.has(domain.EventMediaMetric) {
		t.Fatal("expected live.media.metric event")
	}
}

func TestTrackMediaMetricDoesNotFailWhenPublishFails(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	svc := NewLiveService(repo, fakeProductVerifier{}, failingPublisher{}, &fakeBroadcaster{}, nil)
	seller := testUser("seller-1", domain.RoleSeller)

	session, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream", PlaybackURL: "https://example.com/live.m3u8"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if err := svc.TrackMediaMetric(ctx, nil, session.SessionID, TrackMediaMetricRequest{MetricType: "playback_error"}); err != nil {
		t.Fatalf("TrackMediaMetric should ignore publish failures, got: %v", err)
	}
}

func TestTrackProductClickedDoesNotFailWhenPublishFails(t *testing.T) {
	ctx := context.Background()
	repo := newMemoryRepo()
	svc := NewLiveService(repo, fakeProductVerifier{}, failingPublisher{}, &fakeBroadcaster{}, nil)
	seller := testUser("seller-1", domain.RoleSeller)

	session, err := svc.CreateSession(ctx, seller, CreateSessionRequest{Title: "Demo livestream", PlaybackURL: "https://example.com/live.m3u8"})
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if err := svc.TrackProductClicked(ctx, nil, session.SessionID, "product-1"); err != nil {
		t.Fatalf("TrackProductClicked should ignore publish failures, got: %v", err)
	}
}

func testUser(userID string, role domain.Role) domain.UserContext {
	return domain.UserContext{UserID: userID, Role: role, SessionID: "session", JTI: "jti"}
}

type memoryRepo struct {
	mu       sync.Mutex
	sessions map[string]domain.LiveSession
	products map[string]domain.LiveProduct
	messages map[string]domain.LiveMessage
}

func newMemoryRepo() *memoryRepo {
	return &memoryRepo{
		sessions: map[string]domain.LiveSession{},
		products: map[string]domain.LiveProduct{},
		messages: map[string]domain.LiveMessage{},
	}
}

func (r *memoryRepo) Ping(context.Context) error          { return nil }
func (r *memoryRepo) EnsureIndexes(context.Context) error { return nil }

func (r *memoryRepo) CreateSession(_ context.Context, session domain.LiveSession) (domain.LiveSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	session.ID = "id-" + session.SessionID
	r.sessions[session.SessionID] = session
	return session, nil
}

func (r *memoryRepo) FindSessionByID(_ context.Context, sessionID string) (*domain.LiveSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	session, ok := r.sessions[sessionID]
	if !ok {
		return nil, nil
	}
	return &session, nil
}

func (r *memoryRepo) ListSessions(_ context.Context, filter repository.ListSessionsFilter) ([]domain.LiveSession, int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	items := make([]domain.LiveSession, 0)
	for _, session := range r.sessions {
		if filter.SellerID != "" && session.SellerID != filter.SellerID {
			continue
		}
		if filter.Status != "" && session.Status != filter.Status {
			continue
		}
		items = append(items, session)
	}
	return items, int64(len(items)), nil
}

func (r *memoryRepo) UpdateSession(_ context.Context, session domain.LiveSession) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.sessions[session.SessionID]; !ok {
		return errors.New("not found")
	}
	r.sessions[session.SessionID] = session
	return nil
}

func (r *memoryRepo) UpsertPinnedProduct(_ context.Context, product domain.LiveProduct) (domain.LiveProduct, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	product.ID = product.SessionID + ":" + product.ProductID
	r.products[product.ID] = product
	return product, nil
}

func (r *memoryRepo) UnpinProduct(_ context.Context, sessionID, productID string, at time.Time) (*domain.LiveProduct, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := sessionID + ":" + productID
	product, ok := r.products[key]
	if !ok || product.PinStatus != domain.ProductPinStatusPinned {
		return nil, nil
	}
	product.PinStatus = domain.ProductPinStatusUnpinned
	product.UnpinnedAt = &at
	r.products[key] = product
	return &product, nil
}

func (r *memoryRepo) ListPinnedProducts(_ context.Context, sessionID string) ([]domain.LiveProduct, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	items := make([]domain.LiveProduct, 0)
	for _, product := range r.products {
		if product.SessionID == sessionID && product.PinStatus == domain.ProductPinStatusPinned {
			items = append(items, product)
		}
	}
	return items, nil
}

func (r *memoryRepo) FindMessageByClientID(_ context.Context, sessionID, clientMessageID string) (*domain.LiveMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, message := range r.messages {
		if message.SessionID == sessionID && message.ClientMessageID == clientMessageID {
			return &message, nil
		}
	}
	return nil, nil
}

func (r *memoryRepo) CreateMessage(_ context.Context, message domain.LiveMessage) (domain.LiveMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	message.ID = "id-" + message.MessageID
	r.messages[message.MessageID] = message
	return message, nil
}

func (r *memoryRepo) ListMessages(_ context.Context, filter repository.ListMessagesFilter) ([]domain.LiveMessage, int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	items := make([]domain.LiveMessage, 0)
	for _, message := range r.messages {
		if message.SessionID == filter.SessionID && message.Status == domain.LiveMessageStatusVisible {
			items = append(items, message)
		}
	}
	return items, int64(len(items)), nil
}

func (r *memoryRepo) IncrementMessageCount(_ context.Context, sessionID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	session, ok := r.sessions[sessionID]
	if !ok {
		return errors.New("not found")
	}
	session.MetricsSnapshot.MessageCount++
	r.sessions[sessionID] = session
	return nil
}

type fakeProductVerifier struct {
	products map[string]ProductSnapshot
}

func (f fakeProductVerifier) GetProductSnapshot(_ context.Context, productID string) (ProductSnapshot, error) {
	if f.products == nil {
		return ProductSnapshot{}, errors.New("product verifier not configured")
	}
	product, ok := f.products[productID]
	if !ok {
		return ProductSnapshot{}, errors.New("product not found")
	}
	return product, nil
}

type fakePublisher struct {
	events []string
}

func (f *fakePublisher) Publish(_ context.Context, eventType string, _ map[string]any) error {
	f.events = append(f.events, eventType)
	return nil
}

func (f *fakePublisher) has(eventType string) bool {
	for _, event := range f.events {
		if event == eventType {
			return true
		}
	}
	return false
}

type failingPublisher struct{}

func (failingPublisher) Publish(context.Context, string, map[string]any) error {
	return errors.New("publish failed")
}

type fakeBroadcaster struct {
	payloads []map[string]any
}

func (f *fakeBroadcaster) Broadcast(_ context.Context, _ string, payload any) error {
	if m, ok := payload.(map[string]any); ok {
		f.payloads = append(f.payloads, m)
	}
	return nil
}

func (f *fakeBroadcaster) hasType(eventType string) bool {
	for _, payload := range f.payloads {
		if payload["type"] == eventType {
			return true
		}
	}
	return false
}
