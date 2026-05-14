package service

import (
	"context"
	"testing"
)

func TestNormalizeExtensionAllowsSupportedVideoTypes(t *testing.T) {
	tests := []struct {
		name        string
		fileName    string
		contentType string
		want        string
	}{
		{name: "mp4", fileName: "demo.mp4", contentType: "video/mp4", want: ".mp4"},
		{name: "webm", fileName: "demo.webm", contentType: "video/webm", want: ".webm"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeExtension(tc.fileName, tc.contentType); got != tc.want {
				t.Fatalf("normalizeExtension() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestNormalizeExtensionRejectsMismatchedVideoTypes(t *testing.T) {
	tests := []struct {
		name        string
		fileName    string
		contentType string
	}{
		{name: "mp4 with webm content", fileName: "demo.mp4", contentType: "video/webm"},
		{name: "webm with mp4 content", fileName: "demo.webm", contentType: "video/mp4"},
		{name: "mov unsupported", fileName: "demo.mov", contentType: "video/quicktime"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeExtension(tc.fileName, tc.contentType); got != "" {
				t.Fatalf("normalizeExtension() = %q, want empty", got)
			}
		})
	}
}

func TestIsSupportedUploadContentType(t *testing.T) {
	allowed := []string{"image/png", "image/jpeg", "video/mp4", "video/webm"}
	for _, contentType := range allowed {
		if !isSupportedUploadContentType(contentType) {
			t.Fatalf("expected %q to be supported", contentType)
		}
	}

	rejected := []string{"video/quicktime", "application/octet-stream", ""}
	for _, contentType := range rejected {
		if isSupportedUploadContentType(contentType) {
			t.Fatalf("expected %q to be rejected", contentType)
		}
	}
}

func TestPresignUploadRejectsOversizedVideo(t *testing.T) {
	service := &StorageService{}
	tooLarge := maxVideoUploadSizeBytes + 1

	_, err := service.PresignUpload(context.Background(), PresignUploadRequest{
		EntityType:  "video",
		EntityID:    "video-1",
		FileName:    "demo.mp4",
		ContentType: "video/mp4",
		SizeBytes:   &tooLarge,
	})
	if err == nil {
		t.Fatal("expected oversized video to be rejected")
	}
}

func TestPresignUploadRequiresVideoSize(t *testing.T) {
	service := &StorageService{}

	_, err := service.PresignUpload(context.Background(), PresignUploadRequest{
		EntityType:  "video",
		EntityID:    "video-1",
		FileName:    "demo.mp4",
		ContentType: "video/mp4",
	})
	if err == nil {
		t.Fatal("expected video without sizeBytes to be rejected")
	}
}
