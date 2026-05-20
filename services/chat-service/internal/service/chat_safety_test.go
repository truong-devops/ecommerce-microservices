package service

import "testing"

func TestValidateChatMessageBlocksSensitiveContent(t *testing.T) {
	tests := []struct {
		name   string
		text   string
		ruleID string
	}{
		{name: "plain phone", text: "shop gọi mình 0901234567 nhé", ruleID: chatRulePhoneNumber},
		{name: "phone with spaces", text: "sdt 090 123 4567", ruleID: chatRulePhoneNumber},
		{name: "phone with dots", text: "liên hệ 090.123.4567", ruleID: chatRulePhoneNumber},
		{name: "phone with country code", text: "zalo +84901234567", ruleID: chatRulePhoneNumber},
		{name: "phone as words", text: "không chín không một hai ba bốn năm sáu bảy", ruleID: chatRulePhoneNumber},
		{name: "email", text: "mail mình abc@gmail.com", ruleID: chatRuleEmail},
		{name: "external link", text: "xem ở https://facebook.com/shop", ruleID: chatRuleExternalLink},
		{name: "domain link", text: "vào abc.com xem thêm", ruleID: chatRuleExternalLink},
		{name: "platform obfuscated", text: "kb z a l o mình nha", ruleID: chatRuleExternalContactPlatform},
		{name: "payment", text: "chuyển khoản qua stk này giúp shop", ruleID: chatRuleOffPlatformPayment},
		{name: "address exchange", text: "qua lấy ở địa chỉ nhà tôi", ruleID: chatRuleAddressExchange},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			decision := ValidateChatMessage(tt.text)
			if decision.Allowed {
				t.Fatalf("expected message to be blocked, got allowed with score %d", decision.Score)
			}
			if decision.RuleID != tt.ruleID {
				t.Fatalf("expected primary rule %q, got %q with signals %#v", tt.ruleID, decision.RuleID, decision.Signals)
			}
			if decision.MaskedText == "" {
				t.Fatalf("expected masked text")
			}
		})
	}
}

func TestValidateChatMessageAllowsProductQuestions(t *testing.T) {
	tests := []string{
		"Áo này còn size M không?",
		"Shop giao trong bao lâu?",
		"Sản phẩm này có bảo hành không?",
		"Mã đơn hàng EMX4000001 của mình đang ở đâu?",
		"Mình muốn đổi màu đen được không?",
		"iPhone 15 Pro Max còn hàng không?",
		"size 42 còn không",
	}

	for _, text := range tests {
		t.Run(text, func(t *testing.T) {
			decision := ValidateChatMessage(text)
			if !decision.Allowed {
				t.Fatalf("expected message to be allowed, got blocked: rule=%s score=%d signals=%#v", decision.RuleID, decision.Score, decision.Signals)
			}
		})
	}
}

func TestNormalizeChatTextCompactsObfuscation(t *testing.T) {
	normalized := NormalizeChatText("kb z.a-l_o mình nha 0 chín 0 một hai")
	if normalized.CompactText != "kbzalominhnha09012" {
		t.Fatalf("unexpected compact text: %q", normalized.CompactText)
	}
	if len(normalized.DigitStreams) != 1 || normalized.DigitStreams[0] != "09012" {
		t.Fatalf("unexpected digit streams: %#v", normalized.DigitStreams)
	}
}

func TestMaskSensitiveChatText(t *testing.T) {
	masked := MaskSensitiveChatText("mail abc@gmail.com sdt 0901234567 link https://example.com")
	if masked == "mail abc@gmail.com sdt 0901234567 link https://example.com" {
		t.Fatalf("expected sensitive text to be masked")
	}
	if containsAny(masked, []string{"abc@gmail.com", "0901234567", "https://example.com"}) {
		t.Fatalf("masked text still contains sensitive value: %q", masked)
	}
}
