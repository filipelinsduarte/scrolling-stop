// Cloudflare Pages Function: POST https://scrollingstop.com/api/event
//
// The extension cannot call Google Analytics directly, because the Measurement
// Protocol api_secret would then ship inside a public extension bundle and a
// public repository. This function holds the secret as an environment variable
// and forwards a strictly validated payload.
//
// Required environment variables, set in the Cloudflare Pages dashboard:
//   GA4_MEASUREMENT_ID  the web stream id, for example G-31C8PKE92Z
//   GA4_API_SECRET      Admin, Data Streams, Measurement Protocol API secrets

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const ALLOWED_EVENT_NAMES = new Set(["extension_install", "extension_uninstall"]);
const ALLOWED_REASONS = new Set(["install", "update"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_VERSION_LENGTH = 20;
const MAX_BODY_BYTES = 1024;

// The extension origin is chrome-extension://<id>, which varies per install
// channel, so the origin cannot be pinned. The endpoint is write-only, accepts
// no user data, and returns nothing readable, so a permissive CORS policy here
// exposes nothing. The validation below is what actually protects the property.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Without this, any other method falls through to the static asset handler
// and answers 200 with the landing page, which is confusing to debug.
export async function onRequest({ request }) {
  return respond(405, { ok: false, error: `${request.method} is not supported.` });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) {
    console.error("[event] GA4_MEASUREMENT_ID or GA4_API_SECRET is not set");
    return respond(500, { ok: false, error: "Endpoint is not configured." });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return respond(413, { ok: false, error: "Payload too large." });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return respond(400, { ok: false, error: "Body must be JSON." });
  }

  // Every field is checked against an allowlist. Anything unexpected is
  // dropped rather than forwarded, so a scraped endpoint cannot be used to
  // write arbitrary events into the analytics property.
  const name = payload?.name;
  if (!ALLOWED_EVENT_NAMES.has(name)) {
    return respond(400, { ok: false, error: "Unsupported event." });
  }

  const clientId = payload?.clientId;
  if (typeof clientId !== "string" || !UUID_PATTERN.test(clientId)) {
    return respond(400, { ok: false, error: "Invalid client id." });
  }

  const version = typeof payload?.version === "string"
    ? payload.version.slice(0, MAX_VERSION_LENGTH)
    : "";
  const reason = ALLOWED_REASONS.has(payload?.reason) ? payload.reason : "install";

  const ga4Url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID)}`
    + `&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`;

  const ga4Response = await fetch(ga4Url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      non_personalized_ads: true,
      events: [{
        name,
        params: {
          extension_version: version,
          install_reason: reason,
          engagement_time_msec: 1,
          session_id: clientId,
        },
      }],
    }),
  });

  // GA4 answers 2xx with an empty body on success. Anything else is logged
  // here and reported back so the extension does not mark the version as
  // counted and can try again on the next worker start.
  if (!ga4Response.ok) {
    console.error(`[event] GA4 returned ${ga4Response.status}`);
    return respond(502, { ok: false, error: "Upstream rejected the event." });
  }

  return respond(202, { ok: true });
}
