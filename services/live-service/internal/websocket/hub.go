package websocket

import (
	"context"
	"sync"
)

type Client struct {
	SessionID string
	Send      chan any
}

type Hub struct {
	mu       sync.RWMutex
	sessions map[string]map[*Client]struct{}
}

func NewHub() *Hub {
	return &Hub{sessions: map[string]map[*Client]struct{}{}}
}

func (h *Hub) Register(client *Client) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.sessions[client.SessionID] == nil {
		h.sessions[client.SessionID] = map[*Client]struct{}{}
	}
	h.sessions[client.SessionID][client] = struct{}{}
	return len(h.sessions[client.SessionID])
}

func (h *Hub) Unregister(client *Client) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	clients := h.sessions[client.SessionID]
	if clients == nil {
		return 0
	}
	delete(clients, client)
	count := len(clients)
	if count == 0 {
		delete(h.sessions, client.SessionID)
	}
	close(client.Send)
	return count
}

func (h *Hub) Broadcast(_ context.Context, sessionID string, payload any) error {
	h.mu.RLock()
	clients := h.sessions[sessionID]
	targets := make([]*Client, 0, len(clients))
	for client := range clients {
		targets = append(targets, client)
	}
	h.mu.RUnlock()

	for _, client := range targets {
		select {
		case client.Send <- payload:
		default:
		}
	}
	return nil
}

func (h *Hub) Count(sessionID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.sessions[sessionID])
}
