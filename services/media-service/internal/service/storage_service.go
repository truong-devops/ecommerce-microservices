package service

import (
	"context"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"path"
	"regexp"
	"strings"
	"time"

	"media-service/internal/config"
	"media-service/internal/domain"
	"media-service/internal/httpx"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var (
	keySegmentRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)
	objectKeyRegex  = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9/_\-.]+$`)
)

type StorageService struct {
	client        *minio.Client
	presignClient *minio.Client
	cfg           config.Config
}

type PresignUploadRequest struct {
	EntityType       string `json:"entityType"`
	EntityID         string `json:"entityId"`
	FileName         string `json:"fileName"`
	ContentType      string `json:"contentType"`
	ExpiresInSeconds *int   `json:"expiresInSeconds,omitempty"`
}

type PresignDownloadRequest struct {
	ObjectKey        string `json:"objectKey"`
	ExpiresInSeconds *int   `json:"expiresInSeconds,omitempty"`
}

type DeleteObjectRequest struct {
	ObjectKey string `json:"objectKey"`
}

type PresignUploadResponse struct {
	ObjectKey string            `json:"objectKey"`
	Method    string            `json:"method"`
	UploadURL string            `json:"uploadUrl"`
	ExpiresAt string            `json:"expiresAt"`
	Headers   map[string]string `json:"headers"`
}

type PresignDownloadResponse struct {
	ObjectKey   string `json:"objectKey"`
	Method      string `json:"method"`
	DownloadURL string `json:"downloadUrl"`
	ExpiresAt   string `json:"expiresAt"`
}

type DeleteObjectResponse struct {
	ObjectKey string `json:"objectKey"`
	Deleted   bool   `json:"deleted"`
}

func NewStorageService(cfg config.Config) (*StorageService, error) {
	client, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
		Region: cfg.MinIORegion,
	})
	if err != nil {
		return nil, err
	}

	presignClient := client
	if strings.TrimSpace(cfg.MinIOPublicEndpoint) != "" {
		publicClient, publicErr := minio.New(cfg.MinIOPublicEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
			Secure: cfg.MinIOPublicUseSSL,
			Region: cfg.MinIORegion,
		})
		if publicErr != nil {
			return nil, publicErr
		}
		presignClient = publicClient
	}

	return &StorageService{
		client:        client,
		presignClient: presignClient,
		cfg:           cfg,
	}, nil
}

func (s *StorageService) EnsureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.cfg.MinIOBucket)
	if err != nil {
		return fmt.Errorf("check media bucket failed: %w", err)
	}

	if !exists {
		if err := s.client.MakeBucket(ctx, s.cfg.MinIOBucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("create media bucket failed: %w", err)
		}
	}

	if s.cfg.MinIOPublicRead {
		if err := s.ensurePublicReadPolicy(ctx); err != nil {
			return err
		}
	}

	return nil
}

func (s *StorageService) ensurePublicReadPolicy(ctx context.Context) error {
	policy, err := buildPublicReadPolicy(s.cfg.MinIOBucket)
	if err != nil {
		return fmt.Errorf("marshal media bucket policy failed: %w", err)
	}

	if err := s.client.SetBucketPolicy(ctx, s.cfg.MinIOBucket, policy); err != nil {
		return fmt.Errorf("set media bucket policy failed: %w", err)
	}

	return nil
}

func (s *StorageService) Ready(ctx context.Context) error {
	_, err := s.client.ListBuckets(ctx)
	if err != nil {
		return fmt.Errorf("minio unavailable: %w", err)
	}
	return nil
}

func (s *StorageService) PresignUpload(ctx context.Context, req PresignUploadRequest) (PresignUploadResponse, error) {
	contentType := strings.ToLower(strings.TrimSpace(req.ContentType))
	if !isSupportedUploadContentType(contentType) {
		return PresignUploadResponse{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "contentType must be image/*, video/mp4, or video/webm", nil)
	}

	entityType := normalizeSegment(req.EntityType)
	entityID := normalizeSegment(req.EntityID)
	if entityType == "" || !keySegmentRegex.MatchString(entityType) {
		return PresignUploadResponse{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "entityType is invalid", nil)
	}
	if entityID == "" || !keySegmentRegex.MatchString(entityID) {
		return PresignUploadResponse{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "entityId is invalid", nil)
	}

	ext := normalizeExtension(req.FileName, contentType)
	if ext == "" {
		return PresignUploadResponse{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "unsupported file extension/contentType", nil)
	}

	objectKey := fmt.Sprintf("%s/%s/%s/%s%s", s.cfg.ObjectKeyPrefix, entityType, entityID, uuid.NewString(), ext)

	expiresIn, err := s.resolveExpiry(req.ExpiresInSeconds, s.cfg.DefaultUploadExpirySeconds)
	if err != nil {
		return PresignUploadResponse{}, err
	}

	url, err := s.presignClient.PresignedPutObject(ctx, s.cfg.MinIOBucket, objectKey, expiresIn)
	if err != nil {
		return PresignUploadResponse{}, httpx.NewAppError(http.StatusInternalServerError, domain.ErrorCodeInternalServerError, "failed to create upload URL", nil)
	}

	expiresAt := time.Now().UTC().Add(expiresIn).Format(time.RFC3339)
	return PresignUploadResponse{
		ObjectKey: objectKey,
		Method:    http.MethodPut,
		UploadURL: url.String(),
		ExpiresAt: expiresAt,
		Headers: map[string]string{
			"Content-Type": strings.TrimSpace(req.ContentType),
		},
	}, nil
}

func (s *StorageService) PresignDownload(ctx context.Context, req PresignDownloadRequest) (PresignDownloadResponse, error) {
	objectKey := strings.TrimSpace(req.ObjectKey)
	if !isValidObjectKey(objectKey) {
		return PresignDownloadResponse{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "objectKey is invalid", nil)
	}

	expiresIn, err := s.resolveExpiry(req.ExpiresInSeconds, s.cfg.DefaultDownloadExpirySeconds)
	if err != nil {
		return PresignDownloadResponse{}, err
	}

	url, err := s.presignClient.PresignedGetObject(ctx, s.cfg.MinIOBucket, objectKey, expiresIn, nil)
	if err != nil {
		return PresignDownloadResponse{}, httpx.NewAppError(http.StatusInternalServerError, domain.ErrorCodeInternalServerError, "failed to create download URL", nil)
	}

	expiresAt := time.Now().UTC().Add(expiresIn).Format(time.RFC3339)
	return PresignDownloadResponse{
		ObjectKey:   objectKey,
		Method:      http.MethodGet,
		DownloadURL: url.String(),
		ExpiresAt:   expiresAt,
	}, nil
}

func (s *StorageService) DeleteObject(ctx context.Context, req DeleteObjectRequest) (DeleteObjectResponse, error) {
	objectKey := strings.TrimSpace(req.ObjectKey)
	if !isValidObjectKey(objectKey) {
		return DeleteObjectResponse{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "objectKey is invalid", nil)
	}

	if err := s.client.RemoveObject(ctx, s.cfg.MinIOBucket, objectKey, minio.RemoveObjectOptions{}); err != nil {
		return DeleteObjectResponse{}, httpx.NewAppError(http.StatusInternalServerError, domain.ErrorCodeInternalServerError, "failed to delete object", nil)
	}

	return DeleteObjectResponse{ObjectKey: objectKey, Deleted: true}, nil
}

func (s *StorageService) resolveExpiry(custom *int, fallback int) (time.Duration, error) {
	seconds := fallback
	if custom != nil {
		seconds = *custom
	}
	if seconds < 60 || seconds > s.cfg.MaxExpirySeconds {
		return 0, httpx.NewAppError(
			http.StatusBadRequest,
			domain.ErrorCodeValidationFailed,
			fmt.Sprintf("expiresInSeconds must be between 60 and %d", s.cfg.MaxExpirySeconds),
			nil,
		)
	}
	return time.Duration(seconds) * time.Second, nil
}

func normalizeSegment(value string) string {
	trimmed := strings.TrimSpace(value)
	trimmed = strings.ReplaceAll(trimmed, " ", "-")
	trimmed = strings.ToLower(trimmed)
	return strings.Trim(trimmed, "-")
}

func normalizeExtension(fileName, contentType string) string {
	ext := strings.ToLower(strings.TrimSpace(path.Ext(fileName)))
	if ext == "" {
		extensions, _ := mime.ExtensionsByType(strings.TrimSpace(contentType))
		if len(extensions) > 0 {
			ext = strings.ToLower(strings.TrimSpace(extensions[0]))
		}
	}

	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".avif":
		return ext
	case ".mp4":
		if strings.EqualFold(strings.TrimSpace(contentType), "video/mp4") {
			return ext
		}
	case ".webm":
		if strings.EqualFold(strings.TrimSpace(contentType), "video/webm") {
			return ext
		}
	default:
		return ""
	}

	return ""
}

func isSupportedUploadContentType(contentType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(contentType))
	return strings.HasPrefix(normalized, "image/") || normalized == "video/mp4" || normalized == "video/webm"
}

func isValidObjectKey(value string) bool {
	length := len(value)
	if length < 3 || length > 1024 {
		return false
	}
	return objectKeyRegex.MatchString(value)
}

func buildPublicReadPolicy(bucket string) (string, error) {
	policy := map[string]any{
		"Version": "2012-10-17",
		"Statement": []map[string]any{
			{
				"Effect":    "Allow",
				"Principal": map[string]string{"AWS": "*"},
				"Action":    []string{"s3:GetObject"},
				"Resource":  []string{fmt.Sprintf("arn:aws:s3:::%s/*", bucket)},
			},
		},
	}

	raw, err := json.Marshal(policy)
	if err != nil {
		return "", err
	}

	return string(raw), nil
}
