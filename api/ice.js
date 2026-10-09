// Hands out short-lived Cloudflare TURN credentials so phones can reach the big
// screen through a relay when a direct connection is blocked. The API token
// stays here on the server; browsers only ever see temporary credentials.
//
// Set CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN in the environment.
// Without them this returns no relays and the app connects directly only.
const CREDENTIAL_HOURS = 12;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return res.status(200).json({ iceServers: [] });

  // Only serve this site's own pages, so other sites can't spend the allowance.
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = req.headers.origin || req.headers.referer;
  try {
    if (!origin || new URL(origin).host !== host)
      return res.status(403).json({ iceServers: [] });
  } catch {
    return res.status(403).json({ iceServers: [] });
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: CREDENTIAL_HOURS * 3600 }),
      },
    );
    if (!response.ok) throw new Error(`Cloudflare responded ${response.status}`);
    const { iceServers = [] } = await response.json();
    // Browsers block port 53, so those URLs would only time out.
    const usable = iceServers
      .map((server) => ({
        ...server,
        urls: [].concat(server.urls).filter((url) => !/:53(\?|$)/.test(url)),
      }))
      .filter((server) => server.urls.length);
    return res.status(200).json({ iceServers: usable });
  } catch (error) {
    console.error("TURN credentials failed:", error.message);
    return res.status(200).json({ iceServers: [] });
  }
}
