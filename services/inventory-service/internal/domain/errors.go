package domain

const (
	ErrorCodeBadRequest                   = "BAD_REQUEST"
	ErrorCodeUnauthorized                 = "UNAUTHORIZED"
	ErrorCodeForbidden                    = "FORBIDDEN"
	ErrorCodeNotFound                     = "NOT_FOUND"
	ErrorCodeConflict                     = "CONFLICT"
	ErrorCodeValidationFailed             = "VALIDATION_FAILED"
	ErrorCodeInternalServerError          = "INTERNAL_SERVER_ERROR"
	ErrorCodeServiceUnavailable           = "SERVICE_UNAVAILABLE"
	ErrorCodeInventorySkuNotFound         = "INVENTORY_SKU_NOT_FOUND"
	ErrorCodeInventoryInsufficientStock   = "INVENTORY_INSUFFICIENT_STOCK"
	ErrorCodeInventoryReservationNotFound = "INVENTORY_RESERVATION_NOT_FOUND"
	ErrorCodeInventoryReservationConflict = "INVENTORY_RESERVATION_CONFLICT"
	ErrorCodeInventoryNegativeStock       = "INVENTORY_NEGATIVE_STOCK"
	ErrorCodeInventoryInvalidAdjustment   = "INVENTORY_INVALID_ADJUSTMENT"
)
