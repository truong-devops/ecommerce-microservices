package domain

const (
	ErrorCodeBadRequest                 = "BAD_REQUEST"
	ErrorCodeUnauthorized               = "UNAUTHORIZED"
	ErrorCodeForbidden                  = "FORBIDDEN"
	ErrorCodeNotFound                   = "NOT_FOUND"
	ErrorCodeConflict                   = "CONFLICT"
	ErrorCodeTooManyRequests            = "TOO_MANY_REQUESTS"
	ErrorCodeValidationFailed           = "VALIDATION_FAILED"
	ErrorCodeInvalidStatusTransition    = "INVALID_SHIPMENT_STATUS_TRANSITION"
	ErrorCodeWebhookIdempotencyConflict = "WEBHOOK_IDEMPOTENCY_CONFLICT"
	ErrorCodeInternalServerError        = "INTERNAL_SERVER_ERROR"
	ErrorCodeServiceUnavailable         = "SERVICE_UNAVAILABLE"
)
