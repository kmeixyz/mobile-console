import express from "express";
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import iceHandler from "./api/ice.js";
const root = path.dirname(fileURLToPath(import.meta.url));
// Local server for development and LAN play. Phones talk to the big screen
// directly (see src/lib/peer.ts), so this only serves pages.
const app = express();
const tlsCert = process.env.TLS_CERT;
const tlsKey = process.env.TLS_KEY;
if (Boolean(tlsCert) !== Boolean(tlsKey))
  throw new Error("Set both TLS_CERT and TLS_KEY to enable local HTTPS.");
const secure = Boolean(tlsCert && tlsKey);
const server = secure
  ? https.createServer(
      { cert: readFileSync(tlsCert), key: readFileSync(tlsKey) },
      app,
    )
  : http.createServer(app);
const port = Number(process.env.PORT || 5180);
// Same relay credentials endpoint Vercel serves from api/ice.js.
app.get("/api/ice", iceHandler);
app.get("/api/network", (req, res) => {
  const local = Object.values(networkInterfaces())
    .flat()
    .find((n) => n?.family === "IPv4" && !n.internal)?.address;
  const host = req.headers.host || `localhost:${port}`;
  const protocol =
    secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  res.json({
    url:
      /^(localhost|127\.0\.0\.1)(:|$)/.test(host) && local
        ? `${protocol}://${local}:${port}`
        : `${protocol}://${host}`,
  });
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
server.listen(port, "0.0.0.0", () =>
  console.log(
    `Mobile Console is ready at ${secure ? "https" : "http"}://localhost:${port}`,
  ),
);
const shutdown = () => server.close();
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
