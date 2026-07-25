import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext-configuratie voor Cloudflare Workers.
 *
 * Bewust minimaal: de app rendert elke pagina per request (alle routes staan op
 * `force-dynamic`, want cijfers moeten actueel zijn), dus een incrementele
 * cache voegt hier niets toe en scheelt een KV-namespace.
 */
export default defineCloudflareConfig();
