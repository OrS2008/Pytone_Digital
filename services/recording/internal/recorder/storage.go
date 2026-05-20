package recorder

import (
	"context"
	"io"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Storage abstracts object-storage operations so we can swap S3 / MinIO / GCS
// behind a single interface.
type Storage interface {
	Put(ctx context.Context, key string, body io.Reader, size int64) error
	Delete(ctx context.Context, key string) error
}

// S3Storage is an S3-compatible Storage implementation (works against AWS S3,
// MinIO, Backblaze B2, Wasabi, Cloudflare R2).
type S3Storage struct {
	client *s3.Client
	bucket string
}

// NewS3Storage wraps an s3 client.
func NewS3Storage(c *s3.Client, bucket string) Storage {
	return &S3Storage{client: c, bucket: bucket}
}

func (s *S3Storage) Put(ctx context.Context, key string, body io.Reader, size int64) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        &s.bucket,
		Key:           &key,
		Body:          body,
		ContentLength: &size,
	})
	return err
}

func (s *S3Storage) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	return err
}
