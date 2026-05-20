# Pytone Admin

The operator console. Same Next.js stack as the web client, distinct
deployment, locked behind SSO + IP allowlist.

Surfaces:

* **Tenancy** — organisations, billing plans, feature gates
* **Sources** — playlist sources per tenant, refresh schedules, health
* **Channels** — catalogue browser, manual EPG re-mapping, logo overrides
* **EPG** — XMLTV source health, last-refresh status, programme search
* **Streams** — per-channel stream health, manual probe trigger, demotion log
* **DVR** — capacity per region, retention overrides, segment audit
* **Users** — search, profile inspection, session revocation, audit log
* **Analytics** — live QoE dashboards (Grafana iframes for the heavy stuff)
* **Incidents** — ai-playback decisions over time, mean-time-to-recover
* **Releases** — feature flag rollouts, gradual exposure controls

See `infrastructure/monitoring/dashboards/` for the Grafana JSON the
analytics pages embed.
