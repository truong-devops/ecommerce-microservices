package nexus

type CreateOrderRequest struct {
	External ExternalOrder   `json:"external"`
	Merchant Merchant        `json:"merchant"`
	Sender   AddressContact  `json:"sender"`
	Receiver Receiver        `json:"receiver"`
	Parcel   Parcel          `json:"parcel"`
	Service  DeliveryService `json:"service"`
	Payment  Payment         `json:"payment"`
	Options  CreateOptions   `json:"options"`
}

type ExternalOrder struct {
	Platform          string `json:"platform"`
	ShopID            string `json:"shopId"`
	ExternalOrderID   string `json:"externalOrderId"`
	ExternalOrderCode string `json:"externalOrderCode"`
	OrderCreatedAt    string `json:"orderCreatedAt"`
	OrderStatus       string `json:"orderStatus"`
}

type Merchant struct {
	MerchantID string `json:"merchantId"`
	ShopName   string `json:"shopName"`
}

type AddressContact struct {
	Name     string `json:"name"`
	Phone    string `json:"phone"`
	Address  string `json:"address"`
	Ward     string `json:"ward,omitempty"`
	District string `json:"district,omitempty"`
	Province string `json:"province,omitempty"`
	HubCode  string `json:"hubCode,omitempty"`
}

type Receiver struct {
	Name     string `json:"name"`
	Phone    string `json:"phone"`
	Address  string `json:"address"`
	Ward     string `json:"ward,omitempty"`
	District string `json:"district,omitempty"`
	Province string `json:"province,omitempty"`
	Note     string `json:"note,omitempty"`
}

type Parcel struct {
	Items         []ParcelItem `json:"items"`
	WeightGram    int          `json:"weightGram"`
	LengthCM      int          `json:"lengthCm"`
	WidthCM       int          `json:"widthCm"`
	HeightCM      int          `json:"heightCm"`
	DeclaredValue float64      `json:"declaredValue"`
}

type ParcelItem struct {
	SKU       string  `json:"sku"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unitPrice"`
}

type DeliveryService struct {
	ServiceType string `json:"serviceType"`
	PickupType  string `json:"pickupType"`
}

type Payment struct {
	CODAmount              float64 `json:"codAmount"`
	ShippingFee            float64 `json:"shippingFee"`
	Payer                  string  `json:"payer"`
	CODIncludesShippingFee bool    `json:"codIncludesShippingFee"`
}

type CreateOptions struct {
	AutoCreatePickup bool   `json:"autoCreatePickup"`
	PrintLabelFormat string `json:"printLabelFormat"`
}

type CreateOrderResponse struct {
	Success bool `json:"success"`
	Data    struct {
		ShipmentCode    string `json:"shipmentCode"`
		ExternalOrderID string `json:"externalOrderId"`
		Status          string `json:"status"`
		TrackingURL     string `json:"trackingUrl"`
		Pickup          struct {
			PickupCode string `json:"pickupCode"`
			Status     string `json:"status"`
		} `json:"pickup"`
		Label struct {
			Format string `json:"format"`
			URL    string `json:"url"`
		} `json:"label"`
		CreatedAt string `json:"createdAt"`
	} `json:"data"`
}

type WebhookEvent struct {
	EventID    string         `json:"eventId"`
	EventType  string         `json:"eventType"`
	OccurredAt string         `json:"occurredAt"`
	Data       map[string]any `json:"data"`
}
