package apperrors

type Code string

const (
	CodeBadRequest         Code = "BAD_REQUEST"
	CodeUnauthorized       Code = "UNAUTHORIZED"
	CodeForbidden          Code = "FORBIDDEN"
	CodeNotFound           Code = "NOT_FOUND"
	CodeTooManyRequests    Code = "TOO_MANY_REQUESTS"
	CodeBadGateway         Code = "BAD_GATEWAY"
	CodeServiceUnavailable Code = "SERVICE_UNAVAILABLE"
	CodeInternalServer     Code = "INTERNAL_SERVER_ERROR"
	CodeUpstreamTimeout    Code = "UPSTREAM_TIMEOUT"
)
