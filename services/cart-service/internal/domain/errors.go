package domain

const (
	ErrorCodeBadRequest                = "BAD_REQUEST"
	ErrorCodeUnauthorized              = "UNAUTHORIZED"
	ErrorCodeForbidden                 = "FORBIDDEN"
	ErrorCodeNotFound                  = "NOT_FOUND"
	ErrorCodeConflict                  = "CONFLICT"
	ErrorCodeValidationFailed          = "VALIDATION_FAILED"
	ErrorCodeInternalServerError       = "INTERNAL_SERVER_ERROR"
	ErrorCodeServiceUnavailable        = "SERVICE_UNAVAILABLE"
	ErrorCodeCartNotFound              = "CART_NOT_FOUND"
	ErrorCodeCartItemNotFound          = "CART_ITEM_NOT_FOUND"
	ErrorCodeCartVersionConflict       = "CART_VERSION_CONFLICT"
	ErrorCodeCartQuantityInvalid       = "CART_QUANTITY_INVALID"
	ErrorCodeCartQuantityExceeded      = "CART_QUANTITY_EXCEEDED"
	ErrorCodeCartDependencyUnavailable = "CART_DEPENDENCY_UNAVAILABLE"
)
