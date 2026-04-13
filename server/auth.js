import crypto from "crypto";
import { promisify } from "util";
import { execute, queryAll, queryOne } from "./db.js";

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "rentout_session";
const READ_ROLES = new Set(["viewer", "operator", "admin"]);
const WRITE_ROLES = new Set(["operator", "admin"]);
const ADMIN_ROLES = new Set(["admin"]);
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (!READ_ROLES.has(normalized)) {
    throw new Error("Invalid operator role");
  }
  return normalized;
}

function makePasswordHashRecord(salt, derivedKey) {
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

async function hashPassword(password) {
  const normalized = String(password || "");
  if (normalized.length < 12) {
    throw new Error("Password must be at least 12 characters");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(normalized, salt, 64);
  return makePasswordHashRecord(salt, derivedKey);
}

async function verifyPassword(password, storedHash) {
  const [scheme, salt, key] = String(storedHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const derivedKey = await scrypt(String(password || ""), salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
}

function hashOpaqueToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashRecoveryCode(code) {
  return crypto.createHash("sha256").update(normalizeCode(code)).digest("hex");
}

function createOpaqueToken(size = 32) {
  return crypto.randomBytes(size).toString("base64url");
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const clone = JSON.parse(JSON.stringify(payload));
  for (const key of [
    "password",
    "current_password",
    "new_password",
    "password_hash",
    "session_token",
    "challenge_token",
    "code",
    "recovery_codes",
    "mfa_secret",
    "mfa_pending_secret",
  ]) {
    if (key in clone) clone[key] = "[redacted]";
  }
  return clone;
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(secret) {
  const normalized = String(secret || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid MFA secret");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotp(secret, timestamp = Date.now(), stepSeconds = 30, digits = 6) {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

function verifyTotp(secret, code, window = 1) {
  const normalized = normalizeCode(code);
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = generateTotp(secret, now + offset * 30_000);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(normalized))) {
      return true;
    }
  }
  return false;
}

function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
  });
}

function encodeRecoveryCodes(codes) {
  return JSON.stringify(codes.map((code) => hashRecoveryCode(code)));
}

function decodeRecoveryCodes(encoded) {
  try {
    const parsed = JSON.parse(String(encoded || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function buildOtpAuthUri({ issuer, email, secret }) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function sessionCookieValue(token, env, expiresAt) {
  const isSecure = String(env.NODE_ENV || "").toLowerCase() === "production";
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (isSecure) attrs.push("Secure");
  return attrs.join("; ");
}

function clearSessionCookie(env) {
  const isSecure = String(env.NODE_ENV || "").toLowerCase() === "production";
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"];
  if (isSecure) attrs.push("Secure");
  return attrs.join("; ");
}

async function getOperatorCount() {
  const row = await queryOne(`SELECT COUNT(*) AS count FROM operators`);
  return Number(row?.count || 0);
}

async function getOperatorByEmail(email) {
  return queryOne(
    `SELECT * FROM operators WHERE lower(email) = lower(?)`,
    [email],
    `SELECT * FROM operators WHERE lower(email) = lower($1)`,
  );
}

async function getOperatorById(id) {
  return queryOne(`SELECT * FROM operators WHERE id = ?`, [id], `SELECT * FROM operators WHERE id = $1`);
}

async function getSafeOperator(operatorId) {
  const row = await queryOne(
    `
      SELECT
        id,
        email,
        full_name,
        role,
        is_active,
        mfa_enabled,
        last_login_at,
        password_changed_at,
        created_at,
        updated_at
      FROM operators
      WHERE id = ?
    `,
    [operatorId],
    `
      SELECT
        id,
        email,
        full_name,
        role,
        is_active,
        mfa_enabled,
        last_login_at,
        password_changed_at,
        created_at,
        updated_at
      FROM operators
      WHERE id = $1
    `,
  );

  return row
    ? {
        ...row,
        is_active: Boolean(row.is_active),
        mfa_enabled: Boolean(row.mfa_enabled),
      }
    : null;
}

async function createOperatorAccount(input) {
  const email = String(input.email || "").trim().toLowerCase();
  const fullName = String(input.full_name || "").trim();
  const role = normalizeRole(input.role || "operator");
  if (!email || !fullName) {
    throw new Error("email and full_name are required");
  }
  if (!input.password) {
    throw new Error("password is required");
  }
  if (await getOperatorByEmail(email)) {
    throw new Error("Operator email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const result = await execute(
    `
      INSERT INTO operators (
        email, full_name, role, password_hash, is_active, password_changed_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [email, fullName, role, passwordHash, input.is_active === false ? 0 : 1],
    `
      INSERT INTO operators (
        email, full_name, role, password_hash, is_active, password_changed_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `,
  );

  const operatorId = Number(result.lastInsertRowid || result.rows?.[0]?.id);
  return getSafeOperator(operatorId);
}

async function createSessionForOperator(operator, req, env) {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const ttlDays = Number(env.SESSION_TTL_DAYS || 14);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await execute(
    `
      INSERT INTO auth_sessions (operator_id, session_token_hash, expires_at, ip_address, user_agent, last_seen_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [operator.id, tokenHash, expiresAt, req.ip || null, req.headers["user-agent"] || null],
    `
      INSERT INTO auth_sessions (operator_id, session_token_hash, expires_at, ip_address, user_agent, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING id
    `,
  );

  await execute(
    `UPDATE operators SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [operator.id],
    `UPDATE operators SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
  );

  return {
    token,
    expiresAt,
  };
}

async function revokeSessionToken(token) {
  if (!token) return;
  const tokenHash = hashOpaqueToken(token);
  await execute(
    `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_token_hash = ? AND revoked_at IS NULL`,
    [tokenHash],
    `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_token_hash = $1 AND revoked_at IS NULL`,
  );
}

async function revokeOperatorSessions(operatorId, exceptSessionId = null) {
  if (exceptSessionId == null) {
    await execute(
      `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE operator_id = ? AND revoked_at IS NULL`,
      [operatorId],
      `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE operator_id = $1 AND revoked_at IS NULL`,
    );
    return;
  }
  await execute(
    `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE operator_id = ? AND id <> ? AND revoked_at IS NULL`,
    [operatorId, exceptSessionId],
    `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE operator_id = $1 AND id <> $2 AND revoked_at IS NULL`,
  );
}

async function createLoginChallenge(operator, req, env) {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const ttlMinutes = Number(env.MFA_CHALLENGE_TTL_MINUTES || 10);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  await execute(
    `
      INSERT INTO auth_login_challenges (
        operator_id, challenge_token_hash, method, expires_at, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [operator.id, tokenHash, "totp", expiresAt, req.ip || null, req.headers["user-agent"] || null],
    `
      INSERT INTO auth_login_challenges (
        operator_id, challenge_token_hash, method, expires_at, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
  );

  return {
    token,
    expiresAt,
  };
}

async function getChallengeByToken(token) {
  const tokenHash = hashOpaqueToken(token);
  return queryOne(
    `
      SELECT
        c.*,
        o.email,
        o.full_name,
        o.role,
        o.is_active,
        o.mfa_enabled,
        o.mfa_secret,
        o.mfa_recovery_codes
      FROM auth_login_challenges c
      JOIN operators o ON o.id = c.operator_id
      WHERE c.challenge_token_hash = ?
    `,
    [tokenHash],
    `
      SELECT
        c.*,
        o.email,
        o.full_name,
        o.role,
        o.is_active,
        o.mfa_enabled,
        o.mfa_secret,
        o.mfa_recovery_codes
      FROM auth_login_challenges c
      JOIN operators o ON o.id = c.operator_id
      WHERE c.challenge_token_hash = $1
    `,
  );
}

async function markChallengeFulfilled(challengeId) {
  await execute(
    `UPDATE auth_login_challenges SET fulfilled_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [challengeId],
    `UPDATE auth_login_challenges SET fulfilled_at = CURRENT_TIMESTAMP WHERE id = $1`,
  );
}

async function incrementChallengeAttempt(challengeId) {
  await execute(
    `UPDATE auth_login_challenges SET attempt_count = attempt_count + 1 WHERE id = ?`,
    [challengeId],
    `UPDATE auth_login_challenges SET attempt_count = attempt_count + 1 WHERE id = $1`,
  );
}

async function updateOperatorPassword(operatorId, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  await execute(
    `
      UPDATE operators
      SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [passwordHash, operatorId],
    `
      UPDATE operators
      SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
  );
}

async function consumeRecoveryCode(operatorId, operator, submittedCode) {
  const existingHashes = decodeRecoveryCodes(operator.mfa_recovery_codes);
  const submittedHash = hashRecoveryCode(submittedCode);
  const matchIndex = existingHashes.findIndex((value) => value === submittedHash);
  if (matchIndex < 0) return false;

  existingHashes.splice(matchIndex, 1);
  await execute(
    `UPDATE operators SET mfa_recovery_codes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [JSON.stringify(existingHashes), operatorId],
    `UPDATE operators SET mfa_recovery_codes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
  );
  return true;
}

async function disableOperatorMfa(operatorId) {
  await execute(
    `
      UPDATE operators
      SET
        mfa_enabled = 0,
        mfa_secret = NULL,
        mfa_pending_secret = NULL,
        mfa_recovery_codes = NULL,
        mfa_pending_recovery_codes = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [operatorId],
    `
      UPDATE operators
      SET
        mfa_enabled = FALSE,
        mfa_secret = NULL,
        mfa_pending_secret = NULL,
        mfa_recovery_codes = NULL,
        mfa_pending_recovery_codes = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
  );
}

async function resolveSession(req) {
  const authHeader = req.headers.authorization || "";
  let token = "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE] || "";
  }
  if (!token) return null;

  const tokenHash = hashOpaqueToken(token);
  const session = await queryOne(
    `
      SELECT
        s.id,
        s.operator_id,
        s.expires_at,
        s.revoked_at,
        o.email,
        o.full_name,
        o.role,
        o.is_active,
        o.mfa_enabled
      FROM auth_sessions s
      JOIN operators o ON o.id = s.operator_id
      WHERE s.session_token_hash = ?
    `,
    [tokenHash],
    `
      SELECT
        s.id,
        s.operator_id,
        s.expires_at,
        s.revoked_at,
        o.email,
        o.full_name,
        o.role,
        o.is_active,
        o.mfa_enabled
      FROM auth_sessions s
      JOIN operators o ON o.id = s.operator_id
      WHERE s.session_token_hash = $1
    `,
  );

  if (!session || session.revoked_at || !session.is_active) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await revokeSessionToken(token);
    return null;
  }

  await execute(
    `UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [session.id],
    `UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1`,
  );

  return {
    sessionId: Number(session.id),
    sessionToken: token,
    id: Number(session.operator_id),
    email: session.email,
    full_name: session.full_name,
    role: session.role,
    mfa_enabled: Boolean(session.mfa_enabled),
  };
}

export function createAuth(env) {
  const mfaIssuer = String(env.MFA_ISSUER || "RentOut").trim() || "RentOut";

  async function writeRawAudit({ operatorId, req, action, entityType, entityId, payload }) {
    await execute(
      `
        INSERT INTO audit_logs (operator_id, action, entity_type, entity_id, request_id, ip_address, user_agent, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        operatorId || null,
        action,
        entityType,
        entityId == null ? null : String(entityId),
        req.requestId || null,
        req.ip || null,
        req.headers["user-agent"] || null,
        JSON.stringify(sanitizePayload(payload ?? {})),
      ],
      `
        INSERT INTO audit_logs (operator_id, action, entity_type, entity_id, request_id, ip_address, user_agent, payload)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
    );
  }

  async function ensureBootstrapOperator() {
    const operatorCount = await getOperatorCount();
    if (operatorCount > 0) return null;

    const email = String(env.OPERATOR_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
    const password = String(env.OPERATOR_BOOTSTRAP_PASSWORD || "");
    const fullName = String(env.OPERATOR_BOOTSTRAP_NAME || "Platform Admin").trim();

    if (!email || !password) {
      throw new Error(
        "No operators exist. Set OPERATOR_BOOTSTRAP_EMAIL and OPERATOR_BOOTSTRAP_PASSWORD before starting the app.",
      );
    }

    return createOperatorAccount({
      email,
      full_name: fullName,
      role: "admin",
      password,
    });
  }

  async function requireRole(allowedRoles, req, res, next) {
    try {
      const actor = await resolveSession(req);
      if (!actor) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!allowedRoles.has(actor.role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.actor = actor;
      next();
    } catch (error) {
      res.status(500).json({ error: String(error?.message || error) });
    }
  }

  async function verifyMfaCode(operator, code) {
    if (!operator.mfa_enabled || !operator.mfa_secret) {
      throw new Error("MFA is not enabled");
    }
    if (verifyTotp(operator.mfa_secret, code)) {
      return { method: "totp" };
    }
    if (await consumeRecoveryCode(operator.id, operator, code)) {
      return { method: "recovery_code" };
    }
    return null;
  }

  return {
    ensureBootstrapOperator,
    requireRead(req, res, next) {
      return requireRole(READ_ROLES, req, res, next);
    },
    requireWrite(req, res, next) {
      return requireRole(WRITE_ROLES, req, res, next);
    },
    requireAdmin(req, res, next) {
      return requireRole(ADMIN_ROLES, req, res, next);
    },
    async loginHandler(req, res) {
      try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");
        if (!email || !password) {
          res.status(400).json({ error: "email and password are required" });
          return;
        }

        const operator = await getOperatorByEmail(email);
        if (!operator || !operator.is_active) {
          await writeRawAudit({
            operatorId: operator?.id,
            req,
            action: "auth.login.failed",
            entityType: "operator",
            entityId: operator?.id || email,
            payload: { email, reason: "invalid_credentials" },
          });
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }
        if (!(await verifyPassword(password, operator.password_hash))) {
          await writeRawAudit({
            operatorId: operator.id,
            req,
            action: "auth.login.failed",
            entityType: "operator",
            entityId: operator.id,
            payload: { email, reason: "invalid_credentials" },
          });
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }

        if (operator.mfa_enabled) {
          const challenge = await createLoginChallenge(operator, req, env);
          await writeRawAudit({
            operatorId: operator.id,
            req,
            action: "auth.login.challenge_issued",
            entityType: "operator",
            entityId: operator.id,
            payload: { email },
          });
          res.status(202).json({
            ok: false,
            requires_mfa: true,
            challenge_token: challenge.token,
            challenge_expires_at: challenge.expiresAt,
            actor_hint: {
              email: operator.email,
              full_name: operator.full_name,
            },
            available_methods: ["totp", "recovery_code"],
          });
          return;
        }

        const session = await createSessionForOperator(operator, req, env);
        await writeRawAudit({
          operatorId: operator.id,
          req,
          action: "auth.login",
          entityType: "operator",
          entityId: operator.id,
          payload: { email, mfa: false },
        });
        res.setHeader("Set-Cookie", sessionCookieValue(session.token, env, session.expiresAt));
        res.json({
          ok: true,
          actor: await getSafeOperator(operator.id),
          session_expires_at: session.expiresAt,
        });
      } catch (error) {
        res.status(500).json({ error: String(error?.message || error) });
      }
    },
    async loginMfaVerifyHandler(req, res) {
      try {
        const challengeToken = String(req.body?.challenge_token || "").trim();
        const code = String(req.body?.code || "").trim();
        if (!challengeToken || !code) {
          res.status(400).json({ error: "challenge_token and code are required" });
          return;
        }

        const challenge = await getChallengeByToken(challengeToken);
        if (!challenge || challenge.fulfilled_at || !challenge.is_active || !challenge.mfa_enabled) {
          res.status(401).json({ error: "Invalid or expired MFA challenge" });
          return;
        }
        if (new Date(challenge.expires_at).getTime() <= Date.now() || Number(challenge.attempt_count || 0) >= 10) {
          res.status(401).json({ error: "Invalid or expired MFA challenge" });
          return;
        }

        const operator = await getOperatorById(challenge.operator_id);
        const result = await verifyMfaCode(operator, code);
        if (!result) {
          await incrementChallengeAttempt(challenge.id);
          await writeRawAudit({
            operatorId: operator.id,
            req,
            action: "auth.mfa.failed",
            entityType: "operator",
            entityId: operator.id,
            payload: { email: operator.email },
          });
          res.status(401).json({ error: "Invalid MFA code" });
          return;
        }

        await markChallengeFulfilled(challenge.id);
        const session = await createSessionForOperator(operator, req, env);
        await writeRawAudit({
          operatorId: operator.id,
          req,
          action: result.method === "recovery_code" ? "auth.mfa.recovery_login" : "auth.mfa.login",
          entityType: "operator",
          entityId: operator.id,
          payload: { email: operator.email, method: result.method },
        });
        res.setHeader("Set-Cookie", sessionCookieValue(session.token, env, session.expiresAt));
        res.json({
          ok: true,
          actor: await getSafeOperator(operator.id),
          session_expires_at: session.expiresAt,
        });
      } catch (error) {
        res.status(500).json({ error: String(error?.message || error) });
      }
    },
    async logoutHandler(req, res) {
      const actor = await resolveSession(req);
      if (actor?.sessionToken) {
        await revokeSessionToken(actor.sessionToken);
        await writeRawAudit({
          operatorId: actor.id,
          req,
          action: "auth.logout",
          entityType: "operator",
          entityId: actor.id,
          payload: { email: actor.email },
        });
      }
      res.setHeader("Set-Cookie", clearSessionCookie(env));
      res.json({ ok: true });
    },
    async sessionHandler(req, res) {
      const actor = await resolveSession(req);
      if (!actor) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      res.json({
        ok: true,
        actor: {
          id: actor.id,
          email: actor.email,
          full_name: actor.full_name,
          role: actor.role,
          mfa_enabled: actor.mfa_enabled,
        },
      });
    },
    async listOperators() {
      const rows = await queryAll(
        `
          SELECT
            id,
            email,
            full_name,
            role,
            is_active,
            mfa_enabled,
            last_login_at,
            password_changed_at,
            created_at,
            updated_at
          FROM operators
          ORDER BY full_name, email
        `,
      );
      return rows.map((row) => ({
        ...row,
        is_active: Boolean(row.is_active),
        mfa_enabled: Boolean(row.mfa_enabled),
      }));
    },
    async createOperator(input) {
      return createOperatorAccount(input);
    },
    async updateOperator(operatorId, input) {
      const existing = await getOperatorById(operatorId);
      if (!existing) {
        throw new Error("Operator not found");
      }
      const fullName = String(input.full_name || existing.full_name).trim();
      const role = normalizeRole(input.role || existing.role);
      const isActive = typeof input.is_active === "boolean" ? input.is_active : Boolean(existing.is_active);
      if (!fullName) {
        throw new Error("full_name is required");
      }

      await execute(
        `
          UPDATE operators
          SET full_name = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [fullName, role, isActive ? 1 : 0, operatorId],
        `
          UPDATE operators
          SET full_name = $1, role = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
        `,
      );

      if (!isActive) {
        await revokeOperatorSessions(operatorId);
      }

      return getSafeOperator(operatorId);
    },
    async resetOperatorPassword(operatorId, input) {
      const operator = await getOperatorById(operatorId);
      if (!operator) {
        throw new Error("Operator not found");
      }
      const newPassword = String(input.new_password || "");
      const revokeSessions = input.revoke_sessions !== false;
      const resetMfa = input.reset_mfa === true;
      await updateOperatorPassword(operatorId, newPassword);
      if (resetMfa) {
        await disableOperatorMfa(operatorId);
      }
      if (revokeSessions) {
        await revokeOperatorSessions(operatorId);
      }
      return getSafeOperator(operatorId);
    },
    async beginMfaEnrollment(actor) {
      const operator = await getOperatorById(actor.id);
      if (!operator || !operator.is_active) {
        throw new Error("Operator not found");
      }
      const secret = generateTotpSecret();
      const recoveryCodes = generateRecoveryCodes();
      await execute(
        `
          UPDATE operators
          SET
            mfa_pending_secret = ?,
            mfa_pending_recovery_codes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [secret, encodeRecoveryCodes(recoveryCodes), actor.id],
        `
          UPDATE operators
          SET
            mfa_pending_secret = $1,
            mfa_pending_recovery_codes = $2,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `,
      );
      return {
        secret,
        otp_auth_uri: buildOtpAuthUri({ issuer: mfaIssuer, email: operator.email, secret }),
        recovery_codes: recoveryCodes,
      };
    },
    async verifyMfaEnrollment(actor, code) {
      const operator = await getOperatorById(actor.id);
      if (!operator?.mfa_pending_secret || !operator?.mfa_pending_recovery_codes) {
        throw new Error("MFA enrollment has not been started");
      }
      if (!verifyTotp(operator.mfa_pending_secret, code)) {
        throw new Error("Invalid MFA code");
      }
      await execute(
        `
          UPDATE operators
          SET
            mfa_enabled = ?,
            mfa_secret = mfa_pending_secret,
            mfa_recovery_codes = mfa_pending_recovery_codes,
            mfa_pending_secret = NULL,
            mfa_pending_recovery_codes = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [1, actor.id],
        `
          UPDATE operators
          SET
            mfa_enabled = TRUE,
            mfa_secret = mfa_pending_secret,
            mfa_recovery_codes = mfa_pending_recovery_codes,
            mfa_pending_secret = NULL,
            mfa_pending_recovery_codes = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
      );
      return getSafeOperator(actor.id);
    },
    async disableMfa(actor, input) {
      const operator = await getOperatorById(actor.id);
      const password = String(input.password || "");
      const code = String(input.code || "");
      if (!(await verifyPassword(password, operator.password_hash))) {
        throw new Error("Current password is incorrect");
      }
      const verified = await verifyMfaCode(operator, code);
      if (!verified) {
        throw new Error("Invalid MFA code");
      }
      await disableOperatorMfa(actor.id);
      await revokeOperatorSessions(actor.id, actor.sessionId);
      return getSafeOperator(actor.id);
    },
    async changePassword(actor, input) {
      const operator = await getOperatorById(actor.id);
      const currentPassword = String(input.current_password || "");
      const newPassword = String(input.new_password || "");
      const mfaCode = String(input.mfa_code || "");

      if (!(await verifyPassword(currentPassword, operator.password_hash))) {
        throw new Error("Current password is incorrect");
      }
      if (operator.mfa_enabled) {
        const verified = await verifyMfaCode(operator, mfaCode);
        if (!verified) {
          throw new Error("Invalid MFA code");
        }
      }

      await updateOperatorPassword(actor.id, newPassword);
      await revokeOperatorSessions(actor.id, actor.sessionId);
      return getSafeOperator(actor.id);
    },
    async writeAudit({ req, actor, action, entityType, entityId, payload }) {
      await writeRawAudit({
        operatorId: actor?.id,
        req,
        action,
        entityType,
        entityId,
        payload,
      });
    },
    async listAuditLogs(limit = 100) {
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
      const rows = await queryAll(
        `
          SELECT
            al.*,
            o.email AS operator_email,
            o.full_name AS operator_name
          FROM audit_logs al
          LEFT JOIN operators o ON o.id = al.operator_id
          ORDER BY al.created_at DESC, al.id DESC
          LIMIT ?
        `,
        [safeLimit],
        `
          SELECT
            al.*,
            o.email AS operator_email,
            o.full_name AS operator_name
          FROM audit_logs al
          LEFT JOIN operators o ON o.id = al.operator_id
          ORDER BY al.created_at DESC, al.id DESC
          LIMIT $1
        `,
      );
      return rows.map((row) => ({
        ...row,
        payload: row.payload ? JSON.parse(row.payload) : null,
      }));
    },
  };
}
