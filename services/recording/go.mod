module github.com/pytone/pytone/services/recording

go 1.23

require (
	github.com/aws/aws-sdk-go-v2 v1.30.3
	github.com/aws/aws-sdk-go-v2/service/s3 v1.58.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.6.0
	github.com/pytone/pytone/libs/go/pkg v0.0.0
	github.com/redis/go-redis/v9 v9.6.1
	github.com/rs/zerolog v1.33.0
	github.com/segmentio/kafka-go v0.4.47
	golang.org/x/sync v0.7.0
	google.golang.org/grpc v1.65.0
)

replace github.com/pytone/pytone/libs/go/pkg => ../../libs/go/pkg
