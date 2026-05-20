package service

import (
	"regexp"
	"strings"
	"unicode"
)

const (
	chatSafetyActionAllow = "allow"
	chatSafetyActionBlock = "block"

	chatSafetyBlockThreshold = 80

	chatRulePhoneNumber             = "phone_number"
	chatRuleEmail                   = "email"
	chatRuleExternalLink            = "external_link"
	chatRuleExternalContactPlatform = "external_contact_platform"
	chatRuleExternalContactIntent   = "external_contact_intent"
	chatRuleOffPlatformPayment      = "off_platform_payment"
	chatRuleAddressExchange         = "address_exchange"
	chatRuleObfuscatedContact       = "obfuscated_contact"

	chatSafetyBlockedMessage = "Tin nhắn chứa thông tin liên hệ hoặc giao dịch ngoài sàn nên không thể gửi."
)

type ChatSafetyDecision struct {
	Allowed    bool               `json:"allowed"`
	Action     string             `json:"action"`
	Score      int                `json:"score"`
	Reason     string             `json:"reason"`
	RuleID     string             `json:"ruleId"`
	Signals    []ChatSafetySignal `json:"signals"`
	MaskedText string             `json:"maskedText"`
}

type ChatSafetySignal struct {
	RuleID       string `json:"ruleId"`
	Score        int    `json:"score"`
	EvidenceType string `json:"evidenceType"`
}

type NormalizedChatText struct {
	Original       string
	NormalizedText string
	CompactText    string
	DigitStreams   []string
}

var (
	chatSafetyEmailPattern       = regexp.MustCompile(`(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`)
	chatSafetyURLPattern         = regexp.MustCompile(`(?i)(https?://|www\.)[^\s]+`)
	chatSafetyDomainLikePattern  = regexp.MustCompile(`(?i)\b[a-z0-9][a-z0-9\-]{1,}\.(com|vn|net|org|io|co)\b`)
	chatSafetyPhonePattern       = regexp.MustCompile(`(?:\+?84|0)[\d\s.\-_]{7,14}\d`)
	chatSafetyLongDigitRun       = regexp.MustCompile(`\d{8,12}`)
	chatSafetyWordOrNumberRegexp = regexp.MustCompile(`[a-z0-9]+`)
)

var vietnameseDigitWords = map[string]string{
	"khong": "0",
	"zero":  "0",
	"mot":   "1",
	"một":   "1",
	"hai":   "2",
	"ba":    "3",
	"bon":   "4",
	"bốn":   "4",
	"tu":    "4",
	"tư":    "4",
	"nam":   "5",
	"năm":   "5",
	"lam":   "5",
	"lăm":   "5",
	"sau":   "6",
	"sáu":   "6",
	"bay":   "7",
	"bảy":   "7",
	"tam":   "8",
	"tám":   "8",
	"chin":  "9",
	"chín":  "9",
}

var diacriticReplacer = strings.NewReplacer(
	"á", "a", "à", "a", "ả", "a", "ã", "a", "ạ", "a", "ă", "a", "ắ", "a", "ằ", "a", "ẳ", "a", "ẵ", "a", "ặ", "a", "â", "a", "ấ", "a", "ầ", "a", "ẩ", "a", "ẫ", "a", "ậ", "a",
	"đ", "d",
	"é", "e", "è", "e", "ẻ", "e", "ẽ", "e", "ẹ", "e", "ê", "e", "ế", "e", "ề", "e", "ể", "e", "ễ", "e", "ệ", "e",
	"í", "i", "ì", "i", "ỉ", "i", "ĩ", "i", "ị", "i",
	"ó", "o", "ò", "o", "ỏ", "o", "õ", "o", "ọ", "o", "ô", "o", "ố", "o", "ồ", "o", "ổ", "o", "ỗ", "o", "ộ", "o", "ơ", "o", "ớ", "o", "ờ", "o", "ở", "o", "ỡ", "o", "ợ", "o",
	"ú", "u", "ù", "u", "ủ", "u", "ũ", "u", "ụ", "u", "ư", "u", "ứ", "u", "ừ", "u", "ử", "u", "ữ", "u", "ự", "u",
	"ý", "y", "ỳ", "y", "ỷ", "y", "ỹ", "y", "ỵ", "y",
)

func ValidateChatMessage(text string) ChatSafetyDecision {
	normalized := NormalizeChatText(text)
	signals := ExtractChatSafetySignals(normalized)
	score := ScoreChatSafetySignals(signals)
	if score >= chatSafetyBlockThreshold {
		return ChatSafetyDecision{
			Allowed:    false,
			Action:     chatSafetyActionBlock,
			Score:      score,
			Reason:     chatSafetyBlockedMessage,
			RuleID:     primaryChatSafetyRule(signals),
			Signals:    signals,
			MaskedText: MaskSensitiveChatText(text),
		}
	}

	return ChatSafetyDecision{
		Allowed:    true,
		Action:     chatSafetyActionAllow,
		Score:      score,
		Signals:    signals,
		MaskedText: strings.TrimSpace(text),
	}
}

func NormalizeChatText(text string) NormalizedChatText {
	original := strings.TrimSpace(text)
	lowered := strings.ToLower(original)
	noAccent := diacriticReplacer.Replace(lowered)
	tokens := chatSafetyWordOrNumberRegexp.FindAllString(noAccent, -1)
	normalizedTokens := make([]string, 0, len(tokens))
	for _, token := range tokens {
		if digit, ok := vietnameseDigitWords[token]; ok {
			normalizedTokens = append(normalizedTokens, digit)
			continue
		}
		normalizedTokens = append(normalizedTokens, token)
	}

	normalizedText := strings.Join(normalizedTokens, " ")
	compactText := strings.Join(normalizedTokens, "")
	return NormalizedChatText{
		Original:       original,
		NormalizedText: normalizedText,
		CompactText:    compactText,
		DigitStreams:   buildDigitStreams(normalizedTokens),
	}
}

func ExtractChatSafetySignals(normalized NormalizedChatText) []ChatSafetySignal {
	signals := make([]ChatSafetySignal, 0)
	original := normalized.Original
	text := normalized.NormalizedText
	compact := normalized.CompactText

	if hasPhoneSignal(original, normalized.DigitStreams) {
		signals = append(signals, ChatSafetySignal{RuleID: chatRulePhoneNumber, Score: 90, EvidenceType: "phone"})
	}
	if chatSafetyEmailPattern.MatchString(original) || chatSafetyEmailPattern.MatchString(text) {
		signals = append(signals, ChatSafetySignal{RuleID: chatRuleEmail, Score: 90, EvidenceType: "email"})
	}
	if chatSafetyURLPattern.MatchString(original) || chatSafetyDomainLikePattern.MatchString(original) || chatSafetyDomainLikePattern.MatchString(text) {
		signals = append(signals, ChatSafetySignal{RuleID: chatRuleExternalLink, Score: 80, EvidenceType: "url"})
	}
	if containsAny(compact, []string{"zalo", "facebook", "messenger", "telegram", "viber", "whatsapp", "instagram", "tiktokinbox"}) || containsWord(text, []string{"fb", "tele", "ig"}) {
		signals = append(signals, ChatSafetySignal{RuleID: chatRuleExternalContactPlatform, Score: 80, EvidenceType: "platform"})
	}
	if containsAny(compact, []string{"ketban", "nhanrieng", "goiminh", "goishop", "inbox", "apparieng", "appkhac", "lienhengoi", "lienhengoa", "lienhengoaissan"}) || containsWord(text, []string{"kb", "add", "ib"}) {
		signals = append(signals, ChatSafetySignal{RuleID: chatRuleExternalContactIntent, Score: 40, EvidenceType: "intent"})
	}
	if containsAny(compact, []string{"chuyenkhoan", "sotaikhoan", "nganhang", "viettelpay", "zalopay"}) || containsWord(text, []string{"ck", "stk", "bank", "momo"}) {
		signals = append(signals, ChatSafetySignal{RuleID: chatRuleOffPlatformPayment, Score: 90, EvidenceType: "payment"})
	}
	if containsAny(compact, []string{"diachi", "nhatoi", "qualay", "giaongoai", "shipngoai", "denlay", "toio"}) {
		signals = append(signals, ChatSafetySignal{RuleID: chatRuleAddressExchange, Score: 80, EvidenceType: "address"})
	}
	if containsObfuscatedContact(normalized) {
		signals = append(signals, ChatSafetySignal{RuleID: chatRuleObfuscatedContact, Score: 30, EvidenceType: "obfuscation"})
	}

	return signals
}

func ScoreChatSafetySignals(signals []ChatSafetySignal) int {
	total := 0
	for _, signal := range signals {
		total += signal.Score
	}
	return total
}

func MaskSensitiveChatText(text string) string {
	masked := chatSafetyEmailPattern.ReplaceAllStringFunc(text, maskEmail)
	masked = chatSafetyURLPattern.ReplaceAllString(masked, "[link da an]")
	masked = chatSafetyPhonePattern.ReplaceAllStringFunc(masked, maskPhoneCandidate)
	masked = chatSafetyLongDigitRun.ReplaceAllStringFunc(masked, maskDigits)
	return masked
}

func primaryChatSafetyRule(signals []ChatSafetySignal) string {
	if len(signals) == 0 {
		return ""
	}
	best := signals[0]
	for _, signal := range signals[1:] {
		if signal.Score > best.Score {
			best = signal
		}
	}
	return best.RuleID
}

func hasPhoneSignal(original string, digitStreams []string) bool {
	if chatSafetyPhonePattern.MatchString(original) {
		return true
	}
	for _, stream := range digitStreams {
		if isLikelyPhoneDigits(stream) {
			return true
		}
	}
	return false
}

func buildDigitStreams(tokens []string) []string {
	streams := make([]string, 0)
	current := strings.Builder{}
	flush := func() {
		if current.Len() > 0 {
			streams = append(streams, current.String())
			current.Reset()
		}
	}

	for _, token := range tokens {
		if token == "" {
			continue
		}
		if isDigitToken(token) {
			current.WriteString(token)
			continue
		}
		if current.Len() > 0 && len(token) <= 2 && isLikelyDigitTypoToken(token) {
			current.WriteString(normalizeDigitTypoToken(token))
			continue
		}
		flush()
	}
	flush()
	return streams
}

func isLikelyPhoneDigits(value string) bool {
	digits := onlyDigits(value)
	if len(digits) >= 9 && len(digits) <= 11 && strings.HasPrefix(digits, "0") {
		return true
	}
	if len(digits) >= 10 && len(digits) <= 12 && strings.HasPrefix(digits, "84") {
		return true
	}
	return false
}

func isDigitToken(token string) bool {
	for _, char := range token {
		if !unicode.IsDigit(char) {
			return false
		}
	}
	return token != ""
}

func isLikelyDigitTypoToken(token string) bool {
	for _, char := range token {
		if !strings.ContainsRune("oil", char) {
			return false
		}
	}
	return token != ""
}

func normalizeDigitTypoToken(token string) string {
	replacer := strings.NewReplacer("o", "0", "i", "1", "l", "1")
	return replacer.Replace(token)
}

func containsAny(value string, needles []string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}

func containsWord(value string, words []string) bool {
	fields := strings.Fields(value)
	for _, field := range fields {
		for _, word := range words {
			if field == word {
				return true
			}
		}
	}
	return false
}

func containsObfuscatedContact(normalized NormalizedChatText) bool {
	return (strings.Contains(normalized.NormalizedText, " ") && containsAny(normalized.CompactText, []string{"zalo", "sdt"})) || len(normalized.DigitStreams) > 0
}

func onlyDigits(value string) string {
	builder := strings.Builder{}
	for _, char := range value {
		if unicode.IsDigit(char) {
			builder.WriteRune(char)
		}
	}
	return builder.String()
}

func maskEmail(value string) string {
	parts := strings.SplitN(value, "@", 2)
	if len(parts) != 2 || parts[0] == "" {
		return "***"
	}
	return string([]rune(parts[0])[0]) + "***@" + parts[1]
}

func maskPhoneCandidate(value string) string {
	digits := onlyDigits(value)
	if len(digits) < 4 {
		return "***"
	}
	return maskDigits(digits)
}

func maskDigits(value string) string {
	runes := []rune(value)
	if len(runes) <= 4 {
		return strings.Repeat("*", len(runes))
	}
	return string(runes[:2]) + strings.Repeat("*", len(runes)-4) + string(runes[len(runes)-2:])
}
