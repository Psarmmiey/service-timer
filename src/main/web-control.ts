import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import type { PhoneInfo } from "../shared/ipc";
import { PHONE_PAGE_HTML } from "./phone-page";

export type { PhoneInfo };

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
  // Today's running order only (FR-14, FR-14a); the saved plan never changes from a phone.
  "moveUp",
  "moveDown",
  "doNext",
  "startNow",
  "insertAfterCurrent",
  "setRunItemMinutes",
  "removeUpcoming",
  "undoReorder",
]);

export const DEFAULT_PHONE_PORT = 4280;
const SESSION_COOKIE = "st_session";
const MAX_BODY_BYTES = 2048;
const LOGIN_ATTEMPTS_PER_MINUTE = 5;
const SESSION_HOURS = 12;

type PhoneSession = Omit<PhoneInfo, "connected"> & { token: string };

const NAME_MAX = 40;

/** A short, friendly description of the phone from its browser, such as "iPhone · Safari". */
export function describeDevice(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const device = /iPad/.test(ua) ? "iPad"
    : /iPhone/.test(ua) ? "iPhone"
      : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
        : /Macintosh/.test(ua) ? "Mac"
          : /Windows/.test(ua) ? "Windows PC"
            : /CrOS/.test(ua) ? "Chromebook"
              : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /EdgiOS|EdgA|Edg\//.test(ua) ? "Edge"
      : /FxiOS|Firefox\//.test(ua) ? "Firefox"
        : /CriOS|Chrome\//.test(ua) ? "Chrome"
          : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${device} · ${browser}` : device;
}

/** Plain-words label for the phone's last action, for the laptop's list. */
export function actionLabel(command: Record<string, unknown>): string {
  switch (command.type) {
    case "start": case "startChoice": return "Started the service";
    case "pause": return "Paused";
    case "resume": return "Resumed";
    case "next": return "Next";
    case "previous": return "Previous";
    case "adjust": return typeof command.ms === "number" && command.ms < 0 ? "Took time off" : "Added time";
    case "message": return "Sent a message";
    case "clearMessage": return "Cleared the message";
    case "blackout": return command.on ? "Blacked out the stage" : "Brought the stage back";
    case "dismissBanner": return "Dismissed a notice";
    case "startNow": return "Started an item early";
    case "undoReorder": return "Undid a change";
    default: return "Changed the running order";
  }
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return name ? name : null;
}

export type WebControlOptions = {
  getSnapshot: () => unknown;
  /** Apply a phone command. Returns false if it was rejected. */
  onCommand: (command: Record<string, unknown>) => boolean;
  getPin: () => string;
  /** Called whenever a phone signs in, connects, disconnects or does something. */
  onClientsChanged?: (count: number) => void;
};

export type WebControl = {
  start: (port?: number, host?: string) => Promise<number>;
  stop: () => Promise<void>;
  broadcast: () => void;
  signOutAll: () => void;
  /** Sign one phone out and close its connection. Returns false if it wasn't found. */
  disconnect: (id: string) => boolean;
  phones: () => PhoneInfo[];
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
  const sessions = new Map<string, PhoneSession>();
  const attempts = new Map<string, { count: number; resetAt: number }>();
  /** Open live connections and the session each belongs to. */
  const streams = new Map<ServerResponse, string>();
  let server: Server | null = null;
  let listeningPort: number | null = null;
  let keepAlive: NodeJS.Timeout | null = null;

  const sessionFor = (request: IncomingMessage): PhoneSession | undefined => {
    const token = readCookie(request, SESSION_COOKIE);
    return token ? sessions.get(token) : undefined;
  };

  const notifyClients = () => options.onClientsChanged?.(streams.size);

  const endStream = (stream: ServerResponse, reason?: string) => {
    if (reason) stream.write(`event: signed-out\ndata: ${JSON.stringify({ reason })}\n\n`);
    stream.end();
    streams.delete(stream);
  };

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
      const session = sessionFor(request);
      send(response, 200, { signedIn: Boolean(session), name: session?.name });
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
      const name = cleanName(body.name);
      if (!name) {
        send(response, 400, { error: "Add your name so the timer laptop can see who is connected." });
        return;
      }
      attempts.delete(ip);
      const address = ip.replace(/^::ffff:/, "");
      // The same person signing in again from the same phone replaces their old, idle entry.
      const live = new Set(streams.values());
      for (const [oldToken, old] of sessions) {
        if (old.name === name && old.address === address && !live.has(oldToken)) sessions.delete(oldToken);
      }
      const token = randomBytes(24).toString("hex");
      sessions.set(token, {
        token,
        id: randomBytes(6).toString("hex"),
        name,
        device: describeDevice(request.headers["user-agent"]),
        address,
        signedInAt: now,
        lastSeenAt: now,
      });
      notifyClients();
      send(response, 200, { ok: true }, {
        "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * SESSION_HOURS}`,
      });
      return;
    }

    const session = sessionFor(request);
    if (!session) {
      send(response, 401, { error: "Sign in with the PIN shown in Settings on the timer laptop." });
      return;
    }
    session.lastSeenAt = Date.now();

    if (method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      response.write(`data: ${JSON.stringify(options.getSnapshot())}\n\n`);
      streams.set(response, session.token);
      notifyClients();
      request.on("close", () => {
        if (!streams.delete(response)) return;
        session.lastSeenAt = Date.now();
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
      session.lastAction = { label: actionLabel(body), at: Date.now() };
      notifyClients();
      send(response, 204);
      return;
    }

    if (method === "POST" && url.pathname === "/api/logout") {
      sessions.delete(session.token);
      for (const [stream, token] of streams) if (token === session.token) endStream(stream);
      notifyClients();
      send(response, 204, undefined, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
      return;
    }

    send(response, 404, { error: "Not found" });
  };

  const closeStreams = (reason?: string) => {
    for (const stream of [...streams.keys()]) endStream(stream, reason);
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
              for (const stream of streams.keys()) stream.write(": keep-alive\n\n");
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
      for (const stream of streams.keys()) stream.write(payload);
    },
    signOutAll: () => {
      sessions.clear();
      closeStreams("pin-changed");
    },
    disconnect: (id) => {
      const session = [...sessions.values()].find((candidate) => candidate.id === id);
      if (!session) return false;
      sessions.delete(session.token);
      for (const [stream, token] of [...streams]) if (token === session.token) endStream(stream, "disconnected");
      notifyClients();
      return true;
    },
    phones: () => {
      const connected = new Set(streams.values());
      // Sessions last as long as the phone's cookie (12 hours).
      const cutoff = Date.now() - SESSION_HOURS * 60 * 60 * 1000;
      for (const [token, session] of sessions) if (session.signedInAt < cutoff) sessions.delete(token);
      return [...sessions.values()]
        .map(({ token, ...info }) => ({ ...info, connected: connected.has(token) }))
        .sort((a, b) => Number(b.connected) - Number(a.connected) || b.lastSeenAt - a.lastSeenAt);
    },
    clientCount: () => streams.size,
    port: () => listeningPort,
  };
}
