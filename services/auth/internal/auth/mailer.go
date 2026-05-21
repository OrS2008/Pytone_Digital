package auth

import (
	"context"
	"fmt"
	"net/smtp"
	"strings"
)

// Mailer is the boundary the auth service uses to send transactional emails.
// Implementations:
//   - SMTPMailer: production (uses an SMTP relay — SendGrid, Postmark, SES, etc.)
//   - StdoutMailer: development (prints the email + link to stdout)
type Mailer interface {
	SendActivation(ctx context.Context, email, token string) error
	SendPasswordResetHint(ctx context.Context, email string) error
	SendPasswordReset(ctx context.Context, email, token string) error
	SendDeviceAlert(ctx context.Context, email, deviceLabel, ip string) error
}

// --- Stdout (dev) ----------------------------------------------------------

type StdoutMailer struct{ AppURL string }

func (m *StdoutMailer) SendActivation(_ context.Context, email, token string) error {
	fmt.Printf("[mail] activation → %s :  %s/activate?t=%s\n", email, m.AppURL, token)
	return nil
}
func (m *StdoutMailer) SendPasswordResetHint(_ context.Context, email string) error {
	fmt.Printf("[mail] reset-hint → %s\n", email)
	return nil
}
func (m *StdoutMailer) SendPasswordReset(_ context.Context, email, token string) error {
	fmt.Printf("[mail] password-reset → %s :  %s/reset?t=%s\n", email, m.AppURL, token)
	return nil
}
func (m *StdoutMailer) SendDeviceAlert(_ context.Context, email, label, ip string) error {
	fmt.Printf("[mail] device-alert → %s : new login on %s from %s\n", email, label, ip)
	return nil
}

// --- SMTP (prod) -----------------------------------------------------------

// SMTPMailer sends through any SMTP relay. We render emails server-side from
// the templates below. Keep them text-only by default — DKIM/SPF score better
// for plain-text transactional mail, and TVs / old mail clients don't render
// HTML reliably.
type SMTPMailer struct {
	Host      string // smtp.sendgrid.net
	Port      int    // 587
	Username  string
	Password  string
	From      string // "Nova Stream <noreply@novastream.tv>"
	AppURL    string // https://app.novastream.tv
	BrandName string // "Nova Stream"
}

func (m *SMTPMailer) addr() string  { return fmt.Sprintf("%s:%d", m.Host, m.Port) }
func (m *SMTPMailer) auth() smtp.Auth { return smtp.PlainAuth("", m.Username, m.Password, m.Host) }

func (m *SMTPMailer) send(to, subject, body string) error {
	msg := strings.Builder{}
	msg.WriteString("From: " + m.From + "\r\n")
	msg.WriteString("To: " + to + "\r\n")
	msg.WriteString("Subject: " + subject + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	msg.WriteString("Auto-Submitted: auto-generated\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(body)
	return smtp.SendMail(m.addr(), m.auth(), m.From, []string{to}, []byte(msg.String()))
}

func (m *SMTPMailer) SendActivation(_ context.Context, to, token string) error {
	link := fmt.Sprintf("%s/activate?t=%s", m.AppURL, token)
	body := strings.ReplaceAll(activationTpl, "{{LINK}}", link)
	body = strings.ReplaceAll(body, "{{BRAND}}", m.BrandName)
	return m.send(to, m.BrandName+" — Activate your account", body)
}

func (m *SMTPMailer) SendPasswordResetHint(_ context.Context, to string) error {
	body := strings.ReplaceAll(resetHintTpl, "{{BRAND}}", m.BrandName)
	body = strings.ReplaceAll(body, "{{APP_URL}}", m.AppURL)
	return m.send(to, m.BrandName+" — Account exists", body)
}

func (m *SMTPMailer) SendPasswordReset(_ context.Context, to, token string) error {
	link := fmt.Sprintf("%s/reset?t=%s", m.AppURL, token)
	body := strings.ReplaceAll(resetTpl, "{{LINK}}", link)
	body = strings.ReplaceAll(body, "{{BRAND}}", m.BrandName)
	return m.send(to, m.BrandName+" — Password reset", body)
}

func (m *SMTPMailer) SendDeviceAlert(_ context.Context, to, label, ip string) error {
	body := strings.ReplaceAll(deviceAlertTpl, "{{BRAND}}", m.BrandName)
	body = strings.ReplaceAll(body, "{{LABEL}}", label)
	body = strings.ReplaceAll(body, "{{IP}}", ip)
	body = strings.ReplaceAll(body, "{{APP_URL}}", m.AppURL)
	return m.send(to, m.BrandName+" — New device signed in", body)
}

// Templates kept here so all transactional copy is reviewable in one place.
// Marketing/lifecycle email belongs in a separate system, not in the auth
// service.

const activationTpl = `Welcome to {{BRAND}}.

To activate your account and start your 7-day free trial, follow this link:

  {{LINK}}

The link is valid for 48 hours and can be used only once.

If you didn't sign up for {{BRAND}}, ignore this email — no account will be
created until the link is opened.

— {{BRAND}}
`

const resetHintTpl = `Someone tried to create a {{BRAND}} account with this email,
but an account already exists.

If that was you, sign in instead:

  {{APP_URL}}/login

If you've forgotten your password, you can reset it from the sign-in page.

If it wasn't you, no action is needed.

— {{BRAND}}
`

const resetTpl = `You requested a password reset for your {{BRAND}} account.

Choose a new password here:

  {{LINK}}

The link is valid for 1 hour and can be used only once.

If you didn't request a reset, ignore this email — your password is unchanged.

— {{BRAND}}
`

const deviceAlertTpl = `A new device just signed in to your {{BRAND}} account:

  Device: {{LABEL}}
  IP:     {{IP}}

If this was you, no action is needed. If not, change your password and revoke
the device immediately:

  {{APP_URL}}/account/devices

— {{BRAND}}
`
