// server/src/app.ts
import cookieParser from "cookie-parser";
import express5 from "express";
import helmet from "helmet";

// server/src/middleware/security.ts
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";

// server/src/config/env.ts
import { randomBytes } from "node:crypto";
var isProd = process.env.NODE_ENV === "production";
if (isProd && (!process.env.JWT_SECRET || !process.env.DATA_KEY)) {
  throw new Error("JWT_SECRET and DATA_KEY must be set in production");
}
var env = {
  isProd,
  isTest: process.env.NODE_ENV === "test",
  port: Number(process.env.PORT ?? 4e3),
  // Dev fallback is random per process, so sessions reset on restart rather than using a guessable secret.
  jwtSecret: process.env.JWT_SECRET ?? randomBytes(32).toString("hex"),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  dataFile: process.env.DATA_FILE ?? "server/.data/db.json",
  adminEmail: process.env.ADMIN_EMAIL?.toLowerCase(),
  // 32-byte hex key for encrypting application data at rest. The dev fallback is NOT secret.
  dataKey: process.env.DATA_KEY ?? "00".repeat(32),
  uploadDir: process.env.UPLOAD_DIR ?? "server/.data/uploads",
  // Vercel functions accept request bodies up to ~4.5 MB, so uploads are capped just below that everywhere.
  maxUploadBytes: 4 * 1024 * 1024,
  // Larger files go straight to storage (signed upload link), so they are not limited by the function body size.
  maxLargeUploadBytes: Math.min(Math.max(Number(process.env.MAX_LARGE_UPLOAD_MB ?? 25), 5), 100) * 1024 * 1024,
  // STORAGE_MODE=local ignores Supabase settings (development only), e.g. while the database is being set up.
  storageMode: process.env.STORAGE_MODE === "local" ? "local" : "auto",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseBucket: process.env.SUPABASE_BUCKET ?? "documents",
  libreTranslateUrl: process.env.LIBRETRANSLATE_URL?.trim().replace(/\/+$/, "") || void 0,
  // Optional: an email raises the free MyMemory translation quota from 5,000 to 50,000 characters/day.
  myMemoryEmail: process.env.MYMEMORY_EMAIL?.trim() || void 0,
  // Public Overpass server by default (light use only); point at your own instance for heavy or commercial use.
  // Optional ClamAV daemon (clamd) for real malware scanning. Without it only the built-in structural checks run.
  clamdHost: process.env.CLAMD_HOST || void 0,
  clamdPort: Number(process.env.CLAMD_PORT ?? 3310),
  // closed (default): refuse uploads when the scanner is configured but unreachable. open: store them anyway (logged).
  scanFailMode: process.env.SCAN_FAIL_MODE === "open" ? "open" : "closed",
  // Required for the scheduled retention endpoint; without it the endpoint does not exist.
  cronSecret: process.env.CRON_SECRET || void 0,
  overpassUrl: process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
  travelpayoutsToken: process.env.TRAVELPAYOUTS_TOKEN,
  travelpayoutsMarker: process.env.TRAVELPAYOUTS_MARKER,
  // Commerce (real booking + payment). Everything is optional: with no keys the checkout endpoints answer 501.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || void 0,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || void 0,
  // Safepay (Pakistan). Keys come from the Safepay merchant dashboard; SAFEPAY_ENV=production for live.
  safepayApiKey: process.env.SAFEPAY_API_KEY || void 0,
  safepaySecretKey: process.env.SAFEPAY_SECRET_KEY || void 0,
  safepayWebhookSecret: process.env.SAFEPAY_WEBHOOK_SECRET || void 0,
  safepayEnv: process.env.SAFEPAY_ENV === "production" ? "production" : "sandbox",
  duffelToken: process.env.DUFFEL_ACCESS_TOKEN || void 0,
  atlasKeyId: process.env.ATLAS_KEY_ID || void 0,
  atlasSigningSecret: process.env.ATLAS_SIGNING_SECRET || void 0,
  // Our fee on top of the provider price, charged to the customer in the same payment. 0-20 %.
  serviceFeePercent: Math.min(Math.max(Number(process.env.SERVICE_FEE_PERCENT ?? 0) || 0, 0), 20),
  bcryptCost: process.env.NODE_ENV === "test" ? 4 : 12
};

// server/src/services/auth-service.ts
import { randomBytes as randomBytes2, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
var DUMMY_HASH = bcrypt.hashSync("not-a-real-password", env.bcryptCost);
var hashPassword = (pw) => bcrypt.hash(pw, env.bcryptCost);
async function checkPassword(user, pw) {
  const ok2 = await bcrypt.compare(pw, user?.passwordHash ?? DUMMY_HASH);
  return !!user && ok2;
}
function signSession(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: "7d",
    algorithm: "HS256"
  });
}
function verifySession(token) {
  try {
    const p = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    if (typeof p.sub !== "string" || p.role !== "user" && p.role !== "admin") return null;
    return { sub: p.sub, role: p.role };
  } catch {
    return null;
  }
}
function newUser(input2) {
  return {
    id: randomUUID(),
    name: input2.name,
    email: input2.email,
    passwordHash: input2.passwordHash,
    // Never admin at registration: the admin role is granted only after the address is verified (see verify-email).
    role: "user",
    emailVerifiedAt: null,
    verifyToken: randomBytes2(24).toString("hex"),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var toPublicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  emailVerified: !!u.emailVerifiedAt
});

// server/src/models/database-error.ts
var DatabaseError = class extends Error {
  code;
  constructor(message, code = null) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
  }
};

// server/src/middleware/security.ts
var HttpError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var SESSION_COOKIE = "tp_session";
var originCheck = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && origin !== env.clientOrigin && !env.isTest) return next(new HttpError(403, "Origin not allowed"));
  next();
};
var requireAuth = (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? verifySession(token) : null;
  if (!session) return next(new HttpError(401, "Not signed in"));
  req.session = session;
  next();
};
var requireRole = (store, role) => async (req, _res, next) => {
  try {
    const user = req.session ? await store.findUserById(req.session.sub) : void 0;
    next(user?.role === role ? void 0 : new HttpError(403, "Forbidden"));
  } catch (e) {
    next(e);
  }
};
var authLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: "Too many attempts. Try again later." }
});
var apiLimiter = rateLimit({
  windowMs: 60 * 1e3,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: "Too many requests." }
});
var errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Invalid input",
      fields: Object.fromEntries(err.issues.map((i) => [i.path.join(".") || "_", i.message]))
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const status = err?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const msg = status === 413 ? "File or request is too large" : status === 400 ? "Malformed request" : "Request rejected";
    res.status(status).json({ error: msg });
    return;
  }
  if (err instanceof DatabaseError) {
    console.error(`Database error [${err.code ?? "no code"}]: ${err.message}`);
    res.status(503).json({ error: env.isProd ? "The service is temporarily unavailable" : `Database error (${err.code ?? "no code"}): ${err.message}` });
    return;
  }
  if (env.isProd || env.isTest) console.error("Unhandled error:", err instanceof Error ? err.name : "unknown");
  else console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong" });
};

// server/src/services/blobs.ts
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
var SIGNED_URL_TTL_SECONDS = 300;
var UploadTooLarge = class extends Error {
};
var DiskBlobStore = class {
  root;
  constructor(root) {
    this.root = root;
  }
  async put(userId, id2, bytes) {
    await mkdir(join(this.root, userId), { recursive: true });
    await writeFile(join(this.root, userId, id2), bytes);
  }
  async get(userId, id2) {
    return readFile(join(this.root, userId, id2)).catch(() => null);
  }
  async remove(userId, id2) {
    await rm(join(this.root, userId, id2), { force: true });
  }
  async removeAll(userId) {
    await rm(join(this.root, userId), { recursive: true, force: true });
  }
  async signedUrl() {
    return null;
  }
};
var SupabaseBlobStore = class {
  client;
  bucket;
  constructor(client, bucket = "documents") {
    this.client = client;
    this.bucket = bucket;
  }
  path(userId, id2) {
    return `${userId}/${id2}`;
  }
  direct = {
    createUrl: async (userId, id2) => {
      const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(`pending/${userId}/${id2}`);
      if (error || !data) throw new Error(`could not create upload link: ${error?.message ?? "unknown"}`);
      return data.signedUrl;
    },
    readPending: async (userId, id2, maxBytes) => {
      const bucket = this.client.storage.from(this.bucket);
      const { data: list, error } = await bucket.list(`pending/${userId}`, { search: id2, limit: 5 });
      if (error) throw new Error(`storage list failed: ${error.message}`);
      const meta = list?.find((o) => o.name === id2);
      if (!meta) return null;
      const size = Number(meta.metadata?.size ?? 0);
      if (size > maxBytes) throw new UploadTooLarge();
      const dl = await bucket.download(`pending/${userId}/${id2}`);
      if (dl.error || !dl.data) return null;
      const buf = Buffer.from(await dl.data.arrayBuffer());
      if (buf.length > maxBytes) throw new UploadTooLarge();
      return buf;
    },
    commit: async (userId, id2) => {
      const { error } = await this.client.storage.from(this.bucket).move(`pending/${userId}/${id2}`, this.path(userId, id2));
      if (error) throw new Error(`storage move failed: ${error.message}`);
    },
    discard: async (userId, id2) => {
      await this.client.storage.from(this.bucket).remove([`pending/${userId}/${id2}`]);
    },
    sweep: async (olderThanMs) => {
      const bucket = this.client.storage.from(this.bucket);
      const cutoff = Date.now() - olderThanMs;
      const { data: folders } = await bucket.list("pending", { limit: 1e3 });
      let removed = 0;
      for (const folder of folders ?? []) {
        const { data: files } = await bucket.list(`pending/${folder.name}`, { limit: 1e3 });
        const old = (files ?? []).filter((f) => f.created_at && Date.parse(f.created_at) < cutoff).map((f) => `pending/${folder.name}/${f.name}`);
        if (old.length) {
          await bucket.remove(old);
          removed += old.length;
        }
      }
      return removed;
    }
  };
  async put(userId, id2, bytes, contentType) {
    const { error } = await this.client.storage.from(this.bucket).upload(this.path(userId, id2), bytes, { contentType, upsert: false });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  }
  async get(userId, id2) {
    const { data, error } = await this.client.storage.from(this.bucket).download(this.path(userId, id2));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(userId, id2) {
    const { error } = await this.client.storage.from(this.bucket).remove([this.path(userId, id2)]);
    if (error) throw new Error(`storage delete failed: ${error.message}`);
  }
  async removeAll(userId) {
    const bucket = this.client.storage.from(this.bucket);
    for (; ; ) {
      const { data, error } = await bucket.list(userId, { limit: 100 });
      if (error) throw new Error(`storage list failed: ${error.message}`);
      if (!data || data.length === 0) return;
      const { error: rmError } = await bucket.remove(data.map((o) => `${userId}/${o.name}`));
      if (rmError) throw new Error(`storage delete failed: ${rmError.message}`);
    }
  }
  async signedUrl(userId, id2, filename, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(this.path(userId, id2), ttlSeconds, { download: filename });
    if (error || !data) return null;
    return data.signedUrl;
  }
};
async function sendBlob(res, blobs, userId, doc) {
  const url = await blobs.signedUrl(userId, doc.id, doc.filename);
  if (url) {
    res.redirect(302, url);
    return;
  }
  const buf = await blobs.get(userId, doc.id);
  if (!buf) throw new HttpError(404, "Document not found");
  res.setHeader("Content-Type", doc.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.filename.replace(/"/g, "")}"`);
  res.send(buf);
}

// server/src/routes/bookings.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import express2, { Router as Router2 } from "express";
import { z as z2 } from "zod";

// server/src/routes/visa.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";

// server/src/services/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes as randomBytes3 } from "node:crypto";
var key = Buffer.from(env.dataKey, "hex");
if (key.length !== 32) throw new Error("DATA_KEY must be 32 bytes of hex (64 characters)");
function encryptJson(value) {
  const iv = randomBytes3(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}
function decryptJson(payload) {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported ciphertext");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  const pt = Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]);
  return JSON.parse(pt.toString("utf8"));
}

// server/src/services/audit.ts
import { randomUUID as randomUUID2 } from "node:crypto";
async function audit(store, input2) {
  try {
    await store.addAudit({
      id: randomUUID2(),
      at: (/* @__PURE__ */ new Date()).toISOString(),
      actorId: input2.actorId,
      action: input2.action,
      targetId: input2.targetId ?? null,
      meta: input2.meta ?? {}
    });
  } catch (e) {
    console.error("Audit write failed:", e instanceof Error ? e.name : "unknown");
  }
}

// server/src/services/scanner.ts
import { Socket } from "node:net";
var EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
var MAX_PIXELS = 1e8;
var blocked = (code, reason) => ({ status: "blocked", code, reason });
var ACTIVE_PDF_NAMES = ["JavaScript", "JS", "Launch", "EmbeddedFile", "EmbeddedFiles", "RichMedia", "XFA", "ImportData", "SubmitForm", "GoToE"];
function inspectPdf(bytes) {
  const text2 = bytes.toString("latin1").replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  for (const name of ACTIVE_PDF_NAMES) {
    if (new RegExp(`/${name}(?=[\\s/<>\\[\\]()%]|$)`).test(text2)) {
      return blocked("pdf-active-content", "This PDF contains active content (scripts, launch actions or embedded files). Export a plain PDF and try again.");
    }
  }
  const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString("latin1");
  if (!tail.includes("%%EOF")) return blocked("pdf-truncated", "This PDF looks incomplete or damaged.");
  return { status: "clean" };
}
var PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function inspectPng(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIG)) return blocked("png-invalid", "This is not a valid PNG image.");
  let pos = 8;
  let first = true;
  while (pos + 12 <= bytes.length) {
    const len = bytes.readUInt32BE(pos);
    const type = bytes.toString("latin1", pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (end > bytes.length) return blocked("png-truncated", "This PNG image is incomplete or damaged.");
    if (first) {
      if (type !== "IHDR" || len !== 13) return blocked("png-invalid", "This is not a valid PNG image.");
      const w = bytes.readUInt32BE(pos + 8);
      const h = bytes.readUInt32BE(pos + 12);
      if (w === 0 || h === 0 || w * h > MAX_PIXELS) return blocked("image-too-large", "This image has implausible dimensions.");
      first = false;
    }
    if (type === "IEND") {
      return end === bytes.length ? { status: "clean" } : blocked("image-trailing-data", "This image has extra data hidden after it.");
    }
    pos = end;
  }
  return blocked("png-truncated", "This PNG image is incomplete or damaged.");
}
var SOF = /* @__PURE__ */ new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
function inspectJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return blocked("jpeg-invalid", "This is not a valid JPEG image.");
  let pos = 2;
  let dims = null;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 255) return blocked("jpeg-invalid", "This is not a valid JPEG image.");
    const marker = bytes[pos + 1];
    if (marker === 255) {
      pos++;
      continue;
    }
    if (marker === 217) break;
    if (marker >= 208 && marker <= 215 || marker === 1) {
      pos += 2;
      continue;
    }
    const len = bytes.readUInt16BE(pos + 2);
    if (len < 2 || pos + 2 + len > bytes.length) return blocked("jpeg-truncated", "This JPEG image is incomplete or damaged.");
    if (SOF.has(marker) && len >= 8) dims = [bytes.readUInt16BE(pos + 7), bytes.readUInt16BE(pos + 5)];
    pos += 2 + len;
    if (marker === 218) break;
  }
  if (!dims) return blocked("jpeg-invalid", "This is not a valid JPEG image.");
  if (dims[0] === 0 || dims[1] === 0 || dims[0] * dims[1] > MAX_PIXELS) return blocked("image-too-large", "This image has implausible dimensions.");
  const eoi = bytes.lastIndexOf(Buffer.from([255, 217]));
  if (eoi < 0) return blocked("jpeg-truncated", "This JPEG image is incomplete or damaged.");
  if (bytes.length - (eoi + 2) > 16) return blocked("image-trailing-data", "This image has extra data hidden after it.");
  return { status: "clean" };
}
function inspectStructure(bytes, mime) {
  if (bytes.includes(EICAR)) return blocked("eicar", "This file contains the standard antivirus test signature (EICAR).");
  if (mime === "application/pdf") return inspectPdf(bytes);
  if (mime === "image/png") return inspectPng(bytes);
  if (mime === "image/jpeg") return inspectJpeg(bytes);
  return blocked("unsupported", "This file type is not accepted.");
}
var CHUNK = 64 * 1024;
function scanWithClamd(bytes, host, port, timeoutMs = 2e4) {
  return new Promise((resolve) => {
    const socket = new Socket();
    let reply = "";
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(timeoutMs, () => done({ status: "unavailable", reason: "The virus scanner timed out." }));
    socket.on("error", () => done({ status: "unavailable", reason: "The virus scanner is not reachable." }));
    socket.on("data", (d) => {
      reply += d.toString("latin1");
    });
    socket.on("close", () => {
      const text2 = reply.replace(/\0/g, "").trim();
      if (/ OK$/.test(text2)) return done({ status: "clean" });
      const found = /^stream:\s*(.+?)\s+FOUND$/.exec(text2);
      if (found) return done(blocked("malware", `This file was flagged as malware (${found[1]}).`));
      done({ status: "unavailable", reason: "The virus scanner returned an unexpected answer." });
    });
    socket.connect(port, host, () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        socket.write(len);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
async function scanUpload(bytes, mime) {
  const structural = inspectStructure(bytes, mime);
  if (structural.status !== "clean") return structural;
  if (!env.clamdHost) return { status: "clean" };
  const av = await scanWithClamd(bytes, env.clamdHost, env.clamdPort);
  if (av.status === "unavailable" && env.scanFailMode === "open") return { status: "clean", unscanned: true };
  return av;
}

// server/src/services/upload-guard.ts
async function guardUpload(store, userId, bytes, mime) {
  const result = await scanUpload(bytes, mime);
  if (result.status === "blocked") {
    await audit(store, { actorId: userId, action: "upload.blocked", meta: { code: result.code } });
    throw new HttpError(422, result.reason);
  }
  if (result.status === "unavailable") {
    await audit(store, { actorId: userId, action: "upload.scan_unavailable" });
    throw new HttpError(503, "Files cannot be checked for viruses right now, so the upload was not accepted. Try again later.");
  }
  if (result.unscanned) await audit(store, { actorId: userId, action: "upload.unscanned" });
}

// server/src/routes/visa.ts
var MAX_UPLOAD = env.maxUploadBytes;
var MAX_DOCS_PER_USER = 100;
var sectionSchema = z.record(z.string().max(60), z.string().max(3e3));
var dataSchema = z.record(z.string().max(40), sectionSchema).refine((d) => Object.keys(d).length <= 12, "Too many sections");
var upsertSchema = z.object({
  destinationId: z.string().trim().min(1).max(40),
  categoryId: z.string().trim().min(1).max(40),
  nationality: z.string().trim().max(60).default(""),
  residence: z.string().trim().max(60).default(""),
  status: z.enum(["draft", "ready", "submitted_on_portal"]).default("draft"),
  checklist: z.record(z.string().max(60), z.boolean()).default({}),
  data: dataSchema.default({})
});
function view(app) {
  const { dataEnc, ...rest } = app;
  return { ...rest, data: decryptJson(dataEnc) };
}
function sniffMime(buf) {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "image/jpeg";
  return null;
}
function safeFilename(name) {
  const base3 = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base3.replace(/[^\w. -]/g, "_").replace(/^\.+/, "").slice(0, 100);
  return cleaned || "document";
}
function visaRoutes(store, blobs) {
  const r = Router();
  r.use(requireAuth);
  r.get("/applications", async (req, res) => {
    const apps = await store.listApplications(req.session.sub);
    res.json({ applications: apps.map(view) });
  });
  r.get("/applications/:id", async (req, res) => {
    const app = await store.getApplication(req.session.sub, String(req.params.id));
    if (!app) throw new HttpError(404, "Application not found");
    res.json({ application: view(app), documents: await store.listDocuments(req.session.sub, app.id) });
  });
  r.put("/applications", async (req, res) => {
    const input2 = upsertSchema.parse(req.body);
    const userId = req.session.sub;
    const existing = (await store.listApplications(userId)).find(
      (a) => a.destinationId === input2.destinationId && a.categoryId === input2.categoryId
    );
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const app = {
      id: existing?.id ?? randomUUID3(),
      userId,
      destinationId: input2.destinationId,
      categoryId: input2.categoryId,
      nationality: input2.nationality,
      residence: input2.residence,
      status: input2.status,
      checklist: input2.checklist,
      dataEnc: encryptJson(input2.data),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await store.saveApplication(app);
    res.status(existing ? 200 : 201).json({ application: view(app) });
  });
  r.delete("/applications/:id", async (req, res) => {
    const userId = req.session.sub;
    const id2 = String(req.params.id);
    const docs = await store.listDocuments(userId, id2);
    if (!await store.deleteApplication(userId, id2)) throw new HttpError(404, "Application not found");
    await Promise.all(docs.map((d) => blobs.remove(userId, d.id)));
    res.status(204).end();
  });
  r.post(
    "/applications/:id/documents",
    express.raw({ type: () => true, limit: MAX_UPLOAD }),
    async (req, res) => {
      const userId = req.session.sub;
      const app = await store.getApplication(userId, String(req.params.id));
      if (!app) throw new HttpError(404, "Application not found");
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, "Empty upload");
      const mime = sniffMime(body);
      if (!mime) throw new HttpError(415, "Only PDF, PNG and JPEG files are accepted");
      if ((await store.listDocuments(userId)).length >= MAX_DOCS_PER_USER) throw new HttpError(409, "Document limit reached");
      await guardUpload(store, userId, body, mime);
      const itemId = z.string().max(60).parse(req.query.itemId ?? "");
      const doc = {
        id: randomUUID3(),
        userId,
        applicationId: app.id,
        itemId,
        filename: safeFilename(String(req.query.filename ?? "")),
        mime,
        size: body.length,
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await blobs.put(userId, doc.id, body, mime);
      await store.saveDocument(doc);
      res.status(201).json({ document: doc });
    }
  );
  r.get("/documents/:id", async (req, res) => {
    const userId = req.session.sub;
    const doc = await store.getDocument(userId, String(req.params.id));
    if (!doc) throw new HttpError(404, "Document not found");
    await sendBlob(res, blobs, userId, doc);
  });
  r.delete("/documents/:id", async (req, res) => {
    const userId = req.session.sub;
    const id2 = String(req.params.id);
    if (!await store.deleteDocument(userId, id2)) throw new HttpError(404, "Document not found");
    await blobs.remove(userId, id2);
    res.status(204).end();
  });
  return r;
}

// server/src/routes/bookings.ts
var MAX_UPLOAD2 = env.maxUploadBytes;
var isoDate = z2.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var bookingInput = z2.object({
  kind: z2.enum(["flight", "hotel", "insurance"]),
  status: z2.enum(["sample", "requested", "confirmed"]),
  source: z2.enum(["demo", "user-entered"]),
  title: z2.string().trim().min(1).max(150),
  startDate: isoDate,
  endDate: isoDate.nullable().default(null),
  confirmationRef: z2.string().trim().max(40).nullable().default(null),
  details: z2.record(z2.string().max(40), z2.union([z2.string().max(300), z2.number()])).default({})
}).superRefine((b, ctx) => {
  const ref = b.confirmationRef;
  if (b.source === "demo" && (b.status !== "sample" || ref)) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Demo data can only be saved as a sample" });
  }
  if (b.status === "sample" && ref) {
    ctx.addIssue({ code: "custom", path: ["confirmationRef"], message: "A sample cannot have a confirmation reference" });
  }
  if (b.status === "confirmed" && !ref) {
    ctx.addIssue({ code: "custom", path: ["confirmationRef"], message: "Enter the confirmation reference from your provider" });
  }
  if (b.endDate && b.endDate < b.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date" });
  }
});
async function saveUploadedDocument(store, blobs, userId, ownerId, itemId, req) {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, "Empty upload");
  const mime = sniffMime(body);
  if (!mime) throw new HttpError(415, "Only PDF, PNG and JPEG files are accepted");
  if ((await store.listDocuments(userId)).length >= 100) throw new HttpError(409, "Document limit reached");
  await guardUpload(store, userId, body, mime);
  const doc = {
    id: randomUUID4(),
    userId,
    applicationId: ownerId,
    itemId,
    filename: safeFilename(String(req.query.filename ?? "")),
    mime,
    size: body.length,
    uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await blobs.put(userId, doc.id, body, mime);
  await store.saveDocument(doc);
  return doc;
}
function bookingRoutes(store, blobs) {
  const r = Router2();
  r.use(requireAuth);
  r.get("/", async (req, res) => {
    const userId = req.session.sub;
    const bookings = await store.listBookings(userId);
    const docs = await store.listDocuments(userId);
    res.json({ bookings: bookings.map((b) => ({ ...b, documents: docs.filter((d) => d.applicationId === b.id) })) });
  });
  r.post("/", async (req, res) => {
    const input2 = bookingInput.parse(req.body);
    const booking = {
      id: randomUUID4(),
      userId: req.session.sub,
      ...input2,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await store.saveBooking(booking);
    res.status(201).json({ booking: { ...booking, documents: [] } });
  });
  r.delete("/:id", async (req, res) => {
    const userId = req.session.sub;
    const id2 = String(req.params.id);
    if (!await store.deleteBooking(userId, id2)) throw new HttpError(404, "Booking not found");
    for (const d of await store.listDocuments(userId, id2)) {
      await store.deleteDocument(userId, d.id);
      await blobs.remove(userId, d.id);
    }
    res.status(204).end();
  });
  r.post("/:id/documents", express2.raw({ type: () => true, limit: MAX_UPLOAD2 }), async (req, res) => {
    const userId = req.session.sub;
    const booking = await store.getBooking(userId, String(req.params.id));
    if (!booking) throw new HttpError(404, "Booking not found");
    const doc = await saveUploadedDocument(store, blobs, userId, booking.id, "booking", req);
    res.status(201).json({ document: doc });
  });
  r.get("/documents/:docId", async (req, res) => {
    const userId = req.session.sub;
    const doc = await store.getDocument(userId, String(req.params.docId));
    if (!doc) throw new HttpError(404, "Document not found");
    await sendBlob(res, blobs, userId, doc);
  });
  return r;
}

// server/src/integrations/providers.ts
var providers = {};
function requireProvider(kind) {
  const p = providers[kind];
  if (!p) throw new HttpError(501, `No live ${kind} provider is configured.`);
  return p;
}

// server/src/routes/translate.ts
import { Router as Router3 } from "express";
import rateLimit2 from "express-rate-limit";
import { z as z3 } from "zod";
var lang = z3.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, "Invalid language code");
var input = z3.object({
  text: z3.string().trim().min(1, "Nothing to translate").max(5e3, "Text is too long (5,000 characters max)"),
  source: z3.union([z3.literal("auto"), lang]),
  target: lang
});
function looksLikeMrz(text2) {
  return text2.toUpperCase().split(/\r?\n/).map((l) => l.replace(/[^A-Z0-9<]/g, "")).some((l) => l.length >= 36 && (l.match(/</g)?.length ?? 0) >= 5);
}
var MYMEMORY_URL = "https://api.mymemory.translated.net/get";
var MYMEMORY_MAX = 450;
var MYMEMORY_LANG = { zh: "zh-CN" };
function chunkText(text2, max = MYMEMORY_MAX) {
  const out = [];
  for (const line of text2.split("\n")) {
    if (!line.trim()) {
      out.push("");
      continue;
    }
    let cur = "";
    for (const piece of line.match(/[^.!?؟。！？]+[.!?؟。！？]*\s*|\S+/g) ?? [line]) {
      for (let i = 0; i < piece.length; i += max) {
        const part = piece.slice(i, i + max);
        if (cur && cur.length + part.length > max) {
          out.push(cur);
          cur = "";
        }
        cur += part;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}
async function translateWithMyMemory(text2, source, target) {
  const code = (c) => MYMEMORY_LANG[c] ?? c;
  const pair = `${source === "auto" ? "Autodetect" : code(source)}|${code(target)}`;
  const chunks = chunkText(text2);
  const translated = [];
  for (let i = 0; i < chunks.length; i += 4) {
    const batch = await Promise.all(
      chunks.slice(i, i + 4).map(async (q) => {
        if (!q.trim()) return q;
        const url = new URL(MYMEMORY_URL);
        url.searchParams.set("q", q);
        url.searchParams.set("langpair", pair);
        if (env.myMemoryEmail) url.searchParams.set("de", env.myMemoryEmail);
        let r;
        try {
          r = await fetch(url, { signal: AbortSignal.timeout(1e4) });
        } catch {
          throw new HttpError(502, "The translation service did not respond");
        }
        const data = await r.json().catch(() => null);
        const status = Number(data?.responseStatus ?? r.status);
        if (status === 429 || /QUOTA/i.test(String(data?.responseData?.translatedText))) {
          throw new HttpError(429, "The free daily translation limit was reached. Please try again tomorrow.");
        }
        if (status !== 200 || typeof data?.responseData?.translatedText !== "string") throw new HttpError(502, "The translation service returned an error");
        return data.responseData.translatedText;
      })
    );
    translated.push(...batch);
  }
  return translated.join("\n").replace(/ ?\n ?/g, "\n");
}
async function translateWithLibre(baseUrl, text2, source, target) {
  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text2, source, target, format: "text" }),
      signal: AbortSignal.timeout(6e3)
    });
    if (!upstream.ok) return null;
    const data = await upstream.json().catch(() => null);
    if (typeof data?.translatedText !== "string") return null;
    return { translatedText: data.translatedText, detected: data.detectedLanguage?.language ?? null };
  } catch {
    return null;
  }
}
var limiter = rateLimit2({
  windowMs: 6e4,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: "Too many translation requests. Slow down." }
});
function translateRoutes() {
  const r = Router3();
  r.use(requireAuth);
  r.post("/", limiter, async (req, res) => {
    const { text: text2, source, target } = input.parse(req.body);
    if (looksLikeMrz(text2)) throw new HttpError(422, "This looks like passport data, so it was not sent for translation");
    if (env.libreTranslateUrl) {
      const viaLibre = await translateWithLibre(env.libreTranslateUrl, text2, source, target);
      if (viaLibre) {
        res.json(viaLibre);
        return;
      }
      console.warn("[translate] LibreTranslate is not responding; using MyMemory instead");
    }
    res.json({ translatedText: await translateWithMyMemory(text2, source, target), detected: null });
  });
  return r;
}

// server/src/integrations/travelpayouts.ts
import { z as z4 } from "zod";
var ticket = z4.object({
  origin: z4.string(),
  destination: z4.string(),
  price: z4.number(),
  airline: z4.string(),
  departure_at: z4.string(),
  return_at: z4.string().optional(),
  transfers: z4.number().optional(),
  return_transfers: z4.number().optional(),
  duration_to: z4.number().optional(),
  duration_back: z4.number().optional(),
  duration: z4.number().optional(),
  link: z4.string().optional()
});
var response = z4.object({ success: z4.boolean().optional(), data: z4.array(ticket) });
var flightQuery = z4.object({
  origin: z4.string().regex(/^[A-Z]{3}$/),
  destination: z4.string().regex(/^[A-Z]{3}$/),
  departDate: z4.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z4.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  adults: z4.number().int().min(1).max(9),
  children: z4.number().int().min(0).max(8),
  cabin: z4.enum(["economy", "premium", "business", "first"])
});
function addMinutes(local, min) {
  const t = Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10), +local.slice(11, 13), +local.slice(14, 16) + min);
  return new Date(t).toISOString().slice(0, 16);
}
function parseTickets(json, q, marker) {
  const parsed = response.safeParse(json);
  if (!parsed.success) throw new HttpError(502, "Unexpected response from the fare provider");
  const pax = q.adults + q.children;
  const offers = parsed.data.data.map((t, i) => {
    const out = t.departure_at.slice(0, 16);
    const outMin = t.duration_to ?? t.duration ?? 0;
    const link = t.link && t.link.startsWith("/search/") ? `https://www.aviasales.com${t.link}` : void 0;
    const bookUrl = link && marker ? `${link}${link.includes("?") ? "&" : "?"}marker=${encodeURIComponent(marker)}` : link;
    return {
      id: `tp-${i}`,
      airline: `Airline ${t.airline}`,
      outbound: { from: t.origin, to: t.destination, departAt: out, arriveAt: addMinutes(out, outMin), durationMin: outMin, stops: t.transfers ?? 0, via: [] },
      inbound: t.return_at ? {
        from: t.destination,
        to: t.origin,
        departAt: t.return_at.slice(0, 16),
        arriveAt: addMinutes(t.return_at.slice(0, 16), t.duration_back ?? 0),
        durationMin: t.duration_back ?? 0,
        stops: t.return_transfers ?? 0,
        via: []
      } : null,
      fares: [{
        id: "cached",
        name: "Cached fare",
        price: Math.round(t.price * pax),
        cabinBag: "See partner site",
        checkedBag: "See partner site",
        changeable: null,
        refundable: null
      }],
      currency: "USD",
      bookUrl
    };
  });
  return {
    mode: "live",
    offers,
    notice: "Cached lowest fares from the Travelpayouts/Aviasales network (found in the last ~48 hours), shown for economy per traveller x passengers. Real price, baggage rules and availability are confirmed on the partner site. Arrival times are estimated."
  };
}
function travelpayoutsFlights(token, marker) {
  return {
    name: "travelpayouts",
    async search(raw) {
      const q = flightQuery.parse(raw);
      const url = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
      url.search = new URLSearchParams({
        origin: q.origin,
        destination: q.destination,
        departure_at: q.departDate,
        ...q.returnDate ? { return_at: q.returnDate } : {},
        one_way: q.returnDate ? "false" : "true",
        unique: "false",
        sorting: "price",
        direction: "1",
        cy: "usd",
        limit: "30",
        token
      }).toString();
      let res;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(12e3) });
      } catch {
        throw new HttpError(502, "The fare provider did not respond");
      }
      if (!res.ok) throw new HttpError(502, "The fare provider returned an error");
      return parseTickets(await res.json().catch(() => null), q, marker);
    }
  };
}

// server/src/routes/documents.ts
import { Router as Router4 } from "express";
function documentRoutes(store, blobs) {
  const r = Router4();
  r.use(requireAuth);
  r.get("/", async (req, res) => {
    const userId = req.session.sub;
    const [docs, apps, bookings, appts] = await Promise.all([
      store.listDocuments(userId),
      store.listApplications(userId),
      store.listBookings(userId),
      store.listAppointments(userId)
    ]);
    const owners = /* @__PURE__ */ new Map();
    for (const a of apps) owners.set(a.id, { kind: "visa", label: `${a.destinationId} / ${a.categoryId}` });
    for (const b of bookings) owners.set(b.id, { kind: b.kind, label: b.title });
    for (const a of appts) owners.set(a.id, { kind: "appointment", label: `${a.type} - ${a.center}` });
    res.json({
      documents: docs.map((d) => ({
        id: d.id,
        filename: d.filename,
        mime: d.mime,
        size: d.size,
        uploadedAt: d.uploadedAt,
        itemId: d.itemId,
        ownerId: d.applicationId,
        owner: owners.get(d.applicationId) ?? null
      })).filter((d) => d.owner !== null)
    });
  });
  r.get("/:id/url", async (req, res) => {
    const userId = req.session.sub;
    const doc = await store.getDocument(userId, String(req.params.id));
    if (!doc) throw new HttpError(404, "Document not found");
    const url = await blobs.signedUrl(userId, doc.id, doc.filename);
    res.json({ url: url ?? `/api/documents/${doc.id}/file`, signed: !!url, expiresInSeconds: url ? SIGNED_URL_TTL_SECONDS : null });
  });
  r.get("/:id/file", async (req, res) => {
    const userId = req.session.sub;
    const doc = await store.getDocument(userId, String(req.params.id));
    if (!doc) throw new HttpError(404, "Document not found");
    await sendBlob(res, blobs, userId, doc);
  });
  return r;
}

// server/src/routes/expenses.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { Router as Router5 } from "express";
import { z as z5 } from "zod";
var EXPENSE_CATEGORIES = ["flights", "accommodation", "insurance", "visa", "transport", "food", "activities", "connectivity", "other"];
var isoDate2 = z5.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
var base = z5.object({
  tripId: z5.string().uuid().nullable().default(null),
  category: z5.enum(EXPENSE_CATEGORIES),
  description: z5.string().trim().max(120).default(""),
  // Cents precision, positive, bounded: money is stored as the user typed it. No exchange rates are ever applied.
  amount: z5.number().positive("Amount must be greater than zero").max(1e7).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places"),
  currency: z5.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code such as USD"),
  spentOn: isoDate2,
  status: z5.enum(["estimated", "paid"]).default("estimated")
});
var update = base.partial();
function expenseRoutes(store) {
  const r = Router5();
  r.use(requireAuth);
  const checkTrip = async (userId, tripId) => {
    if (tripId && !await store.getTrip(userId, tripId)) throw new HttpError(400, "That trip does not exist");
  };
  r.get("/", async (req, res) => {
    const tripId = typeof req.query.tripId === "string" && req.query.tripId ? req.query.tripId : void 0;
    res.json({ expenses: await store.listExpenses(req.session.sub, tripId) });
  });
  r.post("/", async (req, res) => {
    const userId = req.session.sub;
    const input2 = base.parse(req.body);
    await checkTrip(userId, input2.tripId);
    const expense = { id: randomUUID5(), userId, ...input2, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    await store.saveExpense(expense);
    res.status(201).json({ expense });
  });
  r.patch("/:id", async (req, res) => {
    const userId = req.session.sub;
    const existing = await store.getExpense(userId, String(req.params.id));
    if (!existing) throw new HttpError(404, "Expense not found");
    const patch = update.parse(req.body);
    const sent = new Set(Object.keys(req.body ?? {}));
    await checkTrip(userId, patch.tripId);
    const updated = { ...existing, ...Object.fromEntries(Object.entries(patch).filter(([k, v]) => sent.has(k) && v !== void 0)) };
    await store.saveExpense(updated);
    res.json({ expense: updated });
  });
  r.delete("/:id", async (req, res) => {
    if (!await store.deleteExpense(req.session.sub, String(req.params.id))) throw new HttpError(404, "Expense not found");
    res.status(204).end();
  });
  return r;
}

// server/src/routes/hotels.ts
import { Router as Router6 } from "express";
import rateLimit3 from "express-rate-limit";
import { z as z6 } from "zod";

// server/src/integrations/osm-hotels.ts
var TOURISM_TO_KIND = {
  hotel: "hotel",
  hostel: "hostel",
  guest_house: "guesthouse",
  motel: "motel",
  apartment: "apartment",
  chalet: "chalet"
};
function buildQuery(lat, lng, radiusM) {
  const kinds = Object.keys(TOURISM_TO_KIND).join("|");
  return `[out:json][timeout:20];nwr["tourism"~"^(${kinds})$"]["name"](around:${Math.round(radiusM)},${lat},${lng});out center 300;`;
}
function haversineKm(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function safeUrl(raw) {
  if (!raw) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return null;
  const candidate = hasScheme ? raw : `https://${raw}`;
  try {
    const u = new URL(candidate);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
function address(t) {
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  return [street, t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", ");
}
function parseOverpass(json, center, limit = 300) {
  const elements = json?.elements;
  if (!Array.isArray(elements)) throw new HttpError(502, "Unexpected response from the hotel directory");
  const out = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    const kind = TOURISM_TO_KIND[t.tourism ?? ""];
    const name = t.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!kind || !name || typeof lat !== "number" || typeof lng !== "number") continue;
    const stars = Number.parseFloat(t.stars ?? "");
    const wifi = t.internet_access === "wlan" || t.internet_access === "yes" ? true : t.internet_access === "no" ? false : null;
    out.push({
      id: `${el.type}/${el.id}`,
      name: name.slice(0, 120),
      kind,
      stars: Number.isFinite(stars) && stars >= 1 && stars <= 5 ? Math.round(stars * 2) / 2 : null,
      lat,
      lng,
      distanceKm: Math.round(haversineKm(center, { lat, lng }) * 10) / 10,
      address: address(t).slice(0, 200),
      website: safeUrl(t.website ?? t["contact:website"]),
      phone: (t.phone ?? t["contact:phone"] ?? "").slice(0, 40) || null,
      wifi,
      wheelchair: t.wheelchair === "yes" || t.wheelchair === "limited" || t.wheelchair === "no" ? t.wheelchair : null,
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}
var FALLBACK_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
var USER_AGENT = "TripPilot/0.1 (travel planning app; hotel directory)";
var TTL_MS = 6 * 60 * 60 * 1e3;
var MAX_ENTRIES = 200;
var cache = /* @__PURE__ */ new Map();
var OverpassFailure = class extends Error {
  status;
  constructor(status) {
    super(`Overpass failed (${status})`);
    this.status = status;
  }
};
async function fromOverpass(lat, lng, radiusM) {
  const body = new URLSearchParams({ data: buildQuery(lat, lng, radiusM) });
  const servers = [env.overpassUrl, ...FALLBACK_SERVERS.filter((u) => u !== env.overpassUrl)];
  let failure = 0;
  const res = await Promise.any(
    servers.map(async (url) => {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
          body,
          signal: AbortSignal.timeout(9e3)
        });
        if (!r.ok) {
          failure ||= r.status;
          console.warn(`[hotels] Overpass ${new URL(url).host} answered ${r.status}`);
          throw new Error(String(r.status));
        }
        return r;
      } catch (e) {
        if (!failure) console.warn(`[hotels] Overpass ${new URL(url).host} did not respond`);
        throw e;
      }
    })
  ).catch(() => {
    throw new OverpassFailure(failure);
  });
  return parseOverpass(await res.json().catch(() => null), { lat, lng });
}
function parseNominatim(json, center) {
  if (!Array.isArray(json)) return [];
  const out = [];
  for (const h of json) {
    const kind = h.category === "tourism" ? TOURISM_TO_KIND[h.type ?? ""] : void 0;
    const name = h.name?.trim();
    const lat = Number(h.lat);
    const lng = Number(h.lon);
    if (!kind || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || !h.osm_type || !h.osm_id) continue;
    const t = h.extratags ?? {};
    const a = h.address ?? {};
    const stars = Number.parseFloat(t.stars ?? "");
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    out.push({
      id: `${h.osm_type}/${h.osm_id}`,
      name: name.slice(0, 120),
      kind,
      stars: Number.isFinite(stars) && stars >= 1 && stars <= 5 ? Math.round(stars * 2) / 2 : null,
      lat,
      lng,
      distanceKm: Math.round(haversineKm(center, { lat, lng }) * 10) / 10,
      address: [street, a.suburb ?? a.neighbourhood, a.city ?? a.town ?? a.village, a.postcode].filter(Boolean).join(", ").slice(0, 200),
      website: safeUrl(t.website ?? t["contact:website"]),
      phone: (t.phone ?? t["contact:phone"] ?? "").slice(0, 40) || null,
      wifi: t.internet_access === "wlan" || t.internet_access === "yes" ? true : t.internet_access === "no" ? false : null,
      wheelchair: t.wheelchair === "yes" || t.wheelchair === "limited" || t.wheelchair === "no" ? t.wheelchair : null,
      osmUrl: `https://www.openstreetmap.org/${h.osm_type}/${h.osm_id}`
    });
  }
  return out;
}
async function fromNominatim(lat, lng, radiusM) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(Math.cos(lat * Math.PI / 180), 0.01));
  const viewbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(5)).join(",");
  const found = [];
  let ok2 = false;
  for (const [i, q] of ["hotel", "guest house", "hostel"].entries()) {
    if (i > 0 && !env.isTest) await new Promise((r) => setTimeout(r, 1100));
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&addressdetails=1&extratags=1&accept-language=en&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(8e3) });
      if (!r.ok) continue;
      ok2 = true;
      found.push(...parseNominatim(await r.json().catch(() => null), { lat, lng }));
    } catch {
    }
  }
  if (!ok2) throw new Error("Nominatim unavailable");
  return found;
}
async function fetchDirectory(lat, lng, radiusM) {
  const key2 = `${lat.toFixed(2)},${lng.toFixed(2)},${radiusM}`;
  const hit = cache.get(key2);
  if (hit && Date.now() - hit.at < TTL_MS) return { listings: hit.listings, cached: true };
  const [overpass, nominatim] = await Promise.allSettled([fromOverpass(lat, lng, radiusM), fromNominatim(lat, lng, radiusM)]);
  if (overpass.status === "rejected" && nominatim.status === "rejected") {
    const failure = overpass.reason instanceof OverpassFailure ? overpass.reason.status : 0;
    if (failure === 0) throw new HttpError(502, "The hotel directory did not respond. Try again in a minute.");
    if (failure === 429 || failure === 504) throw new HttpError(503, "The hotel directory is busy. Try again in a minute.");
    throw new HttpError(502, "The hotel directory returned an error.");
  }
  const merged = /* @__PURE__ */ new Map();
  for (const r of [overpass, nominatim]) if (r.status === "fulfilled") {
    for (const l of r.value) if (!merged.has(l.id)) merged.set(l.id, l);
  }
  const listings = [...merged.values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 300);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key2, { at: Date.now(), listings });
  return { listings, cached: false };
}

// server/src/routes/hotels.ts
var query = z6.object({
  lat: z6.coerce.number().min(-90).max(90),
  lng: z6.coerce.number().min(-180).max(180),
  radius: z6.coerce.number().int().min(500).max(15e3).default(5e3)
});
var limiter2 = rateLimit3({
  windowMs: 6e4,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: "Too many hotel searches. Slow down." }
});
function hotelRoutes() {
  const r = Router6();
  r.use(requireAuth);
  r.get("/directory", limiter2, async (req, res) => {
    const { lat, lng, radius } = query.parse(req.query);
    const { listings, cached } = await fetchDirectory(lat, lng, radius);
    res.json({
      listings,
      cached,
      source: "OpenStreetMap contributors",
      notice: "Real properties from OpenStreetMap. Prices, availability and reviews are not included: check them with a booking partner."
    });
  });
  return r;
}

// server/src/routes/appointments.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import express3, { Router as Router7 } from "express";
import { z as z7 } from "zod";
var dateTime = z7.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use YYYY-MM-DDTHH:mm");
var base2 = z7.object({
  destinationId: z7.string().trim().max(40).default(""),
  center: z7.string().trim().min(1).max(150),
  type: z7.enum(["visa", "biometrics", "interview", "other"]),
  startsAt: dateTime,
  preferredTimes: z7.string().trim().max(120).default(""),
  status: z7.enum(["requested", "pending", "confirmed"]),
  /** Reference or confirmation the user copied from the official provider. Never generated here. */
  officialRef: z7.string().trim().max(60).nullable().default(null),
  reminderDays: z7.number().int().min(0).max(30).default(0),
  notes: z7.string().trim().max(500).default(""),
  checklist: z7.record(z7.string().max(40), z7.boolean()).default({})
});
var rule = (a, ctx) => {
  if (a.status === "confirmed" && !a.officialRef) {
    ctx.addIssue({ code: "custom", path: ["officialRef"], message: "Enter the reference from the official confirmation" });
  }
  if (a.status !== "confirmed" && a.officialRef) {
    ctx.addIssue({ code: "custom", path: ["officialRef"], message: "Only confirmed appointments have a reference" });
  }
};
var appointmentInput = base2.superRefine(rule);
function appointmentRoutes(store, blobs) {
  const r = Router7();
  r.use(requireAuth);
  r.get("/", async (req, res) => {
    const userId = req.session.sub;
    const docs = await store.listDocuments(userId);
    const items = await store.listAppointments(userId);
    res.json({ appointments: items.map((a) => ({ ...a, documents: docs.filter((d) => d.applicationId === a.id) })) });
  });
  r.post("/", async (req, res) => {
    const input2 = appointmentInput.parse(req.body);
    const a = { id: randomUUID6(), userId: req.session.sub, ...input2, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    await store.saveAppointment(a);
    res.status(201).json({ appointment: { ...a, documents: [] } });
  });
  r.patch("/:id", async (req, res) => {
    const userId = req.session.sub;
    const existing = await store.getAppointment(userId, String(req.params.id));
    if (!existing) throw new HttpError(404, "Appointment not found");
    const { id: _i, userId: _u, createdAt, ...current } = existing;
    const merged = appointmentInput.parse({ ...current, ...req.body });
    const updated = { ...merged, id: existing.id, userId, createdAt };
    await store.saveAppointment(updated);
    res.json({ appointment: updated });
  });
  r.delete("/:id", async (req, res) => {
    const userId = req.session.sub;
    const id2 = String(req.params.id);
    if (!await store.deleteAppointment(userId, id2)) throw new HttpError(404, "Appointment not found");
    for (const d of await store.listDocuments(userId, id2)) {
      await store.deleteDocument(userId, d.id);
      await blobs.remove(userId, d.id);
    }
    res.status(204).end();
  });
  r.post("/:id/documents", express3.raw({ type: () => true, limit: env.maxUploadBytes }), async (req, res) => {
    const userId = req.session.sub;
    const a = await store.getAppointment(userId, String(req.params.id));
    if (!a) throw new HttpError(404, "Appointment not found");
    res.status(201).json({ document: await saveUploadedDocument(store, blobs, userId, a.id, "appointment", req) });
  });
  return r;
}

// server/src/routes/auth.ts
import { Router as Router8 } from "express";

// server/src/validators/schemas.ts
import { z as z8 } from "zod";
var isoDate3 = z8.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
var text = (max) => z8.string().trim().min(1).max(max);
var COMMON = /* @__PURE__ */ new Set([
  "password12",
  "password123",
  "password1234",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "qwerty12345",
  "iloveyou12",
  "letmein1234",
  "welcome1234",
  "admin12345",
  "trippilot",
  "trippilot1",
  "trippilot123",
  "abcdefghij",
  "abc1234567"
]);
function passwordProblem(password, email) {
  const p = password.toLowerCase();
  if (COMMON.has(p)) return "That password is too common";
  if (new Set(p).size < 4) return "Use a more varied password";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && p.includes(local)) return "Password must not contain your email name";
  return null;
}
var registerSchema = z8.object({
  name: text(80),
  email: z8.string().trim().toLowerCase().email().max(254),
  password: z8.string().min(10, "Password must be at least 10 characters").max(128)
}).superRefine((v, ctx) => {
  const problem = passwordProblem(v.password, v.email);
  if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
});
var loginSchema = z8.object({
  email: z8.string().trim().toLowerCase().email().max(254),
  password: z8.string().min(1).max(128)
});
var profileSchema = z8.object({
  nationality: text(60),
  residenceCountry: text(60),
  homeAirport: z8.string().trim().max(60).default(""),
  interests: z8.array(text(40)).max(12).default([])
});
var accountNameSchema = z8.object({
  name: text(80)
});
var passwordChangeSchema = z8.object({
  currentPassword: z8.string().min(1).max(128),
  newPassword: z8.string().min(10, "Password must be at least 10 characters").max(128)
});
var tripBase = z8.object({
  destination: text(80),
  departOn: isoDate3,
  returnOn: isoDate3,
  purpose: text(40),
  budget: z8.number().nonnegative().max(1e7).nullable().default(null)
});
var tripSchema = tripBase.refine((t) => t.returnOn >= t.departOn, {
  path: ["returnOn"],
  message: "Return date must be on or after departure"
});
var tripUpdateSchema = tripBase.partial().extend({ status: z8.enum(["planning", "ready", "completed"]).optional() }).refine((t) => !t.departOn || !t.returnOn || t.returnOn >= t.departOn, {
  path: ["returnOn"],
  message: "Return date must be on or after departure"
});

// server/src/routes/auth.ts
function setSession(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1e3,
    path: "/"
  });
}
function authRoutes(store) {
  const r = Router8();
  r.post("/register", authLimiter, async (req, res) => {
    const input2 = registerSchema.parse(req.body);
    if (await store.findUserByEmail(input2.email)) throw new HttpError(409, "An account with this email already exists");
    const user = newUser({ name: input2.name, email: input2.email, passwordHash: await hashPassword(input2.password) });
    await store.saveUser(user);
    const profile = {
      userId: user.id,
      nationality: "",
      residenceCountry: "",
      homeAirport: "",
      interests: [],
      onboardedAt: null
    };
    await store.saveProfile(profile);
    await audit(store, { actorId: user.id, action: "auth.register", targetId: user.id });
    if (!env.isProd) console.log(`[dev] verify link: ${env.clientOrigin}/verify-email?token=${user.verifyToken}`);
    setSession(res, signSession(user));
    res.status(201).json({ user: toPublicUser(user) });
  });
  r.post("/login", authLimiter, async (req, res) => {
    const input2 = loginSchema.parse(req.body);
    const user = await store.findUserByEmail(input2.email);
    if (!user || !await checkPassword(user, input2.password)) {
      if (user) await audit(store, { actorId: null, action: "auth.login_failed", targetId: user.id });
      throw new HttpError(401, "Incorrect email or password");
    }
    if (user.disabledAt) {
      await audit(store, { actorId: null, action: "auth.login_blocked", targetId: user.id });
      throw new HttpError(403, "This account has been disabled. Contact support.");
    }
    await audit(store, { actorId: user.id, action: "auth.login", targetId: user.id });
    setSession(res, signSession(user));
    res.json({ user: toPublicUser(user) });
  });
  r.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });
  r.post("/verify-email", async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const user = token ? await store.findUserByVerifyToken(token) : void 0;
    if (!user) throw new HttpError(400, "Invalid or expired verification link");
    const isAdmin = !!env.adminEmail && user.email === env.adminEmail;
    await store.saveUser({ ...user, role: isAdmin ? "admin" : user.role, emailVerifiedAt: (/* @__PURE__ */ new Date()).toISOString(), verifyToken: null });
    res.json({ ok: true });
  });
  r.get("/me", requireAuth, async (req, res) => {
    const user = await store.findUserById(req.session.sub);
    if (!user) throw new HttpError(401, "Not signed in");
    const profile = await store.getProfile(user.id);
    res.json({ user: toPublicUser(user), profile });
  });
  return r;
}

// server/src/routes/admin.ts
import { Router as Router9 } from "express";
import { z as z9 } from "zod";

// server/src/middleware/session-guard.ts
var CACHE_MS = env.isTest ? 0 : 1e4;
var cache2 = /* @__PURE__ */ new Map();
var invalidateSessionCache = (userId) => userId ? cache2.delete(userId) : cache2.clear();
function sessionGuard(store) {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE];
      const session = token ? verifySession(token) : null;
      if (!token || !session) return next();
      let entry = cache2.get(session.sub);
      if (!entry || Date.now() - entry.at >= CACHE_MS) {
        const user = await store.findUserById(session.sub);
        entry = { at: Date.now(), ok: !!user && !user.disabledAt };
        cache2.set(session.sub, entry);
        if (cache2.size > 5e3) cache2.delete(cache2.keys().next().value);
      }
      if (!entry.ok) {
        delete req.cookies[SESSION_COOKIE];
        res.clearCookie(SESSION_COOKIE, { path: "/" });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

// server/src/routes/admin.ts
var paging = z9.object({
  limit: z9.coerce.number().int().min(1).max(100).default(50),
  offset: z9.coerce.number().int().min(0).max(1e6).default(0)
});
var userQuery = paging.extend({ query: z9.string().trim().max(80).default("") });
var auditQuery = paging.extend({ action: z9.string().regex(/^[a-z_.]{1,60}$/).optional() });
var id = z9.string().uuid();
var adminView = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  emailVerified: !!u.emailVerifiedAt,
  disabled: !!u.disabledAt,
  createdAt: u.createdAt
});
function adminRoutes(store) {
  const r = Router9();
  r.use(requireAuth, requireRole(store, "admin"));
  r.get("/stats", async (_req, res) => {
    res.json(await store.stats());
  });
  r.get("/users", async (req, res) => {
    const q = userQuery.parse(req.query);
    const { users, total } = await store.listUsers({ query: q.query, limit: q.limit, offset: q.offset });
    await audit(store, { actorId: req.session.sub, action: "admin.list_users", meta: { count: users.length, searched: q.query.length > 0 } });
    res.json({ users: users.map(adminView), total });
  });
  const setDisabled = (disable) => async (req, res) => {
    const targetId = id.safeParse(req.params.id);
    if (!targetId.success) throw new HttpError(404, "User not found");
    const actorId = req.session.sub;
    const target = await store.findUserById(targetId.data);
    if (!target) throw new HttpError(404, "User not found");
    if (disable && target.id === actorId) throw new HttpError(400, "You cannot disable your own account");
    if (disable && target.role === "admin") throw new HttpError(403, "Administrator accounts cannot be disabled here");
    const already = !!target.disabledAt === disable;
    if (!already) {
      await store.saveUser({ ...target, disabledAt: disable ? (/* @__PURE__ */ new Date()).toISOString() : null });
      invalidateSessionCache(target.id);
      await audit(store, { actorId, action: disable ? "admin.user_disabled" : "admin.user_enabled", targetId: target.id });
    }
    res.json({ user: adminView({ ...target, disabledAt: disable ? target.disabledAt ?? (/* @__PURE__ */ new Date()).toISOString() : null }) });
  };
  r.post("/users/:id/disable", setDisabled(true));
  r.post("/users/:id/enable", setDisabled(false));
  r.get("/audit", async (req, res) => {
    const q = auditQuery.parse(req.query);
    const entries = await store.listAudit({ limit: q.limit, offset: q.offset, action: q.action });
    const ids = [...new Set(entries.flatMap((e) => [e.actorId, e.targetId]).filter((x) => !!x))];
    const known = new Map((await store.findUsersByIds(ids)).map((u) => [u.id, u.email]));
    const who = (uid) => uid === null ? null : known.get(uid) ?? "(deleted account)";
    res.json({
      entries: entries.map((e) => ({ id: e.id, at: e.at, action: e.action, actor: who(e.actorId), target: who(e.targetId), meta: e.meta }))
    });
  });
  return r;
}

// server/src/routes/cron.ts
import { timingSafeEqual } from "node:crypto";
import { Router as Router10 } from "express";

// server/src/services/retention.ts
var RETENTION_CHOICES = [30, 60, 90, 180, 365];
var DAY_MS = 864e5;
var isoDay = (d) => d.toISOString().slice(0, 10);
var dayNumber = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;
var validDay = (s2) => typeof s2 === "string" && /^\d{4}-\d{2}-\d{2}/.test(s2);
async function runRetention(store, blobs, now = /* @__PURE__ */ new Date()) {
  const report = { users: 0, documentsDeleted: 0, failures: 0 };
  const today = dayNumber(isoDay(now));
  for (const profile of await store.listRetentionProfiles()) {
    const days = profile.retentionDays;
    if (typeof days !== "number" || days < 1) continue;
    const userId = profile.userId;
    const docs = await store.listDocuments(userId);
    if (docs.length === 0) continue;
    const anchors = /* @__PURE__ */ new Map();
    for (const a of await store.listApplications(userId)) {
      let day = a.updatedAt.slice(0, 10);
      try {
        const data = decryptJson(a.dataEnc);
        const dep = data.travel?.departureDate;
        if (validDay(dep)) day = dep.slice(0, 10);
      } catch {
      }
      anchors.set(a.id, day);
    }
    for (const b of await store.listBookings(userId)) anchors.set(b.id, b.endDate ?? b.startDate);
    for (const ap of await store.listAppointments(userId)) anchors.set(ap.id, ap.startsAt.slice(0, 10));
    let deleted = 0;
    for (const doc of docs) {
      const anchor = anchors.get(doc.applicationId) ?? doc.uploadedAt.slice(0, 10);
      if (!validDay(anchor) || today - dayNumber(anchor.slice(0, 10)) <= days) continue;
      try {
        await blobs.remove(userId, doc.id);
        await store.deleteDocument(userId, doc.id);
        deleted++;
      } catch {
        report.failures++;
      }
    }
    if (deleted > 0) {
      report.users++;
      report.documentsDeleted += deleted;
      await audit(store, { actorId: null, action: "retention.deleted_files", targetId: userId, meta: { documents: deleted, afterDays: days } });
    }
  }
  if (blobs.direct) {
    try {
      const swept = await blobs.direct.sweep(24 * 60 * 60 * 1e3);
      if (swept > 0) report.pendingSwept = swept;
    } catch {
      report.failures++;
    }
  }
  return report;
}

// server/src/routes/cron.ts
var safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
function cronRoutes(store, blobs) {
  const r = Router10();
  r.get("/retention", async (req, res) => {
    const secret = env.cronSecret;
    if (!secret) throw new HttpError(404, "Not found");
    const given = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1] ?? "";
    if (!safeEqual(given, secret)) throw new HttpError(401, "Unauthorized");
    res.json(await runRetention(store, blobs));
  });
  return r;
}

// server/src/routes/uploads.ts
import { createHmac, randomUUID as randomUUID7 } from "node:crypto";
import { Router as Router11 } from "express";
import jwt2 from "jsonwebtoken";
import { z as z10 } from "zod";
var TICKET_AUDIENCE = "trippilot-upload";
var ticketKey = () => createHmac("sha256", env.jwtSecret).update("upload-ticket").digest("hex");
var initSchema = z10.object({
  kind: z10.enum(["visa", "booking", "appointment"]),
  ownerId: z10.string().uuid(),
  itemId: z10.string().max(60).default(""),
  filename: z10.string().max(200),
  size: z10.number().int().min(1)
});
var finalizeSchema = z10.object({ ticket: z10.string().min(20).max(4e3) });
function uploadRoutes(store, blobs) {
  const r = Router11();
  r.use(requireAuth);
  async function assertOwner(userId, kind, ownerId) {
    const found = kind === "visa" ? await store.getApplication(userId, ownerId) : kind === "booking" ? await store.getBooking(userId, ownerId) : await store.getAppointment(userId, ownerId);
    if (!found) throw new HttpError(404, "Not found");
  }
  r.post("/init", async (req, res) => {
    const userId = req.session.sub;
    const input2 = initSchema.parse(req.body);
    if (!blobs.direct) {
      res.json({ direct: false, maxBytes: env.maxUploadBytes });
      return;
    }
    if (input2.size > env.maxLargeUploadBytes) throw new HttpError(413, `Files can be at most ${Math.floor(env.maxLargeUploadBytes / 1024 / 1024)} MB.`);
    await assertOwner(userId, input2.kind, input2.ownerId);
    if ((await store.listDocuments(userId)).length >= 100) throw new HttpError(409, "Document limit reached");
    const doc = randomUUID7();
    const uploadUrl = await blobs.direct.createUrl(userId, doc);
    const claims = { sub: userId, doc, kind: input2.kind, ownerId: input2.ownerId, itemId: input2.kind === "visa" ? input2.itemId : input2.kind, filename: safeFilename(input2.filename) };
    const ticket2 = jwt2.sign(claims, ticketKey(), { algorithm: "HS256", audience: TICKET_AUDIENCE, expiresIn: "15m" });
    res.json({ direct: true, documentId: doc, uploadUrl, ticket: ticket2, maxBytes: env.maxLargeUploadBytes });
  });
  r.post("/finalize", async (req, res) => {
    const userId = req.session.sub;
    const { ticket: ticket2 } = finalizeSchema.parse(req.body);
    let claims;
    try {
      claims = jwt2.verify(ticket2, ticketKey(), { algorithms: ["HS256"], audience: TICKET_AUDIENCE });
    } catch {
      throw new HttpError(400, "This upload expired. Please start it again.");
    }
    if (claims.sub !== userId) throw new HttpError(403, "Forbidden");
    if (!blobs.direct) throw new HttpError(400, "Direct uploads are not available");
    const existing = await store.getDocument(userId, claims.doc);
    if (existing) {
      res.json({ document: existing });
      return;
    }
    await assertOwner(userId, claims.kind, claims.ownerId);
    let bytes;
    try {
      bytes = await blobs.direct.readPending(userId, claims.doc, env.maxLargeUploadBytes);
    } catch (e) {
      if (e instanceof UploadTooLarge) {
        await blobs.direct.discard(userId, claims.doc);
        throw new HttpError(413, `Files can be at most ${Math.floor(env.maxLargeUploadBytes / 1024 / 1024)} MB.`);
      }
      throw e;
    }
    if (!bytes || bytes.length === 0) throw new HttpError(400, "The file was not received. Please try uploading again.");
    try {
      const mime = sniffMime(bytes);
      if (!mime) throw new HttpError(415, "Only PDF, PNG and JPEG files are accepted");
      await guardUpload(store, userId, bytes, mime);
      await blobs.direct.commit(userId, claims.doc);
      const doc = {
        id: claims.doc,
        userId,
        applicationId: claims.ownerId,
        itemId: claims.itemId,
        filename: claims.filename,
        mime,
        size: bytes.length,
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await store.saveDocument(doc);
      res.status(201).json({ document: doc });
    } catch (e) {
      if (!await store.getDocument(userId, claims.doc)) await blobs.direct.discard(userId, claims.doc).catch(() => void 0);
      throw e;
    }
  });
  return r;
}

// server/src/routes/resources.ts
import { randomUUID as randomUUID8 } from "node:crypto";
import { Router as Router12 } from "express";

// server/src/services/retention-schema.ts
import { z as z11 } from "zod";
var retentionSchema = z11.object({
  days: z11.union([z11.null(), z11.number().int().refine((n) => RETENTION_CHOICES.includes(n), "Choose one of the offered periods")])
});

// server/src/routes/resources.ts
function profileRoutes(store) {
  const r = Router12();
  r.use(requireAuth);
  r.put("/", async (req, res) => {
    const input2 = profileSchema.parse(req.body);
    const existing = await store.getProfile(req.session.sub);
    const profile = { ...input2, userId: req.session.sub, onboardedAt: existing?.onboardedAt ?? (/* @__PURE__ */ new Date()).toISOString(), retentionDays: existing?.retentionDays ?? null };
    await store.saveProfile(profile);
    res.json({ profile });
  });
  r.patch("/retention", async (req, res) => {
    const { days } = retentionSchema.parse(req.body);
    const existing = await store.getProfile(req.session.sub);
    if (!existing) throw new HttpError(404, "Profile not found");
    const profile = { ...existing, retentionDays: days };
    await store.saveProfile(profile);
    await audit(store, { actorId: req.session.sub, action: "profile.retention_changed", targetId: req.session.sub, meta: { days: days ?? 0 } });
    res.json({ profile });
  });
  return r;
}
function tripRoutes(store) {
  const r = Router12();
  r.use(requireAuth);
  r.get("/", async (req, res) => {
    res.json({ trips: await store.listTrips(req.session.sub) });
  });
  r.post("/", async (req, res) => {
    const input2 = tripSchema.parse(req.body);
    const trip = {
      id: randomUUID8(),
      userId: req.session.sub,
      ...input2,
      status: "planning",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await store.saveTrip(trip);
    res.status(201).json({ trip });
  });
  r.patch("/:id", async (req, res) => {
    const trip = await store.getTrip(req.session.sub, String(req.params.id));
    if (!trip) throw new HttpError(404, "Trip not found");
    const patch = tripUpdateSchema.parse(req.body);
    const updated = { ...trip, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== void 0)) };
    if (updated.returnOn < updated.departOn) throw new HttpError(400, "Return date must be on or after departure");
    await store.saveTrip(updated);
    res.json({ trip: updated });
  });
  r.delete("/:id", async (req, res) => {
    const ok2 = await store.deleteTrip(req.session.sub, String(req.params.id));
    if (!ok2) throw new HttpError(404, "Trip not found");
    res.status(204).end();
  });
  return r;
}
function accountRoutes(store, blobs) {
  const r = Router12();
  r.use(requireAuth);
  r.patch("/name", async (req, res) => {
    const input2 = accountNameSchema.parse(req.body);
    const user = await store.findUserById(req.session.sub);
    if (!user) throw new HttpError(404, "Account not found");
    const updated = { ...user, name: input2.name };
    await store.saveUser(updated);
    res.json({ user: toPublicUser(updated) });
  });
  r.post("/password", authLimiter, async (req, res) => {
    const input2 = passwordChangeSchema.parse(req.body);
    const user = await store.findUserById(req.session.sub);
    if (!user) throw new HttpError(404, "Account not found");
    if (!await checkPassword(user, input2.currentPassword)) throw new HttpError(401, "Current password is incorrect");
    const problem = passwordProblem(input2.newPassword, user.email);
    if (problem) throw new HttpError(400, problem);
    await store.saveUser({ ...user, passwordHash: await hashPassword(input2.newPassword) });
    await audit(store, { actorId: user.id, action: "auth.password_changed", targetId: user.id });
    res.status(204).end();
  });
  r.get("/export", async (req, res) => {
    const id2 = req.session.sub;
    const user = await store.findUserById(id2);
    if (!user) throw new HttpError(404, "Account not found");
    const { passwordHash: _p, verifyToken: _v, ...safe } = user;
    res.setHeader("Content-Disposition", 'attachment; filename="trippilot-export.json"');
    res.json({
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      user: safe,
      profile: await store.getProfile(id2),
      trips: await store.listTrips(id2),
      visaApplications: (await store.listApplications(id2)).map(({ dataEnc, ...a }) => ({
        ...a,
        data: decryptJson(dataEnc)
      })),
      bookings: await store.listBookings(id2),
      appointments: await store.listAppointments(id2),
      expenses: await store.listExpenses(id2),
      documents: await store.listDocuments(id2)
      // metadata only; files are downloadable separately
    });
  });
  r.delete("/", async (req, res) => {
    const id2 = req.session.sub;
    await audit(store, { actorId: id2, action: "account.deleted", targetId: id2 });
    await store.deleteUserData(id2);
    await blobs.removeAll(id2);
    invalidateSessionCache(id2);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });
  return r;
}

// server/src/integrations/commerce.ts
import { z as z12 } from "zod";
var travellerSchema = z12.object({
  title: z12.enum(["mr", "ms", "mrs", "miss", "mx"]),
  gender: z12.enum(["m", "f"]),
  givenName: z12.string().trim().min(1).max(60),
  familyName: z12.string().trim().min(1).max(60),
  bornOn: z12.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  passport: z12.object({
    number: z12.string().trim().min(4).max(20),
    issuingCountry: z12.string().regex(/^[A-Z]{2}$/),
    expiresOn: z12.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }).optional()
});
var contactSchema = z12.object({
  email: z12.string().trim().toLowerCase().email().max(200),
  // E.164, the format every provider accepts.
  phone: z12.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +33123456789")
});
var commerce = { gateways: {} };
function requireCommerce(kind) {
  const p = commerce[kind === "flight" ? "flights" : kind === "hotel" ? "hotels" : "insurance"];
  if (!p) throw new HttpError(501, `Booking ${kind === "insurance" ? "insurance" : kind === "flight" ? "flights" : "hotels"} is not available: no provider is configured.`);
  return p;
}
var availableGateways = () => Object.keys(commerce.gateways).filter((g) => !!commerce.gateways[g]);
function requireGateway(name) {
  const g = commerce.gateways[name];
  if (!g) throw new HttpError(501, "This payment method is not available.");
  return g;
}
function defaultGateway(residenceCountry) {
  const pk = /^(pakistan|pk)$/i.test((residenceCountry ?? "").trim());
  const want = pk ? "safepay" : "stripe";
  const have = availableGateways();
  if (have.includes(want)) return want;
  const other = have[0];
  if (!other) throw new HttpError(501, "Payments are not available: no payment provider is configured.");
  return other;
}
var ZERO_DECIMAL = /* @__PURE__ */ new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
var THREE_DECIMAL = /* @__PURE__ */ new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);
var exponent = (currency) => ZERO_DECIMAL.has(currency) ? 0 : THREE_DECIMAL.has(currency) ? 3 : 2;
function toMinor(amount, currency) {
  const cur = currency.toUpperCase();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) throw new HttpError(502, "The provider returned an invalid price");
  const e = exponent(cur);
  const frac = (m[2] ?? "").padEnd(e, "0").slice(0, e);
  const minor = Number(m[1]) * 10 ** e + (frac ? Number(frac) : 0);
  if (!Number.isSafeInteger(minor)) throw new HttpError(502, "The provider returned an invalid price");
  return minor;
}
function fromMinor(minor, currency) {
  const e = exponent(currency.toUpperCase());
  if (e === 0) return String(minor);
  const s2 = String(minor).padStart(e + 1, "0");
  return `${s2.slice(0, -e)}.${s2.slice(-e)}`;
}
var feeFor = (providerMinor, percent = env.serviceFeePercent) => Math.ceil(providerMinor * percent / 100);
function toPublic(o) {
  const { providerMinor, providerData: _omit, ...rest } = o;
  const feeMinor = feeFor(providerMinor);
  return { ...rest, totalMinor: providerMinor + feeMinor, feeMinor };
}

// server/src/integrations/duffel.ts
import { z as z13 } from "zod";
var API = "https://api.duffel.com";
async function duffel(token, method, path, body, timeoutMs = 3e4) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Duffel-Version": "v2",
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        ...body ? { "Content-Type": "application/json" } : {}
      },
      body: body ? JSON.stringify({ data: body }) : void 0,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new HttpError(502, "The booking provider did not respond");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code = json?.errors?.[0]?.code;
    console.error("Duffel error:", res.status, code ?? "unknown", json?.errors?.[0]?.message ?? "");
    if (code === "offer_no_longer_available" || res.status === 404) throw new HttpError(409, "This offer is no longer available. Please search again.");
    throw new HttpError(502, "The booking provider rejected the request");
  }
  return json?.data;
}
var segment = z13.object({
  origin: z13.object({ iata_code: z13.string() }),
  destination: z13.object({ iata_code: z13.string() }),
  departing_at: z13.string(),
  arriving_at: z13.string()
});
var duffelOffer = z13.object({
  id: z13.string(),
  total_amount: z13.string(),
  total_currency: z13.string(),
  expires_at: z13.string().nullable().optional(),
  owner: z13.object({ name: z13.string() }),
  passengers: z13.array(z13.object({ id: z13.string(), type: z13.string().nullable().optional() })),
  slices: z13.array(z13.object({ duration: z13.string().nullable().optional(), segments: z13.array(segment).min(1) })).min(1),
  conditions: z13.object({
    refund_before_departure: z13.object({ allowed: z13.boolean() }).nullable().optional(),
    change_before_departure: z13.object({ allowed: z13.boolean() }).nullable().optional()
  }).nullable().optional()
});
function mapFlightOffer(raw) {
  const parsed = duffelOffer.safeParse(raw);
  if (!parsed.success) throw new HttpError(502, "Unexpected response from the booking provider");
  const o = parsed.data;
  const first = o.slices[0];
  const last = o.slices[o.slices.length - 1];
  const out = first.segments[0];
  const outEnd = first.segments[first.segments.length - 1];
  const roundTrip = o.slices.length > 1;
  return {
    id: o.id,
    kind: "flight",
    provider: "duffel",
    title: `${o.owner.name}: ${out.origin.iata_code} \u2192 ${outEnd.destination.iata_code}${roundTrip ? " (return)" : ""}`,
    subtitle: `${o.passengers.length} traveller${o.passengers.length > 1 ? "s" : ""}`,
    startDate: out.departing_at.slice(0, 10),
    endDate: roundTrip ? last.segments[0].departing_at.slice(0, 10) : null,
    providerMinor: toMinor(o.total_amount, o.total_currency),
    currency: o.total_currency.toUpperCase(),
    travellers: o.passengers.length,
    expiresAt: o.expires_at ?? null,
    details: {
      airline: o.owner.name,
      departs: out.departing_at.slice(0, 16),
      arrives: outEnd.arriving_at.slice(0, 16),
      stops: first.segments.length - 1,
      duration: first.duration ?? "",
      ...roundTrip ? { returnDeparts: last.segments[0].departing_at.slice(0, 16), returnStops: last.segments.length - 1 } : {},
      refundable: o.conditions?.refund_before_departure?.allowed ?? "unknown",
      changeable: o.conditions?.change_before_departure?.allowed ?? "unknown"
    },
    providerData: {}
  };
}
var CABIN = { economy: "economy", premium: "premium_economy", business: "business", first: "first" };
var TITLES = { mr: "mr", ms: "ms", mrs: "mrs", miss: "miss", mx: "mx" };
function duffelFlights(token) {
  return {
    name: "duffel",
    async search(raw) {
      const q = flightQuery.parse(raw);
      const slices = [{ origin: q.origin, destination: q.destination, departure_date: q.departDate }];
      if (q.returnDate) slices.push({ origin: q.destination, destination: q.origin, departure_date: q.returnDate });
      const passengers = [
        ...Array.from({ length: q.adults }, () => ({ type: "adult" })),
        ...Array.from({ length: q.children }, () => ({ type: "child" }))
      ];
      const r = await duffel(token, "POST", "/air/offer_requests?return_offers=true&supplier_timeout=15000", {
        slices,
        passengers,
        cabin_class: CABIN[q.cabin]
      });
      const offers = [];
      for (const o of r.offers ?? []) {
        try {
          offers.push(mapFlightOffer(o));
        } catch {
        }
      }
      return offers.sort((a, b) => a.providerMinor - b.providerMinor).slice(0, 40);
    },
    async quote(offerId) {
      return mapFlightOffer(await duffel(token, "GET", `/air/offers/${encodeURIComponent(offerId)}`));
    },
    async fulfil(offer, customer) {
      const fresh = duffelOffer.parse(await duffel(token, "GET", `/air/offers/${encodeURIComponent(offer.id)}`));
      if (fresh.passengers.length !== customer.travellers.length) throw new HttpError(400, "Traveller count does not match the offer");
      if (toMinor(fresh.total_amount, fresh.total_currency) !== offer.providerMinor) throw new HttpError(409, "The fare changed before ticketing");
      const order = await duffel(
        token,
        "POST",
        "/air/orders",
        {
          type: "instant",
          selected_offers: [offer.id],
          payments: [{ type: "balance", currency: fresh.total_currency, amount: fromMinor(offer.providerMinor, fresh.total_currency) }],
          passengers: customer.travellers.map((t, i) => ({
            id: fresh.passengers[i].id,
            title: TITLES[t.title],
            gender: t.gender,
            given_name: t.givenName,
            family_name: t.familyName,
            born_on: t.bornOn,
            email: customer.contact.email,
            phone_number: customer.contact.phone,
            ...t.passport ? { identity_documents: [{ type: "passport", unique_identifier: t.passport.number, issuing_country_code: t.passport.issuingCountry, expires_on: t.passport.expiresOn }] } : {}
          }))
        },
        6e4
      );
      if (!order.id || !order.booking_reference) throw new HttpError(502, "The booking provider did not return a booking reference");
      const tickets = (order.documents ?? []).filter((d) => d.type === "electronic_ticket" && d.unique_identifier).map((d) => d.unique_identifier);
      return { providerOrderId: order.id, reference: order.booking_reference, tickets };
    }
  };
}
var hotelQuery = z13.object({
  lat: z13.number().min(-90).max(90),
  lon: z13.number().min(-180).max(180),
  checkIn: z13.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z13.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z13.number().int().min(1).max(6),
  rooms: z13.number().int().min(1).max(3).default(1),
  radiusKm: z13.number().int().min(1).max(25).default(5)
});
var stayResult = z13.object({
  id: z13.string(),
  check_in_date: z13.string(),
  check_out_date: z13.string(),
  cheapest_rate_total_amount: z13.string().nullable().optional(),
  cheapest_rate_currency: z13.string().nullable().optional(),
  accommodation: z13.object({
    name: z13.string(),
    rating: z13.number().nullable().optional(),
    location: z13.object({ address: z13.object({ line_one: z13.string().optional(), city_name: z13.string().optional(), country_code: z13.string().optional() }).optional() }).optional()
  })
});
function mapStayResult(raw, adults) {
  const p = stayResult.safeParse(raw);
  if (!p.success || !p.data.cheapest_rate_total_amount || !p.data.cheapest_rate_currency) return null;
  const r = p.data;
  const a = r.accommodation.location?.address;
  return {
    id: r.id,
    kind: "hotel",
    provider: "duffel",
    title: r.accommodation.name,
    subtitle: [a?.line_one, a?.city_name, a?.country_code].filter(Boolean).join(", "),
    startDate: r.check_in_date,
    endDate: r.check_out_date,
    providerMinor: toMinor(r.cheapest_rate_total_amount, r.cheapest_rate_currency),
    currency: r.cheapest_rate_currency.toUpperCase(),
    travellers: adults,
    expiresAt: null,
    details: { stars: r.accommodation.rating ?? "unrated", checkIn: r.check_in_date, checkOut: r.check_out_date },
    providerData: {}
  };
}
function duffelStays(token) {
  async function quoteFor(searchResultId) {
    const rates = await duffel(
      token,
      "POST",
      `/stays/search_results/${encodeURIComponent(searchResultId)}/actions/fetch_all_rates`,
      void 0
    );
    const all = (rates.accommodation?.rooms ?? []).flatMap((r) => r.rates ?? []);
    const cheapest = all.sort((a, b) => toMinor(a.total_amount, a.total_currency) - toMinor(b.total_amount, b.total_currency))[0];
    if (!cheapest) throw new HttpError(409, "No rooms are available for these dates any more");
    const quote = await duffel(
      token,
      "POST",
      "/stays/quotes",
      { rate_id: cheapest.id }
    );
    return quote;
  }
  return {
    name: "duffel-stays",
    async search(raw) {
      const q = hotelQuery.parse(raw);
      if (q.checkOut <= q.checkIn) throw new HttpError(400, "Check-out must be after check-in");
      const r = await duffel(token, "POST", "/stays/search", {
        rooms: q.rooms,
        location: { radius: q.radiusKm, geographic_coordinates: { latitude: q.lat, longitude: q.lon } },
        check_in_date: q.checkIn,
        check_out_date: q.checkOut,
        guests: Array.from({ length: q.adults }, () => ({ type: "adult" }))
      });
      return (r.results ?? []).map((x) => mapStayResult(x, q.adults)).filter((o) => !!o).sort((a, b) => a.providerMinor - b.providerMinor).slice(0, 40);
    },
    async quote(offerId) {
      const q = await quoteFor(offerId);
      return {
        id: offerId,
        kind: "hotel",
        provider: "duffel",
        title: q.accommodation.name,
        subtitle: "",
        startDate: q.check_in_date,
        endDate: q.check_out_date,
        providerMinor: toMinor(q.total_amount, q.total_currency),
        currency: q.total_currency.toUpperCase(),
        travellers: 1,
        expiresAt: null,
        details: {},
        providerData: { quoteId: q.id }
      };
    },
    async fulfil(offer, customer) {
      const quoteId = offer.providerData.quoteId;
      if (!quoteId) throw new HttpError(400, "Missing quote");
      const b = await duffel(token, "POST", "/stays/bookings", {
        quote_id: quoteId,
        email: customer.contact.email,
        phone_number: customer.contact.phone,
        guests: customer.travellers.map((t) => ({ given_name: t.givenName, family_name: t.familyName }))
      }, 6e4);
      if (!b.id || !b.reference) throw new HttpError(502, "The booking provider did not return a booking reference");
      return { providerOrderId: b.id, reference: b.reference, tickets: [] };
    }
  };
}

// server/src/integrations/hellosafe.ts
import { createHmac as createHmac2 } from "node:crypto";
import { z as z14 } from "zod";
var BASE = "https://atlas.hellosafe.com";
function atlasSignature(secret, ts, method, path, rawBody) {
  return "v2=" + createHmac2("sha256", secret).update(`${ts}.${method}.${path}.${rawBody}`).digest("hex");
}
var quoteResponse = z14.object({
  mode: z14.enum(["sandbox", "live"]),
  sessionId: z14.string(),
  offers: z14.array(z14.object({
    id: z14.number(),
    name: z14.string(),
    plan: z14.string().nullish(),
    insurer: z14.object({ name: z14.string() }),
    price: z14.object({ amount: z14.number(), amountInCents: z14.number().optional(), currency: z14.string(), isStartingPrice: z14.boolean().optional() }),
    highlights: z14.object({ included: z14.array(z14.string()).optional(), excluded: z14.array(z14.string()).optional() }).partial().optional(),
    documents: z14.object({ cgvUrl: z14.string().nullish(), ipidUrl: z14.string().nullish() }).partial().optional()
  }).passthrough())
}).passthrough();
var linkResponse = z14.object({ url: z14.string().url() }).passthrough();
var ageOn = (bornOn, on) => {
  const b = new Date(bornOn), d = new Date(on);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate()) age--;
  return Math.min(Math.max(age, 0), 120);
};
function tripBody(t) {
  return {
    intent: "forTourism",
    startDate: t.startDate,
    endDate: t.endDate,
    countryResidence: t.residence,
    arrivalCountries: [t.destination],
    travellers: t.travellers.map((x) => ({ age: ageOn(x.bornOn, t.startDate) }))
  };
}
function hellosafeInsurance(keyId, secret, fetchFn = fetch) {
  async function call2(path, body) {
    const raw = JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1e3).toString();
    let res;
    try {
      res = await fetchFn(BASE + path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-atlas-key-id": keyId, "x-atlas-timestamp": ts, "x-atlas-signature": atlasSignature(secret, ts, "POST", path, raw) },
        body: raw,
        signal: AbortSignal.timeout(2e4)
      });
    } catch {
      throw new HttpError(502, "The insurance provider could not be reached. Try again shortly.");
    }
    if (res.status === 429) throw new HttpError(429, "Too many insurance searches. Try again in a minute.");
    if (res.status === 400) throw new HttpError(400, "The insurance provider rejected these trip details. Check destination and dates.");
    if (!res.ok) throw new HttpError(502, "The insurance provider returned an error. Try again shortly.");
    return res.json();
  }
  return {
    name: "HelloSafe",
    async quotes(trip) {
      const parsed = quoteResponse.safeParse(await call2("/api/v1/travel/quotes", { trip: tripBody(trip), language: "en" }));
      if (!parsed.success) throw new HttpError(502, "Unexpected answer from the insurance provider");
      const offers = parsed.data.offers.map((o) => ({
        id: o.id,
        name: o.name,
        plan: o.plan ?? "",
        insurer: o.insurer.name,
        amountMinor: o.price.amountInCents ?? Math.round(o.price.amount * 100),
        currency: o.price.currency,
        startingPrice: !!o.price.isStartingPrice,
        included: (o.highlights?.included ?? []).slice(0, 6),
        excluded: (o.highlights?.excluded ?? []).slice(0, 4),
        termsUrl: o.documents?.cgvUrl ?? null,
        summaryUrl: o.documents?.ipidUrl ?? null
      }));
      return { mode: parsed.data.mode, sessionId: parsed.data.sessionId, offers };
    },
    async link(trip, sessionId, offerId) {
      const parsed = linkResponse.safeParse(await call2("/api/v1/travel/links", { sessionId, trip: tripBody(trip), offerId, language: "en" }));
      if (!parsed.success) throw new HttpError(502, "Unexpected answer from the insurance provider");
      const url = new URL(parsed.data.url);
      if (url.protocol !== "https:" || !/(^|\.)hellosafe\.com$/.test(url.hostname)) throw new HttpError(502, "The insurance provider returned an unexpected link");
      return url.toString();
    }
  };
}

// server/src/integrations/stripe.ts
import { createHmac as createHmac3, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
var API2 = "https://api.stripe.com/v1";
async function call(key2, method, path, body, idempotencyKey) {
  let res;
  try {
    res = await fetch(`${API2}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key2}`,
        ...body ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
        ...idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}
      },
      body,
      signal: AbortSignal.timeout(15e3)
    });
  } catch {
    throw new HttpError(502, "The payment provider did not respond");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("Stripe error:", res.status, json?.error?.message ?? "unknown");
    throw new HttpError(502, "The payment provider rejected the request");
  }
  return json;
}
function stripeGateway(secretKey, webhookSecret) {
  return {
    name: "stripe",
    mode: secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_") ? "live" : "test",
    async createCheckout(i) {
      const p = new URLSearchParams({
        mode: "payment",
        client_reference_id: i.orderId,
        customer_email: i.customerEmail,
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": i.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(i.amountMinor),
        "line_items[0][price_data][product_data][name]": i.title.slice(0, 200),
        "metadata[orderId]": i.orderId,
        "payment_intent_data[metadata][orderId]": i.orderId
      });
      const s2 = await call(secretKey, "POST", "/checkout/sessions", p, `checkout-${i.orderId}`);
      if (!s2.url) throw new HttpError(502, "The payment provider did not return a payment page");
      return { sessionId: s2.id, url: s2.url };
    },
    async refund(paymentIntentId, idempotencyKey) {
      await call(secretKey, "POST", "/refunds", new URLSearchParams({ payment_intent: paymentIntentId }), idempotencyKey);
    },
    verifyWebhook(rawBody, headers) {
      if (!webhookSecret) throw new HttpError(501, "Payments are not configured");
      const event = verifyStripeWebhook(rawBody, headers["stripe-signature"], webhookSecret);
      const obj = event.data.object;
      const orderId = obj.metadata?.orderId;
      if (!orderId) return null;
      if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && obj.payment_status === "paid") {
        return {
          type: "paid",
          orderId,
          paymentRef: typeof obj.payment_intent === "string" ? obj.payment_intent : null,
          amountMinor: obj.amount_total ?? -1,
          currency: (obj.currency ?? "").toUpperCase()
        };
      }
      if (event.type === "checkout.session.expired") return { type: "expired", orderId };
      return null;
    }
  };
}
function verifyStripeWebhook(rawBody, header, secret, toleranceSec = 300, nowMs = Date.now()) {
  const parts = Object.fromEntries((header ?? "").split(",").map((kv) => kv.trim().split("=")));
  const t = Number(parts.t);
  const signatures = (header ?? "").split(",").map((kv) => kv.trim()).filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  if (!Number.isFinite(t) || signatures.length === 0) throw new HttpError(400, "Invalid signature");
  if (Math.abs(nowMs / 1e3 - t) > toleranceSec) throw new HttpError(400, "Signature timestamp outside tolerance");
  const expected = createHmac3("sha256", secret).update(`${t}.`).update(rawBody).digest();
  const ok2 = signatures.some((sig) => {
    const got = Buffer.from(sig, "hex");
    return got.length === expected.length && timingSafeEqual2(got, expected);
  });
  if (!ok2) throw new HttpError(400, "Invalid signature");
  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new HttpError(400, "Malformed event");
  }
}

// server/src/integrations/safepay.ts
import { createHmac as createHmac4, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
import { z as z15 } from "zod";
var BASE2 = { sandbox: "https://sandbox.api.getsafepay.com", production: "https://api.getsafepay.com" };
var trackerResponse = z15.object({ data: z15.object({ token: z15.string().min(1) }) });
var notification = z15.object({
  data: z15.object({
    notification: z15.object({
      state: z15.string(),
      amount: z15.union([z15.number(), z15.string()]),
      currency: z15.string(),
      token: z15.string().optional(),
      metadata: z15.object({ order_id: z15.string() }).partial().optional()
    })
  })
});
function safepaySignature(rawBody, secret) {
  return createHmac4("sha512", secret).update(rawBody).digest("hex");
}
function safepayGateway(cfg) {
  const base3 = BASE2[cfg.env];
  return {
    name: "safepay",
    mode: cfg.env === "production" ? "live" : "test",
    async createCheckout(i) {
      let res;
      try {
        res = await fetch(`${base3}/order/v1/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...cfg.secretKey ? { "X-SFPY-MERCHANT-SECRET": cfg.secretKey } : {} },
          body: JSON.stringify({
            client: cfg.apiKey,
            environment: cfg.env,
            amount: Number(fromMinor(i.amountMinor, i.currency)),
            currency: i.currency.toUpperCase(),
            intent: "CYBERSOURCE",
            mode: "payment",
            order_id: i.orderId,
            metadata: { order_id: i.orderId }
          }),
          signal: AbortSignal.timeout(15e3)
        });
      } catch {
        throw new HttpError(502, "The payment provider did not respond");
      }
      const parsed = trackerResponse.safeParse(await res.json().catch(() => null));
      if (!res.ok || !parsed.success) {
        console.error("Safepay init failed:", res.status);
        throw new HttpError(502, "The payment provider rejected the request");
      }
      const token = parsed.data.data.token;
      const url = new URL(`${base3}/components`);
      url.search = new URLSearchParams({
        env: cfg.env,
        beacon: token,
        order_id: i.orderId,
        source: "custom",
        redirect_url: i.successUrl,
        cancel_url: i.cancelUrl
      }).toString();
      return { sessionId: token, url: url.toString() };
    },
    async refund() {
      throw new HttpError(501, "Safepay refunds are done in the Safepay dashboard");
    },
    verifyWebhook(rawBody, headers) {
      if (!cfg.webhookSecret) throw new HttpError(501, "Payments are not configured");
      const got = Buffer.from(headers["x-sfpy-signature"] ?? "", "hex");
      const want = Buffer.from(safepaySignature(rawBody, cfg.webhookSecret), "hex");
      if (got.length !== want.length || !timingSafeEqual3(got, want)) throw new HttpError(400, "Invalid signature");
      let json;
      try {
        json = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new HttpError(400, "Malformed event");
      }
      const p = notification.safeParse(json);
      if (!p.success) {
        console.error("Safepay webhook not understood; problem fields:", p.error.issues.map((x) => x.path.join(".")).join(", "));
        return null;
      }
      const n = p.data.data.notification;
      const orderId = n.metadata?.order_id;
      if (!orderId || n.state.toUpperCase() !== "PAID") return null;
      return { type: "paid", orderId, paymentRef: n.token ?? null, amountMinor: toMinor(String(n.amount), n.currency.toUpperCase()), currency: n.currency.toUpperCase() };
    }
  };
}

// server/src/routes/commerce.ts
import { randomUUID as randomUUID10 } from "node:crypto";
import express4, { Router as Router13 } from "express";
import { z as z16 } from "zod";

// server/src/services/fulfilment.ts
import { randomUUID as randomUUID9 } from "node:crypto";
var save = (store, o, patch) => store.saveOrder(Object.assign(o, patch, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() }));
async function refundOrder(store, payments, order, note) {
  if (!order.paymentRef) {
    await save(store, order, { status: "needs_attention", note: `${note} No payment reference to refund.` });
    await audit(store, { actorId: order.userId, action: "order.needs_attention", targetId: order.id, meta: { reason: "no-payment-intent" } });
    return;
  }
  try {
    await payments.refund(order.paymentRef, `refund-${order.id}`);
    await save(store, order, { status: "refunded", note });
    await audit(store, { actorId: order.userId, action: "order.refunded", targetId: order.id, meta: { kind: order.kind } });
  } catch {
    await save(store, order, { status: "needs_attention", note: `${note} The automatic refund failed: refund it manually in Stripe.` });
    await audit(store, { actorId: order.userId, action: "order.needs_attention", targetId: order.id, meta: { reason: "refund-failed" } });
  }
}
async function handlePaid(store, payments, orderId, paid) {
  const order = await store.getOrderById(orderId);
  if (!order) return;
  if (order.status === "expired") {
    await save(store, order, { paymentRef: paid.paymentRef });
    await refundOrder(store, payments, order, "The payment arrived after the checkout expired.");
    return;
  }
  if (paid.amountMinor !== order.amountMinor || paid.currency.toUpperCase() !== order.currency) {
    if (await store.claimOrder(order.id, "awaiting_payment", "needs_attention")) {
      const o = await store.getOrderById(order.id);
      await save(store, o, { paymentRef: paid.paymentRef, note: "The amount paid did not match the order." });
      await audit(store, { actorId: order.userId, action: "order.needs_attention", targetId: order.id, meta: { reason: "amount-mismatch" } });
    }
    return;
  }
  if (!await store.claimOrder(order.id, "awaiting_payment", "fulfilling")) return;
  const claimed = await store.getOrderById(order.id);
  await save(store, claimed, { paymentRef: paid.paymentRef });
  let result;
  try {
    const snap = decryptJson(claimed.dataEnc);
    result = await requireCommerce(claimed.kind).fulfil(snap.offer, snap.customer);
    if (!result.reference || !result.providerOrderId) throw new Error("provider returned no reference");
  } catch (e) {
    console.error("Fulfilment failed for order", claimed.id, e instanceof Error ? e.message : "unknown");
    await refundOrder(store, payments, claimed, "The provider could not complete the booking, so your payment was refunded.");
    return;
  }
  try {
    const booking = {
      id: randomUUID9(),
      userId: claimed.userId,
      kind: claimed.kind,
      status: "confirmed",
      source: "provider",
      title: claimed.title,
      startDate: claimed.startDate,
      endDate: claimed.endDate,
      confirmationRef: result.reference,
      details: { orderId: claimed.id, provider: claimed.provider, ...result.tickets.length ? { tickets: result.tickets.join(", ").slice(0, 290) } : {} },
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await store.saveBooking(booking);
    await save(store, claimed, {
      status: "fulfilled",
      providerOrderId: result.providerOrderId,
      reference: result.reference,
      tickets: result.tickets,
      bookingId: booking.id,
      note: null
    });
    await audit(store, { actorId: claimed.userId, action: "order.fulfilled", targetId: claimed.id, meta: { kind: claimed.kind, provider: claimed.provider } });
  } catch (e) {
    console.error("Booked at provider but could not save order", claimed.id, "provider order", result.providerOrderId, e instanceof Error ? e.message : "unknown");
    await save(store, claimed, {
      status: "needs_attention",
      providerOrderId: result.providerOrderId,
      reference: result.reference,
      tickets: result.tickets,
      note: "Booked with the provider but saving the confirmation failed."
    }).catch(() => void 0);
  }
}
async function handleExpired(store, orderId) {
  await store.claimOrder(orderId, "awaiting_payment", "expired");
}

// server/src/routes/commerce.ts
var MAX_OPEN_ORDERS = 5;
var checkoutInput = z16.object({
  kind: z16.enum(["flight", "hotel", "insurance"]),
  offerId: z16.string().min(1).max(300),
  /** The total the customer saw. If the live price differs, nothing is charged and they are told the new price. */
  expectedTotalMinor: z16.number().int().positive(),
  /** Optional: which payment method to use. Defaults to Safepay for customers living in Pakistan, Stripe otherwise. */
  gateway: z16.enum(["stripe", "safepay"]).optional(),
  contact: contactSchema,
  travellers: z16.array(travellerSchema).min(1).max(9)
});
function publicOrder(o) {
  const { dataEnc: _d, paymentSessionId: _s, paymentRef: _p, userId: _u, ...rest } = o;
  return rest;
}
function commerceRoutes(store) {
  const r = Router13();
  r.use(requireAuth);
  r.get("/capabilities", async (req, res) => {
    const gateways = availableGateways();
    const profile = await store.getProfile(req.session.sub);
    res.json({
      flights: !!commerce.flights,
      hotels: !!commerce.hotels,
      insurance: !!commerce.insurance,
      insuranceQuotes: !!commerce.insuranceReferral,
      insuranceSandbox: !!env.atlasKeyId?.startsWith("ak_test_"),
      payments: gateways.length > 0,
      gateways,
      defaultGateway: gateways.length ? defaultGateway(profile?.residenceCountry) : null,
      modes: Object.fromEntries(gateways.map((g) => [g, commerce.gateways[g].mode])),
      serviceFeePercent: env.serviceFeePercent
    });
  });
  const search = (kind) => async (req, res) => {
    if (availableGateways().length === 0) requireGateway("stripe");
    const offers = await requireCommerce(kind).search(req.body);
    res.json({ offers: offers.map(toPublic) });
  };
  r.post("/flights/search", search("flight"));
  r.post("/hotels/search", search("hotel"));
  const insuranceTrip = z16.object({
    destination: z16.string().length(2).transform((s2) => s2.toUpperCase()),
    residence: z16.string().length(2).transform((s2) => s2.toUpperCase()),
    startDate: z16.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z16.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    travellers: z16.array(z16.object({ bornOn: z16.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).min(1).max(9)
  }).refine((t) => t.endDate >= t.startDate, { message: "Cover must end on or after it starts" });
  const referral = () => {
    if (!commerce.insuranceReferral) throw new HttpError(501, "Insurance quotes are not available: no insurance provider is configured.");
    return commerce.insuranceReferral;
  };
  r.post("/insurance/quotes", async (req, res) => {
    const out = await referral().quotes(insuranceTrip.parse(req.body));
    res.json({ provider: referral().name, ...out });
  });
  r.post("/insurance/link", async (req, res) => {
    const body = z16.object({ trip: insuranceTrip, sessionId: z16.string().min(1).max(200), offerId: z16.number().int() }).parse(req.body);
    const provider = referral();
    if (env.atlasKeyId?.startsWith("ak_test_")) throw new HttpError(403, "Purchase links are disabled while the insurance provider is in sandbox mode. Switch to a live key.");
    const url = await provider.link(body.trip, body.sessionId, body.offerId);
    await audit(store, { actorId: req.session.sub, action: "insurance.referred", targetId: String(body.offerId), meta: { provider: provider.name } });
    res.json({ url });
  });
  r.post("/checkout", async (req, res) => {
    const userId = req.session.sub;
    const input2 = checkoutInput.parse(req.body);
    const provider = requireCommerce(input2.kind);
    const user = await store.findUserById(userId);
    const profile = await store.getProfile(userId);
    const gatewayName = input2.gateway ?? defaultGateway(profile?.residenceCountry);
    const payments = requireGateway(gatewayName);
    if (!user?.emailVerifiedAt) throw new HttpError(403, "Verify your email address before booking");
    const open = (await store.listOrders(userId)).filter((o) => o.status === "awaiting_payment").length;
    if (open >= MAX_OPEN_ORDERS) throw new HttpError(429, "You have several unfinished checkouts. Finish or wait for them to expire.");
    const offer = await provider.quote(input2.offerId);
    if (input2.travellers.length !== offer.travellers) throw new HttpError(400, `This offer needs ${offer.travellers} traveller${offer.travellers > 1 ? "s" : ""}`);
    const feeMinor = feeFor(offer.providerMinor);
    const amountMinor = offer.providerMinor + feeMinor;
    if (amountMinor !== input2.expectedTotalMinor) {
      throw new HttpError(409, `The price changed to ${(amountMinor / 100).toFixed(2)} ${offer.currency}. Review it and try again.`);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const customer = { contact: input2.contact, travellers: input2.travellers };
    const snapshot = { offer, customer };
    const order = {
      id: randomUUID10(),
      userId,
      kind: input2.kind,
      status: "awaiting_payment",
      gateway: gatewayName,
      provider: offer.provider,
      offerId: offer.id,
      title: offer.title.slice(0, 150),
      startDate: offer.startDate,
      endDate: offer.endDate,
      amountMinor,
      feeMinor,
      currency: offer.currency,
      paymentSessionId: null,
      paymentRef: null,
      providerOrderId: null,
      reference: null,
      tickets: [],
      bookingId: null,
      note: null,
      dataEnc: encryptJson(snapshot),
      createdAt: now,
      updatedAt: now
    };
    await store.saveOrder(order);
    try {
      const session = await payments.createCheckout({
        orderId: order.id,
        title: order.title,
        amountMinor,
        currency: order.currency,
        customerEmail: user.email,
        successUrl: `${env.clientOrigin}/app/orders/${order.id}?paid=1`,
        cancelUrl: `${env.clientOrigin}/app/orders/${order.id}?cancelled=1`
      });
      order.paymentSessionId = session.sessionId;
      await store.saveOrder(order);
      await audit(store, { actorId: userId, action: "order.created", targetId: order.id, meta: { kind: order.kind, amountMinor } });
      res.status(201).json({ orderId: order.id, url: session.url });
    } catch (e) {
      await store.claimOrder(order.id, "awaiting_payment", "expired");
      throw e;
    }
  });
  r.get("/orders", async (req, res) => {
    res.json({ orders: (await store.listOrders(req.session.sub)).map(publicOrder) });
  });
  r.get("/orders/:id", async (req, res) => {
    const order = await store.getOrder(req.session.sub, String(req.params.id));
    if (!order) throw new HttpError(404, "Order not found");
    res.json({ order: publicOrder(order) });
  });
  return r;
}
function paymentWebhook(store) {
  return [
    express4.raw({ type: () => true, limit: "1mb" }),
    async (req, res) => {
      const name = req.params.gateway ?? "stripe";
      if (name !== "stripe" && name !== "safepay") throw new HttpError(404, "Unknown payment method");
      const gateway = requireGateway(name);
      const body = req.body;
      if (!Buffer.isBuffer(body)) throw new HttpError(400, "Invalid body");
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]));
      const event = gateway.verifyWebhook(body, headers);
      if (event?.type === "paid") {
        await handlePaid(store, gateway, event.orderId, { paymentRef: event.paymentRef, amountMinor: event.amountMinor, currency: event.currency });
      } else if (event?.type === "expired") {
        await handleExpired(store, event.orderId);
      }
      res.json({ received: true });
    }
  ];
}

// server/src/app.ts
var cors = (req, res, next) => {
  const origin = req.get("origin");
  if (origin && origin === env.clientOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
  }
  next();
};
function createApp(store, opts = {}) {
  const blobs = opts.blobs ?? new DiskBlobStore(opts.uploadDir ?? env.uploadDir);
  if (env.travelpayoutsToken && !providers.flights) providers.flights = travelpayoutsFlights(env.travelpayoutsToken, env.travelpayoutsMarker);
  if (env.stripeSecretKey && !commerce.gateways.stripe) commerce.gateways.stripe = stripeGateway(env.stripeSecretKey, env.stripeWebhookSecret);
  if (env.safepayApiKey && !commerce.gateways.safepay) {
    commerce.gateways.safepay = safepayGateway({ apiKey: env.safepayApiKey, secretKey: env.safepaySecretKey, webhookSecret: env.safepayWebhookSecret, env: env.safepayEnv });
  }
  if (env.atlasKeyId && env.atlasSigningSecret && !commerce.insuranceReferral) commerce.insuranceReferral = hellosafeInsurance(env.atlasKeyId, env.atlasSigningSecret);
  if (env.duffelToken && !commerce.flights) commerce.flights = duffelFlights(env.duffelToken);
  if (env.duffelToken && !commerce.hotels) commerce.hotels = duffelStays(env.duffelToken);
  const app = express5();
  app.disable("x-powered-by");
  if (env.isProd) app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use("/api", cors);
  app.post(["/api/commerce/webhook", "/api/commerce/webhook/:gateway"], ...paymentWebhook(store));
  app.use(express5.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", apiLimiter, originCheck);
  app.use("/api", sessionGuard(store));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRoutes(store));
  app.use("/api/profile", profileRoutes(store));
  app.use("/api/trips", tripRoutes(store));
  app.use("/api/visa", visaRoutes(store, blobs));
  app.use("/api/documents", documentRoutes(store, blobs));
  app.use("/api/appointments", appointmentRoutes(store, blobs));
  app.use("/api/bookings", bookingRoutes(store, blobs));
  app.post("/api/flights/search", requireAuth, async (req, res) => {
    res.json(await requireProvider("flights").search(req.body));
  });
  app.use("/api/commerce", commerceRoutes(store));
  app.use("/api/hotels", hotelRoutes());
  app.use("/api/expenses", expenseRoutes(store));
  app.use("/api/translate", translateRoutes());
  app.use("/api/account", accountRoutes(store, blobs));
  app.use("/api/admin", adminRoutes(store));
  app.use("/api/cron", cronRoutes(store, blobs));
  app.use("/api/uploads", uploadRoutes(store, blobs));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}

// server/src/models/create-stack.ts
import { createClient } from "@supabase/supabase-js";

// server/src/models/supabase-store.ts
function ok(res) {
  if (res.error) throw new DatabaseError(res.error.message, res.error.code ?? null);
  return res.data;
}
var s = (v) => v;
var sn = (v) => v === null || v === void 0 ? null : v;
var userFrom = (r) => ({
  id: s(r.id),
  email: s(r.email),
  name: s(r.name),
  passwordHash: s(r.password_hash),
  role: r.role,
  emailVerifiedAt: sn(r.email_verified_at),
  verifyToken: sn(r.verify_token),
  disabledAt: sn(r.disabled_at),
  createdAt: s(r.created_at)
});
var userTo = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  password_hash: u.passwordHash,
  role: u.role,
  email_verified_at: u.emailVerifiedAt,
  verify_token: u.verifyToken,
  disabled_at: u.disabledAt ?? null,
  created_at: u.createdAt
});
var profileFrom = (r) => ({
  userId: s(r.user_id),
  nationality: s(r.nationality),
  residenceCountry: s(r.residence_country),
  homeAirport: s(r.home_airport),
  interests: r.interests ?? [],
  onboardedAt: sn(r.onboarded_at),
  retentionDays: r.retention_days === null || r.retention_days === void 0 ? null : Number(r.retention_days)
});
var profileTo = (p) => ({
  user_id: p.userId,
  nationality: p.nationality,
  residence_country: p.residenceCountry,
  home_airport: p.homeAirport,
  interests: p.interests,
  onboarded_at: p.onboardedAt,
  retention_days: p.retentionDays ?? null
});
var tripFrom = (r) => ({
  id: s(r.id),
  userId: s(r.user_id),
  destination: s(r.destination),
  departOn: s(r.depart_on),
  returnOn: s(r.return_on),
  purpose: s(r.purpose),
  budget: r.budget === null || r.budget === void 0 ? null : Number(r.budget),
  status: r.status,
  createdAt: s(r.created_at)
});
var tripTo = (t) => ({
  id: t.id,
  user_id: t.userId,
  destination: t.destination,
  depart_on: t.departOn,
  return_on: t.returnOn,
  purpose: t.purpose,
  budget: t.budget,
  status: t.status,
  created_at: t.createdAt
});
var appFrom = (r) => ({
  id: s(r.id),
  userId: s(r.user_id),
  destinationId: s(r.destination_id),
  categoryId: s(r.category_id),
  nationality: s(r.nationality),
  residence: s(r.residence),
  status: r.status,
  checklist: r.checklist ?? {},
  dataEnc: s(r.data_enc),
  createdAt: s(r.created_at),
  updatedAt: s(r.updated_at)
});
var appTo = (a) => ({
  id: a.id,
  user_id: a.userId,
  destination_id: a.destinationId,
  category_id: a.categoryId,
  nationality: a.nationality,
  residence: a.residence,
  status: a.status,
  checklist: a.checklist,
  data_enc: a.dataEnc,
  created_at: a.createdAt,
  updated_at: a.updatedAt
});
var docFrom = (r) => ({
  id: s(r.id),
  userId: s(r.user_id),
  applicationId: s(r.owner_id),
  itemId: s(r.item_id),
  filename: s(r.filename),
  mime: s(r.mime),
  size: Number(r.size),
  uploadedAt: s(r.uploaded_at)
});
var docTo = (d) => ({
  id: d.id,
  user_id: d.userId,
  owner_id: d.applicationId,
  item_id: d.itemId,
  filename: d.filename,
  mime: d.mime,
  size: d.size,
  uploaded_at: d.uploadedAt
});
var bookingFrom = (r) => ({
  id: s(r.id),
  userId: s(r.user_id),
  kind: r.kind,
  status: r.status,
  source: r.source,
  title: s(r.title),
  startDate: s(r.start_date),
  endDate: sn(r.end_date),
  confirmationRef: sn(r.confirmation_ref),
  details: r.details ?? {},
  createdAt: s(r.created_at)
});
var bookingTo = (b) => ({
  id: b.id,
  user_id: b.userId,
  kind: b.kind,
  status: b.status,
  source: b.source,
  title: b.title,
  start_date: b.startDate,
  end_date: b.endDate,
  confirmation_ref: b.confirmationRef,
  details: b.details,
  created_at: b.createdAt
});
var apptFrom = (r) => ({
  id: s(r.id),
  userId: s(r.user_id),
  destinationId: s(r.destination_id),
  center: s(r.center),
  type: r.type,
  startsAt: s(r.starts_at),
  preferredTimes: s(r.preferred_times),
  status: r.status,
  officialRef: sn(r.official_ref),
  reminderDays: Number(r.reminder_days),
  notes: s(r.notes),
  checklist: r.checklist ?? {},
  createdAt: s(r.created_at)
});
var apptTo = (a) => ({
  id: a.id,
  user_id: a.userId,
  destination_id: a.destinationId,
  center: a.center,
  type: a.type,
  starts_at: a.startsAt,
  preferred_times: a.preferredTimes,
  status: a.status,
  official_ref: a.officialRef,
  reminder_days: a.reminderDays,
  notes: a.notes,
  checklist: a.checklist,
  created_at: a.createdAt
});
var auditFrom = (r) => ({
  // Postgres returns +00:00; normalise to the same ISO form the local store uses so both behave identically.
  id: s(r.id),
  at: new Date(s(r.at)).toISOString(),
  actorId: sn(r.actor_id),
  action: s(r.action),
  targetId: sn(r.target_id),
  meta: r.meta ?? {}
});
var expenseFrom = (r) => ({
  id: s(r.id),
  userId: s(r.user_id),
  tripId: sn(r.trip_id),
  category: s(r.category),
  description: s(r.description),
  amount: Number(r.amount),
  currency: s(r.currency),
  spentOn: s(r.spent_on),
  status: r.status,
  createdAt: s(r.created_at)
});
var expenseTo = (e) => ({
  id: e.id,
  user_id: e.userId,
  trip_id: e.tripId,
  category: e.category,
  description: e.description,
  amount: e.amount,
  currency: e.currency,
  spent_on: e.spentOn,
  status: e.status,
  created_at: e.createdAt
});
var orderFrom = (r) => ({
  id: s(r.id),
  userId: s(r.user_id),
  kind: r.kind,
  status: r.status,
  gateway: r.gateway,
  provider: s(r.provider),
  offerId: s(r.offer_id),
  title: s(r.title),
  startDate: s(r.start_date),
  endDate: sn(r.end_date),
  amountMinor: Number(r.amount_minor),
  feeMinor: Number(r.fee_minor),
  currency: s(r.currency),
  paymentSessionId: sn(r.payment_session_id),
  paymentRef: sn(r.payment_ref),
  providerOrderId: sn(r.provider_order_id),
  reference: sn(r.reference),
  tickets: r.tickets ?? [],
  bookingId: sn(r.booking_id),
  note: sn(r.note),
  dataEnc: s(r.data_enc),
  createdAt: new Date(s(r.created_at)).toISOString(),
  updatedAt: new Date(s(r.updated_at)).toISOString()
});
var orderTo = (o) => ({
  id: o.id,
  user_id: o.userId,
  kind: o.kind,
  status: o.status,
  gateway: o.gateway,
  provider: o.provider,
  offer_id: o.offerId,
  title: o.title,
  start_date: o.startDate,
  end_date: o.endDate,
  amount_minor: o.amountMinor,
  fee_minor: o.feeMinor,
  currency: o.currency,
  payment_session_id: o.paymentSessionId,
  payment_ref: o.paymentRef,
  provider_order_id: o.providerOrderId,
  reference: o.reference,
  tickets: o.tickets,
  booking_id: o.bookingId,
  note: o.note,
  data_enc: o.dataEnc,
  created_at: o.createdAt,
  updated_at: o.updatedAt
});
var SupabaseStore = class {
  db;
  constructor(client) {
    this.db = client;
  }
  async one(table, match, from) {
    const rows = ok(await this.db.from(table).select("*").match(match).limit(1));
    return rows[0] ? from(rows[0]) : void 0;
  }
  async many(table, match, from, order) {
    let q = this.db.from(table).select("*").match(match);
    if (order) q = q.order(order.col, { ascending: order.asc });
    return ok(await q).map(from);
  }
  async upsert(table, row, onConflict = "id") {
    ok(await this.db.from(table).upsert(row, { onConflict }).select("*"));
  }
  async remove(table, match) {
    const rows = ok(await this.db.from(table).delete().match(match).select("*"));
    return rows.length > 0;
  }
  findUserByEmail = (email) => this.one("users", { email: email.toLowerCase() }, userFrom);
  findUserById = (id2) => this.one("users", { id: id2 }, userFrom);
  findUserByVerifyToken = (token) => this.one("users", { verify_token: token }, userFrom);
  saveUser = (u) => this.upsert("users", userTo(u));
  async countUsers() {
    const res = await this.db.from("users").select("id", { count: "exact" }).limit(1);
    if (res.error) throw new DatabaseError(res.error.message, res.error.code ?? null);
    return res.count ?? 0;
  }
  getProfile = (userId) => this.one("profiles", { user_id: userId }, profileFrom);
  saveProfile = (p) => this.upsert("profiles", profileTo(p), "user_id");
  listTrips = (userId) => this.many("trips", { user_id: userId }, tripFrom, { col: "depart_on", asc: true });
  getTrip = (userId, id2) => this.one("trips", { user_id: userId, id: id2 }, tripFrom);
  saveTrip = (t) => this.upsert("trips", tripTo(t));
  deleteTrip = (userId, id2) => this.remove("trips", { user_id: userId, id: id2 });
  listApplications = (userId) => this.many("visa_applications", { user_id: userId }, appFrom, { col: "updated_at", asc: false });
  getApplication = (userId, id2) => this.one("visa_applications", { user_id: userId, id: id2 }, appFrom);
  saveApplication = (a) => this.upsert("visa_applications", appTo(a));
  async deleteApplication(userId, id2) {
    const removed = await this.remove("visa_applications", { user_id: userId, id: id2 });
    if (removed) await this.remove("documents", { user_id: userId, owner_id: id2 });
    return removed;
  }
  listDocuments(userId, ownerId) {
    return this.many("documents", ownerId ? { user_id: userId, owner_id: ownerId } : { user_id: userId }, docFrom);
  }
  getDocument = (userId, id2) => this.one("documents", { user_id: userId, id: id2 }, docFrom);
  saveDocument = (d) => this.upsert("documents", docTo(d));
  deleteDocument = (userId, id2) => this.remove("documents", { user_id: userId, id: id2 });
  listBookings = (userId) => this.many("bookings", { user_id: userId }, bookingFrom, { col: "start_date", asc: true });
  getBooking = (userId, id2) => this.one("bookings", { user_id: userId, id: id2 }, bookingFrom);
  saveBooking = (b) => this.upsert("bookings", bookingTo(b));
  deleteBooking = (userId, id2) => this.remove("bookings", { user_id: userId, id: id2 });
  listAppointments = (userId) => this.many("appointments", { user_id: userId }, apptFrom, { col: "starts_at", asc: true });
  getAppointment = (userId, id2) => this.one("appointments", { user_id: userId, id: id2 }, apptFrom);
  saveAppointment = (a) => this.upsert("appointments", apptTo(a));
  deleteAppointment = (userId, id2) => this.remove("appointments", { user_id: userId, id: id2 });
  async listExpenses(userId, tripId) {
    const rows = await this.many("expenses", tripId === void 0 ? { user_id: userId } : { user_id: userId, trip_id: tripId }, expenseFrom);
    return rows.sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt));
  }
  getExpense = (userId, id2) => this.one("expenses", { user_id: userId, id: id2 }, expenseFrom);
  saveExpense = (e) => this.upsert("expenses", expenseTo(e));
  deleteExpense = (userId, id2) => this.remove("expenses", { user_id: userId, id: id2 });
  listOrders = (userId) => this.many("orders", { user_id: userId }, orderFrom, { col: "created_at", asc: false });
  getOrder = (userId, id2) => this.one("orders", { user_id: userId, id: id2 }, orderFrom);
  getOrderById = (id2) => this.one("orders", { id: id2 }, orderFrom);
  saveOrder = (o) => this.upsert("orders", orderTo(o));
  async claimOrder(id2, from, to) {
    const rows = ok(await this.db.from("orders").update({ status: to, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id2).eq("status", from).select("id"));
    return rows.length > 0;
  }
  async deleteUserData(userId) {
    for (const t of ["orders", "expenses", "documents", "appointments", "bookings", "visa_applications", "trips", "profiles"]) {
      await this.remove(t, { user_id: userId });
    }
    await this.remove("users", { id: userId });
  }
  async count(table, status) {
    let q = this.db.from(table).select("id", { count: "exact" }).limit(1);
    if (status) q = q.eq("status", status);
    const res = await q;
    if (res.error) throw new DatabaseError(res.error.message, res.error.code ?? null);
    return res.count ?? 0;
  }
  async stats() {
    const byStatus = async (table, keys) => Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await this.count(table, k)])));
    return {
      users: await this.count("users"),
      documents: await this.count("documents"),
      applications: await byStatus("visa_applications", ["draft", "ready", "submitted_on_portal"]),
      bookings: await byStatus("bookings", ["sample", "requested", "confirmed"]),
      appointments: await byStatus("appointments", ["requested", "pending", "confirmed"])
    };
  }
  async listUsers(opts) {
    const q = (opts.query ?? "").replace(/[,()%*\\:"']/g, " ").trim();
    let req = this.db.from("users").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(opts.offset, opts.offset + opts.limit - 1);
    if (q) req = req.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
    const res = await req;
    if (res.error) throw new DatabaseError(res.error.message, res.error.code ?? null);
    return { users: res.data.map(userFrom), total: res.count ?? 0 };
  }
  async findUsersByIds(ids) {
    if (ids.length === 0) return [];
    const rows = ok(await this.db.from("users").select("*").in("id", ids));
    return rows.map(userFrom);
  }
  async addAudit(e) {
    ok(await this.db.from("audit_log").insert({ id: e.id, at: e.at, actor_id: e.actorId, action: e.action, target_id: e.targetId, meta: e.meta }).select("id"));
  }
  async listAudit(opts) {
    let req = this.db.from("audit_log").select("*").order("at", { ascending: false }).range(opts.offset, opts.offset + opts.limit - 1);
    if (opts.action) req = req.eq("action", opts.action);
    return ok(await req).map(auditFrom);
  }
  async listRetentionProfiles() {
    const rows = ok(await this.db.from("profiles").select("*").not("retention_days", "is", null));
    return rows.map(profileFrom);
  }
};

// server/src/models/store.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
var countBy = (rows, keys) => Object.fromEntries(keys.map((k) => [k, rows.filter((r) => r.status === k).length]));
var JsonStore = class {
  data = { users: [], profiles: [], trips: [], applications: [], documents: [], bookings: [], appointments: [], expenses: [], orders: [], audit: [] };
  /** Pass no path for a purely in-memory store (used in tests). */
  filePath;
  constructor(filePath) {
    this.filePath = filePath;
    if (filePath && existsSync(filePath)) this.data = { ...this.data, ...JSON.parse(readFileSync(filePath, "utf8")) };
  }
  persist() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
  async findUserByEmail(email) {
    return this.data.users.find((u) => u.email === email.toLowerCase());
  }
  async findUserById(id2) {
    return this.data.users.find((u) => u.id === id2);
  }
  async findUserByVerifyToken(token) {
    return this.data.users.find((u) => u.verifyToken === token);
  }
  async saveUser(user) {
    const i = this.data.users.findIndex((u) => u.id === user.id);
    if (i >= 0) this.data.users[i] = user;
    else this.data.users.push(user);
    this.persist();
  }
  async countUsers() {
    return this.data.users.length;
  }
  async getProfile(userId) {
    return this.data.profiles.find((p) => p.userId === userId);
  }
  async saveProfile(profile) {
    const i = this.data.profiles.findIndex((p) => p.userId === profile.userId);
    if (i >= 0) this.data.profiles[i] = profile;
    else this.data.profiles.push(profile);
    this.persist();
  }
  async listTrips(userId) {
    return this.data.trips.filter((t) => t.userId === userId).sort((a, b) => a.departOn.localeCompare(b.departOn));
  }
  async getTrip(userId, id2) {
    return this.data.trips.find((t) => t.userId === userId && t.id === id2);
  }
  async saveTrip(trip) {
    const i = this.data.trips.findIndex((t) => t.id === trip.id);
    if (i >= 0) this.data.trips[i] = trip;
    else this.data.trips.push(trip);
    this.persist();
  }
  async deleteTrip(userId, id2) {
    const before = this.data.trips.length;
    this.data.trips = this.data.trips.filter((t) => !(t.userId === userId && t.id === id2));
    this.data.expenses = this.data.expenses.map((e) => e.userId === userId && e.tripId === id2 ? { ...e, tripId: null } : e);
    this.persist();
    return this.data.trips.length < before;
  }
  async deleteUserData(userId) {
    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.data.profiles = this.data.profiles.filter((p) => p.userId !== userId);
    this.data.trips = this.data.trips.filter((t) => t.userId !== userId);
    this.data.applications = this.data.applications.filter((a) => a.userId !== userId);
    this.data.documents = this.data.documents.filter((d) => d.userId !== userId);
    this.data.bookings = this.data.bookings.filter((b) => b.userId !== userId);
    this.data.appointments = this.data.appointments.filter((a) => a.userId !== userId);
    this.data.expenses = this.data.expenses.filter((e) => e.userId !== userId);
    this.data.orders = this.data.orders.filter((o) => o.userId !== userId);
    this.persist();
  }
  async listApplications(userId) {
    return this.data.applications.filter((a) => a.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getApplication(userId, id2) {
    return this.data.applications.find((a) => a.userId === userId && a.id === id2);
  }
  async saveApplication(app) {
    const i = this.data.applications.findIndex((a) => a.id === app.id);
    if (i >= 0) this.data.applications[i] = app;
    else this.data.applications.push(app);
    this.persist();
  }
  async deleteApplication(userId, id2) {
    const before = this.data.applications.length;
    this.data.applications = this.data.applications.filter((a) => !(a.userId === userId && a.id === id2));
    this.data.documents = this.data.documents.filter((d) => !(d.userId === userId && d.applicationId === id2));
    this.persist();
    return this.data.applications.length < before;
  }
  async listDocuments(userId, applicationId) {
    return this.data.documents.filter((d) => d.userId === userId && (!applicationId || d.applicationId === applicationId));
  }
  async getDocument(userId, id2) {
    return this.data.documents.find((d) => d.userId === userId && d.id === id2);
  }
  async saveDocument(doc) {
    this.data.documents.push(doc);
    this.persist();
  }
  async deleteDocument(userId, id2) {
    const before = this.data.documents.length;
    this.data.documents = this.data.documents.filter((d) => !(d.userId === userId && d.id === id2));
    this.persist();
    return this.data.documents.length < before;
  }
  async listBookings(userId) {
    return this.data.bookings.filter((b) => b.userId === userId).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  async getBooking(userId, id2) {
    return this.data.bookings.find((b) => b.userId === userId && b.id === id2);
  }
  async saveBooking(booking) {
    const i = this.data.bookings.findIndex((b) => b.id === booking.id);
    if (i >= 0) this.data.bookings[i] = booking;
    else this.data.bookings.push(booking);
    this.persist();
  }
  async deleteBooking(userId, id2) {
    const before = this.data.bookings.length;
    this.data.bookings = this.data.bookings.filter((b) => !(b.userId === userId && b.id === id2));
    this.persist();
    return this.data.bookings.length < before;
  }
  async listAppointments(userId) {
    return this.data.appointments.filter((a) => a.userId === userId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  async getAppointment(userId, id2) {
    return this.data.appointments.find((a) => a.userId === userId && a.id === id2);
  }
  async saveAppointment(a) {
    const i = this.data.appointments.findIndex((x) => x.id === a.id);
    if (i >= 0) this.data.appointments[i] = a;
    else this.data.appointments.push(a);
    this.persist();
  }
  async deleteAppointment(userId, id2) {
    const before = this.data.appointments.length;
    this.data.appointments = this.data.appointments.filter((a) => !(a.userId === userId && a.id === id2));
    this.persist();
    return this.data.appointments.length < before;
  }
  async listExpenses(userId, tripId) {
    return this.data.expenses.filter((e) => e.userId === userId && (tripId === void 0 || e.tripId === tripId)).sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt));
  }
  async getExpense(userId, id2) {
    return this.data.expenses.find((e) => e.userId === userId && e.id === id2);
  }
  async saveExpense(e) {
    const i = this.data.expenses.findIndex((x) => x.id === e.id);
    if (i >= 0) this.data.expenses[i] = e;
    else this.data.expenses.push(e);
    this.persist();
  }
  async deleteExpense(userId, id2) {
    const before = this.data.expenses.length;
    this.data.expenses = this.data.expenses.filter((e) => !(e.userId === userId && e.id === id2));
    this.persist();
    return this.data.expenses.length < before;
  }
  async listOrders(userId) {
    return this.data.orders.filter((o) => o.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getOrder(userId, id2) {
    return this.data.orders.find((o) => o.userId === userId && o.id === id2);
  }
  async getOrderById(id2) {
    return this.data.orders.find((o) => o.id === id2);
  }
  async saveOrder(order) {
    const i = this.data.orders.findIndex((o) => o.id === order.id);
    if (i >= 0) this.data.orders[i] = order;
    else this.data.orders.push(order);
    this.persist();
  }
  async claimOrder(id2, from, to) {
    const o = this.data.orders.find((x) => x.id === id2);
    if (!o || o.status !== from) return false;
    o.status = to;
    o.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persist();
    return true;
  }
  async stats() {
    return {
      users: this.data.users.length,
      documents: this.data.documents.length,
      applications: countBy(this.data.applications, ["draft", "ready", "submitted_on_portal"]),
      bookings: countBy(this.data.bookings, ["sample", "requested", "confirmed"]),
      appointments: countBy(this.data.appointments, ["requested", "pending", "confirmed"])
    };
  }
  async listUsers(opts) {
    const q = (opts.query ?? "").trim().toLowerCase();
    const all = this.data.users.filter((u) => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { users: all.slice(opts.offset, opts.offset + opts.limit), total: all.length };
  }
  async findUsersByIds(ids) {
    const set = new Set(ids);
    return this.data.users.filter((u) => set.has(u.id));
  }
  async addAudit(entry) {
    this.data.audit.push(entry);
    if (this.data.audit.length > 2e4) this.data.audit.splice(0, this.data.audit.length - 2e4);
    this.persist();
  }
  async listAudit(opts) {
    return this.data.audit.filter((e) => !opts.action || e.action === opts.action).sort((a, b) => b.at.localeCompare(a.at)).slice(opts.offset, opts.offset + opts.limit);
  }
  async listRetentionProfiles() {
    return this.data.profiles.filter((p) => typeof p.retentionDays === "number");
  }
};

// server/src/models/create-stack.ts
function createStack() {
  if (env.isProd && env.storageMode === "local") throw new Error("STORAGE_MODE=local is not allowed in production");
  if (env.storageMode !== "local" && env.supabaseUrl && env.supabaseServiceKey) {
    const client = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return { store: new SupabaseStore(client), blobs: new SupabaseBlobStore(client, env.supabaseBucket), mode: "supabase", supabase: client };
  }
  if (env.isProd) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production");
  return { store: new JsonStore(env.dataFile), blobs: new DiskBlobStore(env.uploadDir), mode: "local-files" };
}

// server/src/vercel-entry.ts
var stack = createStack();
var vercel_entry_default = createApp(stack.store, { blobs: stack.blobs });
export {
  vercel_entry_default as default
};
