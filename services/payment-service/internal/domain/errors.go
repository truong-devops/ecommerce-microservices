package domain

const (
	ErrorCodeBadRequest                     = "BAD_REQUEST"
	ErrorCodeUnauthorized                   = "UNAUTHORIZED"
	ErrorCodeForbidden                      = "FORBIDDEN"
	ErrorCodeNotFound                       = "NOT_FOUND"
	ErrorCodeConflict                       = "CONFLICT"
	ErrorCodeValidationFailed               = "VALIDATION_FAILED"
	ErrorCodePaymentNotFound                = "PAYMENT_NOT_FOUND"
	ErrorCodePaymentAlreadyCaptured         = "PAYMENT_ALREADY_CAPTURED"
	ErrorCodePaymentAmountMismatch          = "PAYMENT_AMOUNT_MISMATCH"
	ErrorCodePaymentCurrencyMismatch        = "PAYMENT_CURRENCY_MISMATCH"
	ErrorCodeRefundAmountExceeded           = "REFUND_AMOUNT_EXCEEDED"
	ErrorCodeIdempotencyConflict            = "IDEMPOTENCY_CONFLICT"
	ErrorCodeWebhookIdempotencyConflict     = "WEBHOOK_IDEMPOTENCY_CONFLICT"
	ErrorCodeInvalidPaymentStatusTransition = "INVALID_PAYMENT_STATUS_TRANSITION"
	ErrorCodeGatewayCallbackInvalidSig      = "GATEWAY_CALLBACK_INVALID_SIGNATURE"
	ErrorCodePaymentGatewayUnavailable      = "PAYMENT_GATEWAY_UNAVAILABLE"
	ErrorCodeInternalServerError            = "INTERNAL_SERVER_ERROR"
	ErrorCodeServiceUnavailable             = "SERVICE_UNAVAILABLE"
)
