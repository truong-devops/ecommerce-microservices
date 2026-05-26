package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"shipping-service/internal/nexus"
)

func main() {
	baseURL := strings.TrimSpace(os.Getenv("NEXUS_BASE_URL"))
	partnerCode := strings.TrimSpace(os.Getenv("NEXUS_PARTNER_CODE"))
	apiKey := strings.TrimSpace(os.Getenv("NEXUS_API_KEY"))
	apiSecret := strings.TrimSpace(os.Getenv("NEXUS_API_SECRET"))
	if baseURL == "" || partnerCode == "" || apiKey == "" || apiSecret == "" {
		panic("NEXUS_BASE_URL, NEXUS_PARTNER_CODE, NEXUS_API_KEY and NEXUS_API_SECRET are required")
	}

	timeout := 10 * time.Second
	if raw := strings.TrimSpace(os.Getenv("NEXUS_REQUEST_TIMEOUT_MS")); raw != "" {
		timeoutMS, err := strconv.Atoi(raw)
		if err != nil || timeoutMS <= 0 {
			panic("NEXUS_REQUEST_TIMEOUT_MS must be a positive integer")
		}
		timeout = time.Duration(timeoutMS) * time.Millisecond
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	response, err := nexus.NewClient(baseURL, partnerCode, apiKey, apiSecret, timeout).Health(ctx)
	if err != nil {
		panic(fmt.Errorf("Nexus health check failed: %w", err))
	}
	output, err := json.Marshal(response)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Nexus health check succeeded: %s\n", output)
}
