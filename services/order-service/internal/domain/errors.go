package domain

const (
	ErrorCodeBadRequest                   = "BAD_REQUEST"
	ErrorCodeUnauthorized                 = "UNAUTHORIZED"
	ErrorCodeForbidden                    = "FORBIDDEN"
	ErrorCodeNotFound                     = "NOT_FOUND"
	ErrorCodeConflict                     = "CONFLICT"
	ErrorCodeValidationFailed             = "VALIDATION_FAILED"
	ErrorCodeInvalidOrderStatusTransition = "INVALID_ORDER_STATUS_TRANSITION"
	ErrorCodeIdempotencyConflict          = "IDEMPOTENCY_CONFLICT"
	ErrorCodeInternalServerError          = "INTERNAL_SERVER_ERROR"
	ErrorCodeServiceUnavailable           = "SERVICE_UNAVAILABLE"
)
