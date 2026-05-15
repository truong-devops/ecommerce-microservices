package handler

import (
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"product-service/internal/domain"
	"product-service/internal/httpx"
)

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

func parseIntQuery(values url.Values, key string, fallback int, min int, max int) (int, error) {
	raw := strings.TrimSpace(values.Get(key))
	if raw == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < min || (max > 0 && parsed > max) {
		return 0, badQuery(key + " is invalid")
	}
	return parsed, nil
}

func badQuery(message string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, message, nil)
}

func isUUID(value string) bool {
	return uuidRegex.MatchString(strings.TrimSpace(value))
}

func isProductStatusValue(status domain.ProductStatus) bool {
	return status == domain.ProductStatusDraft ||
		status == domain.ProductStatusActive ||
		status == domain.ProductStatusHidden ||
		status == domain.ProductStatusArchived
}

func isVideoStatusValue(status domain.ProductVideoStatus) bool {
	switch status {
	case domain.ProductVideoStatusDraft,
		domain.ProductVideoStatusProcessing,
		domain.ProductVideoStatusProcessingFailed,
		domain.ProductVideoStatusReviewPending,
		domain.ProductVideoStatusPublished,
		domain.ProductVideoStatusHidden,
		domain.ProductVideoStatusRejected,
		domain.ProductVideoStatusArchived:
		return true
	default:
		return false
	}
}
