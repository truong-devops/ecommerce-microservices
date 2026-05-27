package service

import "testing"

func TestValidateCreateOrderRequestAllowsMultipleQuantityForOneProductLine(t *testing.T) {
	req := validCreateOrderRequest()
	req.Items[0].Quantity = 3

	if err := validateCreateOrderRequest(req); err != nil {
		t.Fatalf("expected one product line with quantity 3 to be valid: %v", err)
	}
}

func TestValidateCreateOrderRequestRejectsMultipleProductLines(t *testing.T) {
	req := validCreateOrderRequest()
	req.Items = append(req.Items, CreateOrderItemRequest{
		ProductID:   "product-2",
		SKU:         "SKU-2",
		ProductName: "Bowl",
		Quantity:    1,
		UnitPrice:   20,
	})

	if err := validateCreateOrderRequest(req); err == nil {
		t.Fatal("expected separate product lines in one order to be rejected")
	}
}

func validCreateOrderRequest() CreateOrderRequest {
	ward := "Phuong 4"
	province := "Thanh pho Ho Chi Minh"
	return CreateOrderRequest{
		SellerID:          "11111111-1111-4111-8111-111111111111",
		Currency:          "VND",
		PaymentMethod:     "COD",
		RecipientName:     "Buyer",
		RecipientPhone:    "84901234567",
		RecipientAddress:  "18A Cong Hoa",
		RecipientWard:     &ward,
		RecipientProvince: &province,
		Items: []CreateOrderItemRequest{{
			ProductID:   "product-1",
			SKU:         "SKU-1",
			ProductName: "Scissors",
			Quantity:    1,
			UnitPrice:   10,
		}},
	}
}
