package auth

import (
	"context"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
)

type Config struct {
	DatabaseURL    string
	RedisURL       string
	JWTPrivPEM     string
	AccessTTL      time.Duration
	RefreshTTL     time.Duration
	PasswordPepper []byte
	// Email sender config. If SMTPHost is empty we use StdoutMailer
	// (development); otherwise we use SMTPMailer.
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	MailFrom     string
	AppURL       string
	BrandName    string
}

type Deps struct {
	DB      *pgxpool.Pool
	Redis   *redis.Client
	Service *Service
	Devices *DeviceManager
	Mailer  Mailer
}

func Wire(ctx context.Context, cfg Config) (*Deps, error) {
	db, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(ropt)

	priv, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(cfg.JWTPrivPEM))
	if err != nil {
		return nil, err
	}

	var mailer Mailer
	if cfg.SMTPHost == "" {
		mailer = &StdoutMailer{AppURL: orDefault(cfg.AppURL, "http://localhost:3000")}
	} else {
		mailer = &SMTPMailer{
			Host: cfg.SMTPHost, Port: cfg.SMTPPort,
			Username: cfg.SMTPUser, Password: cfg.SMTPPassword,
			From:      cfg.MailFrom,
			AppURL:    cfg.AppURL,
			BrandName: orDefault(cfg.BrandName, "Nova Stream"),
		}
	}

	devices := NewDeviceManager(rdb)
	svc := NewService(db, rdb, mailer, priv, cfg.PasswordPepper, cfg.AccessTTL, cfg.RefreshTTL)
	return &Deps{DB: db, Redis: rdb, Service: svc, Devices: devices, Mailer: mailer}, nil
}

func orDefault(s, d string) string {
	if s == "" {
		return d
	}
	return s
}

func (d *Deps) RegisterGRPC(g *grpc.Server) {
	_ = g
}

func (d *Deps) Close() {
	d.DB.Close()
	_ = d.Redis.Close()
}
