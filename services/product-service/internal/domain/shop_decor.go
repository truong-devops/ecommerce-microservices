package domain

import "time"

type ShopDecor struct {
	SellerID           string
	ShopName           string
	Slogan             string
	LogoURL            string
	BannerURL          string
	AccentColor        string
	NavItems           []string
	IntroTitle         string
	IntroDescription   string
	FeaturedCategories []string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type ShopDecorResponse struct {
	SellerID           string   `json:"sellerId"`
	SellerCode         string   `json:"sellerCode"`
	ShopName           string   `json:"shopName"`
	Slogan             string   `json:"slogan"`
	LogoURL            string   `json:"logoUrl"`
	BannerURL          string   `json:"bannerUrl"`
	AccentColor        string   `json:"accentColor"`
	NavItems           []string `json:"navItems"`
	IntroTitle         string   `json:"introTitle"`
	IntroDescription   string   `json:"introDescription"`
	FeaturedCategories []string `json:"featuredCategories"`
	UpdatedAt          string   `json:"updatedAt"`
}
