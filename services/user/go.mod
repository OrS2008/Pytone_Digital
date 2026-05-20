module github.com/pytone/pytone/services/user

go 1.23

require (
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.6.0
	github.com/pytone/pytone/libs/go/pkg v0.0.0
	github.com/rs/zerolog v1.33.0
	google.golang.org/grpc v1.65.0
)

replace github.com/pytone/pytone/libs/go/pkg => ../../libs/go/pkg
