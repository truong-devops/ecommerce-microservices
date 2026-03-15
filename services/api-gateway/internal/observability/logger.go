package observability

import (
	"strings"

	"go.uber.org/zap"
)

func NewLogger(appEnv string) (*zap.Logger, error) {
	if strings.EqualFold(appEnv, "production") {
		return zap.NewProduction()
	}
	return zap.NewDevelopment()
}
