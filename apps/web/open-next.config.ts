// OpenNext adapter configuration (Cloudflare Workers).
// No incremental cache: every page that matters is dynamic, and the
// static ones are served from the assets binding.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
