package domain

const (
	ErrorCodeBadRequest          = "BAD_REQUEST"
	ErrorCodeUnauthorized        = "UNAUTHORIZED"
	ErrorCodeForbidden           = "FORBIDDEN"
	ErrorCodeNotFound            = "NOT_FOUND"
	ErrorCodeConflict            = "CONFLICT"
	ErrorCodeValidationFailed    = "VALIDATION_FAILED"
	ErrorCodeInternalServerError = "INTERNAL_SERVER_ERROR"
	ErrorCodeServiceUnavailable  = "SERVICE_UNAVAILABLE"
	ErrorCodeWalletNotFound      = "WALLET_NOT_FOUND"
	ErrorCodeInvalidMoney        = "INVALID_MONEY"
	ErrorCodeInvalidEvent        = "INVALID_EVENT"
	ErrorCodeWalletFrozen        = "WALLET_FROZEN"
	ErrorCodeBankAccountNotFound = "BANK_ACCOUNT_NOT_FOUND"
	ErrorCodePayoutNotFound      = "PAYOUT_NOT_FOUND"
	ErrorCodePayoutDisabled      = "PAYOUT_DISABLED"
	ErrorCodeInsufficientBalance = "INSUFFICIENT_AVAILABLE_BALANCE"
	ErrorCodeIdempotencyConflict = "IDEMPOTENCY_CONFLICT"
)
