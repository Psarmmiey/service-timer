import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import { PHONE_PAGE_HTML } from "./phone-page";

/**
 * Phone control (FR-22): a small web page served on the local network. Phones sign in
 * with a 4-digit PIN, receive live state over server-sent events, and can send only the
 * live controls below. Plans and settings can never be changed from a phone.
 */
export const PHONE_COMMANDS = new Set([
  "start",
  "startChoice",
  "pause",
  "resume",
  "next",
  "previous",
  "adjust",
  "message",
  "clearMessage",
  "blackout",
  "dismissBanner",
]);

export const DEFAULT_PHONE_PORT = 4280;
const SESSION_COOKIE = "st_session";
const MAX_BODY_BYTES = 2048;
const LOGIN_ATTEMPTS_PER_MINUTE = 5;

export type WebControlOptions = {
  getSnapshot: () => unknown;
  /** Apply a phone command. Returns false if it was rejected. */
  onCommand: (command: Record<string, unknown>) => boolean;
  getPin: () => string;
  onClientsChanged?: (count: number) => void;
};

export type WebControl = {
  start: (port?: number, host?: string) => Promise<number>;
  stop: () => Promise<void>;
  broadcast: () => void;
  signOutAll: () => void;
  clientCount: () => number;
  port: () => number | null;
};

export function newPin(): string {
  return String(randomBytes(4).readUInt32BE(0) % 10_000).padStart(4, "0");
}

/** Private IPv4 addresses phones on the same Wi-Fi can reach. */
export function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) addresses.push(entry.address);
    }
  }
  return addresses;
}

function samePin(given: unknown, expected: string): boolean {
  if (typeof given !== "string" || !/^\d{4}$/.test(given) || !/^\d{4}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function readCookie(request: IncomingMessage, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        resolve(typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    request.on("error", () => resolve(null));
  });
}

function send(response: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { "Cache-Control": "no-store", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

export function createWebControl(options: WebControlOptions): WebControl {
  const sessions = new Set<string>();
  const attempts = new Map<string, { count: number; resetAt: number }>();
  const streams = new Set<ServerResponse>();
  let server: Server | null = null;
  let listeningPort: number | null = null;
  let keepAlive: NodeJS.Timeout | null = null;

  const signedIn = (request: IncomingMessage) => {
    const token = readCookie(request, SESSION_COOKIE);
    return Boolean(token && sessions.has(token));
  };

  const notifyClients = () => options.onClientsChanged?.(streams.size);

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const method = request.method ?? "GET";

    if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
        "X-Frame-Options": "DENY",
      });
      response.end(PHONE_PAGE_HTML);
      return;
    }

    if (method === "GET" && url.pathname === "/api/session") {
      send(response, 200, { signedIn: signedIn(request) });
      return;
    }

    // Every state-changing request must carry this header, which a form or link on
    // another website can't add, so other sites can't drive the timer.
    if (method === "POST" && request.headers["x-service-timer"] !== "1") {
      send(response, 403, { error: "Missing header" });
      return;
    }

    if (method === "POST" && url.pathname === "/api/login") {
      const ip = request.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const record = attempts.get(ip);
      const current = record && record.resetAt > now ? record : { count: 0, resetAt: now + 60_000 };
      if (current.count >= LOGIN_ATTEMPTS_PER_MINUTE) {
        send(response, 429, { error: "Too many tries. Wait a minute and try again." });
        return;
      }
      const body = await readJson(request);
      if (!body || !samePin(body.pin, options.getPin())) {
        attempts.set(ip, { ...current, count: current.count + 1 });
        send(response, 401, { error: "That PIN isn't right." });
        return;
      }
      attempts.delete(ip);
      const token = randomBytes(24).toString("hex");
      sessions.add(token);
      send(response, 200, { ok: true }, {
        "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 12}`,
      });
      return;
    }

    if (!signedIn(request)) {
      send(response, 401, { error: "Sign in with the PIN shown in Settings on the timer laptop." });
      return;
    }

    if (method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      response.write(`data: ${JSON.stringify(options.getSnapshot())}\n\n`);
      streams.add(response);
      notifyClients();
      request.on("close", () => {
        streams.delete(response);
        notifyClients();
      });
      return;
    }

    if (method === "POST" && url.pathname === "/api/command") {
      const body = await readJson(request);
      if (!body || typeof body.type !== "string" || !PHONE_COMMANDS.has(body.type)) {
        send(response, 403, { error: "Not allowed from a phone." });
        return;
      }
      if (!options.onCommand(body)) {
        send(response, 400, { error: "Command rejected." });
        return;
      }
      send(response, 204);
      return;
    }

    if (method === "POST" && url.pathname === "/api/logout") {
      const token = readCookie(request, SESSION_COOKIE);
      if (token) sessions.delete(token);
      send(response, 204, undefined, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
      return;
    }

    send(response, 404, { error: "Not found" });
  };

  const closeStreams = () => {
    for (const stream of streams) stream.end();
    streams.clear();
    notifyClients();
  };

  return {
    start: (port = DEFAULT_PHONE_PORT, host = "0.0.0.0") =>
      new Promise((resolve, reject) => {
        if (server) {
          resolve(listeningPort ?? port);
          return;
        }
        const tryPort = (candidate: number, triesLeft: number) => {
          const next = createServer((request, response) => {
            handle(request, response).catch(() => send(response, 500, { error: "Something went wrong." }));
          });
          next.once("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "EADDRINUSE" && triesLeft > 0) tryPort(candidate + 1, triesLeft - 1);
            else reject(error);
          });
          next.listen(candidate, host, () => {
            server = next;
            listeningPort = (next.address() as AddressInfo).port;
            // Comments keep the connection open through Wi-Fi routers that drop idle sockets.
            keepAlive = setInterval(() => {
              for (const stream of streams) stream.write(": keep-alive\n\n");
            }, 15_000);
            resolve(listeningPort);
          });
        };
        tryPort(port, port === 0 ? 0 : 5);
      }),
    stop: () =>
      new Promise((resolve) => {
        if (keepAlive) clearInterval(keepAlive);
        keepAlive = null;
        closeStreams();
        sessions.clear();
        const current = server;
        server = null;
        listeningPort = null;
        if (!current) {
          resolve();
          return;
        }
        current.close(() => resolve());
        current.closeAllConnections?.();
      }),
    broadcast: () => {
      if (!streams.size) return;
      const payload = `data: ${JSON.stringify(options.getSnapshot())}\n\n`;
      for (const stream of streams) stream.write(payload);
    },
    signOutAll: () => {
      sessions.clear();
      closeStreams();
    },
    clientCount: () => streams.size,
    port: () => listeningPort,
  };
}
