package service

import "net/http"

func fakeRequest() *http.Request {
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/products", nil)
	return req
}
