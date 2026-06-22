import "server-only";
import tls from "node:tls";
import type { NewProbe } from "@/lib/db/schema";

const TIMEOUT_MS = 8000;

export function probeTls(siteId: string, hostname: string, port = 443): Promise<NewProbe> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = tls.connect({
      host: hostname, port, servername: hostname,
      rejectUnauthorized: false, // we want to *report* invalid certs, not crash
      timeout: TIMEOUT_MS,
    });

    let done = false;
    const finish = (probe: NewProbe) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(probe);
    };

    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate(true);
      const latency = Date.now() - start;
      const now = Date.now();
      const expires = new Date(cert.valid_to).getTime();
      const daysLeft = Math.floor((expires - now) / 86_400_000);
      const verified = socket.authorized;
      const status =
        !verified            ? "failed"   :
        daysLeft < 7         ? "failed"   :
        daysLeft < 30        ? "degraded" :
                               "healthy";
      finish({
        siteId, kind: "tls", status, latencyMs: latency,
        details: {
          issuer: cert.issuer?.CN ?? cert.issuer?.O,
          subject: cert.subject?.CN,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
          days_remaining: daysLeft,
          authorized: verified,
          authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()?.name,
          alt_names: cert.subjectaltname,
        },
        observedAt: new Date(),
      });
    });

    socket.on("error", (err) => {
      finish({
        siteId, kind: "tls", status: "failed",
        latencyMs: Date.now() - start,
        details: { error: String(err.message) },
        observedAt: new Date(),
      });
    });
    socket.on("timeout", () => {
      finish({
        siteId, kind: "tls", status: "failed",
        details: { error: "timeout" },
        observedAt: new Date(),
      });
    });
  });
}
