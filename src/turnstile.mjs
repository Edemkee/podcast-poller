// Cloudflare Turnstile: confirms with Cloudflare that a token from the page's widget
// was earned by a human. No Netlify imports, so the tests and dev-server can use it.
// Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Returns verify(token, ip) -> { ok, reason }. reason is "not-configured" (no secret key),
// "missing" (no usable token), "unreachable" (Cloudflare did not answer) or Cloudflare's
// error codes joined with commas.
export function turnstileVerifier({ secret, url = SITEVERIFY, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  return async function verify(token, ip) {
    if (typeof secret !== "string" || !secret) return { ok: false, reason: "not-configured" };
    // Tokens are at most 2048 characters; anything else is not worth asking about.
    if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, reason: "missing" };
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    try {
      const res = await fetchImpl(url, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
      const out = await res.json();
      if (out && out.success === true) return { ok: true, reason: "" };
      return { ok: false, reason: ((out && out["error-codes"]) || []).join(",") || "rejected" };
    } catch {
      return { ok: false, reason: "unreachable" };
    }
  };
}
