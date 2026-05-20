# Runbook: Playback degraded in region X

**SLO breached:** `PlaybackStartupP95High` or `PlaybackRebufferRateHigh`.

## TL;DR

1. Confirm which region is affected. Check the Grafana Playback Overview
   dashboard's region facet.
2. Look at the ai-playback failover panel. If failovers spiked at the same
   time, an origin probably went bad — the supervisor is doing its job.
3. Look at the origin error rate panel. A single origin spiking? Demote it:
   ```
   redis-cli -h <region-redis> SISMEMBER play:demoted <stream_id>
   redis-cli -h <region-redis> SADD play:demoted <stream_id>
   ```
4. If a whole region is unhappy (not just one origin), check:
   * upstream provider status pages
   * CDN status page
   * the playback proxy CPU/memory dashboards — pods saturated?

## Common root causes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| One origin's error rate >5%, others fine | Provider outage on that origin | Demote (`SADD play:demoted`); file ticket with provider |
| All origins for one channel red | Channel itself broken | Disable channel; alert content team |
| Whole region red, ai-playback inactive | Supervisor pod crashlooping | Check `kubectl logs -n pytone ai-playback`; restart |
| Whole region red, ai-playback active | Redis pub/sub broken | Failover Redis primary; supervisor reconnects automatically |
| Rebuffer rate slowly climbing | Pod saturation | Check HPA; manually bump if HPA hasn't reacted yet |

## Escalation

* If multiple regions are affected within 5 minutes → page the streaming
  on-call engineer.
* If a provider outage is confirmed → notify the content team to enable
  emergency banner ("Some channels are temporarily unavailable").
* If the AI supervisor is causing flapping (false-positive failovers) →
  bump `FAILOVER_THRESHOLD` in `ai-playback` config and roll restart.
