package service

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"order-service/internal/domain"
	"order-service/internal/httpx"

	"github.com/google/uuid"
)

const (
	sameProvinceShippingFee = 10000
	sameRegionShippingFee   = 20000
	crossRegionShippingFee  = 30000
)

type shippingRegion string

const (
	shippingRegionNorth   shippingRegion = "north"
	shippingRegionCentral shippingRegion = "central"
	shippingRegionSouth   shippingRegion = "south"
)

var provinceRegionByKey = map[string]shippingRegion{
	"ha noi":      shippingRegionNorth,
	"hai phong":   shippingRegionNorth,
	"quang ninh":  shippingRegionNorth,
	"lang son":    shippingRegionNorth,
	"cao bang":    shippingRegionNorth,
	"tuyen quang": shippingRegionNorth,
	"lao cai":     shippingRegionNorth,
	"thai nguyen": shippingRegionNorth,
	"phu tho":     shippingRegionNorth,
	"bac ninh":    shippingRegionNorth,
	"hung yen":    shippingRegionNorth,
	"ninh binh":   shippingRegionNorth,
	"dien bien":   shippingRegionNorth,

	"hue":        shippingRegionCentral,
	"da nang":    shippingRegionCentral,
	"thanh hoa":  shippingRegionCentral,
	"nghe an":    shippingRegionCentral,
	"ha tinh":    shippingRegionCentral,
	"quang tri":  shippingRegionCentral,
	"quang ngai": shippingRegionCentral,
	"gia lai":    shippingRegionCentral,
	"khanh hoa":  shippingRegionCentral,
	"lam dong":   shippingRegionCentral,
	"dak lak":    shippingRegionCentral,

	"ho chi minh": shippingRegionSouth,
	"can tho":     shippingRegionSouth,
	"dong nai":    shippingRegionSouth,
	"tay ninh":    shippingRegionSouth,
	"vinh long":   shippingRegionSouth,
	"dong thap":   shippingRegionSouth,
	"an giang":    shippingRegionSouth,
	"ca mau":      shippingRegionSouth,
	"kien giang":  shippingRegionSouth,
	"ben tre":     shippingRegionSouth,
}

var provinceAliases = map[string]string{
	"hcm":              "ho chi minh",
	"ho chi minh city": "ho chi minh",
	"saigon":           "ho chi minh",
	"sai gon":          "ho chi minh",
	"thua thien hue":   "hue",
}

func (s *OrderService) deriveShippingAmount(ctx context.Context, req CreateOrderRequest) (float64, error) {
	destinationProvince := trimStringPtr(req.RecipientProvince)
	if destinationProvince == "" {
		if req.ShippingAmount != nil {
			return roundMoney(*req.ShippingAmount), nil
		}
		return 0, nil
	}

	if s == nil || s.sellerProfiles == nil {
		return 0, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Seller profile dependency is not configured", nil)
	}

	pickupAddress, err := s.sellerProfiles.GetPickupAddress(ctx, req.SellerID)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(pickupAddress.Province) == "" {
		return 0, validationError("sellerId", "seller pickup province is required")
	}

	return calculateShippingFee(pickupAddress.Province, destinationProvince), nil
}

func (s *OrderService) QuoteShipping(ctx context.Context, _ domain.UserContext, req ShippingQuoteRequest) (map[string]any, error) {
	destinationProvince := strings.TrimSpace(req.DestinationProvince)
	if destinationProvince == "" {
		return nil, validationError("destinationProvince", "is required")
	}
	if len(destinationProvince) > 128 {
		return nil, validationError("destinationProvince", "max length is 128")
	}

	sellerIDs, err := normalizeQuoteSellerIDs(req.SellerIDs)
	if err != nil {
		return nil, err
	}

	if s == nil || s.sellerProfiles == nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Seller profile dependency is not configured", nil)
	}

	items := make([]map[string]any, 0, len(sellerIDs))
	for _, sellerID := range sellerIDs {
		pickupAddress, err := s.sellerProfiles.GetPickupAddress(ctx, sellerID)
		if err != nil {
			return nil, err
		}
		originProvince := strings.TrimSpace(pickupAddress.Province)
		if originProvince == "" {
			return nil, validationError("sellerIds", "seller pickup province is required")
		}

		items = append(items, map[string]any{
			"sellerId":            sellerID,
			"originProvince":      originProvince,
			"originProvinceCode":  pickupAddress.ProvinceCode,
			"destinationProvince": destinationProvince,
			"shippingAmount":      calculateShippingFee(originProvince, destinationProvince),
		})
	}

	return map[string]any{"items": items}, nil
}

func normalizeQuoteSellerIDs(rawSellerIDs []string) ([]string, error) {
	if len(rawSellerIDs) == 0 {
		return nil, validationError("sellerIds", "must contain at least 1 seller id")
	}
	if len(rawSellerIDs) > 50 {
		return nil, validationError("sellerIds", "must contain at most 50 seller ids")
	}

	sellerIDs := make([]string, 0, len(rawSellerIDs))
	seen := make(map[string]struct{}, len(rawSellerIDs))
	for index, rawSellerID := range rawSellerIDs {
		sellerID := strings.TrimSpace(rawSellerID)
		if _, err := uuid.Parse(sellerID); err != nil {
			return nil, validationError("sellerIds["+strconv.Itoa(index)+"]", "must be a valid UUID")
		}
		if _, ok := seen[sellerID]; ok {
			continue
		}
		seen[sellerID] = struct{}{}
		sellerIDs = append(sellerIDs, sellerID)
	}
	return sellerIDs, nil
}

func calculateShippingFee(originProvince, destinationProvince string) float64 {
	destinationKey := canonicalProvinceKey(destinationProvince)
	if destinationKey == "" {
		return 0
	}

	originKey := canonicalProvinceKey(originProvince)
	if originKey == destinationKey {
		return sameProvinceShippingFee
	}

	originRegion, hasOriginRegion := provinceRegionByKey[originKey]
	destinationRegion, hasDestinationRegion := provinceRegionByKey[destinationKey]
	if hasOriginRegion && hasDestinationRegion && originRegion == destinationRegion {
		return sameRegionShippingFee
	}

	return crossRegionShippingFee
}

func canonicalProvinceKey(province string) string {
	normalized := normalizeProvinceKey(province)
	if alias, ok := provinceAliases[normalized]; ok {
		return alias
	}
	return normalized
}

func normalizeProvinceKey(province string) string {
	normalized := strings.ToLower(strings.TrimSpace(province))
	normalized = vietnameseReplacer.Replace(normalized)
	normalized = separatorReplacer.Replace(normalized)
	normalized = strings.Join(strings.Fields(normalized), " ")
	for _, prefix := range []string{"tinh ", "thanh pho ", "tp "} {
		normalized = strings.TrimPrefix(normalized, prefix)
	}
	return strings.TrimSpace(normalized)
}

var vietnameseReplacer = strings.NewReplacer(
	"à", "a", "á", "a", "ạ", "a", "ả", "a", "ã", "a",
	"â", "a", "ầ", "a", "ấ", "a", "ậ", "a", "ẩ", "a", "ẫ", "a",
	"ă", "a", "ằ", "a", "ắ", "a", "ặ", "a", "ẳ", "a", "ẵ", "a",
	"è", "e", "é", "e", "ẹ", "e", "ẻ", "e", "ẽ", "e",
	"ê", "e", "ề", "e", "ế", "e", "ệ", "e", "ể", "e", "ễ", "e",
	"ì", "i", "í", "i", "ị", "i", "ỉ", "i", "ĩ", "i",
	"ò", "o", "ó", "o", "ọ", "o", "ỏ", "o", "õ", "o",
	"ô", "o", "ồ", "o", "ố", "o", "ộ", "o", "ổ", "o", "ỗ", "o",
	"ơ", "o", "ờ", "o", "ớ", "o", "ợ", "o", "ở", "o", "ỡ", "o",
	"ù", "u", "ú", "u", "ụ", "u", "ủ", "u", "ũ", "u",
	"ư", "u", "ừ", "u", "ứ", "u", "ự", "u", "ử", "u", "ữ", "u",
	"ỳ", "y", "ý", "y", "ỵ", "y", "ỷ", "y", "ỹ", "y",
	"đ", "d",
)

var separatorReplacer = strings.NewReplacer(
	"-", " ",
	"_", " ",
	".", " ",
	",", " ",
	"/", " ",
	"(", " ",
	")", " ",
)
