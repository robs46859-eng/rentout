import "dotenv/config";
import crypto from "crypto";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createAuth } from "./auth.js";
import { migrate } from "./db.js";
import { buildConsolidatedResponse } from "./services/consolidated.js";
import { createProspect, listCrmPipeline, logProspectActivity, updateProspectStage } from "./services/crm.js";
import { createWorkOrder, listPropertyManagement, updateWorkOrder } from "./services/property.js";
import { createScreeningApplication, listScreeningOverview, updateScreeningDecision } from "./services/screening.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

await migrate();
const auth = createAuth(process.env);
const bootstrapOperator = await auth.ensureBootstrapOperator();

const app = express();
const port = Number(process.env.PORT || 3847);
const host = process.env.HOST || "127.0.0.1";

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => {
  req.requestId = crypto.randomUUID();
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rentout-api", time: new Date().toISOString() });
});

app.post("/api/auth/login", auth.loginHandler);
app.post("/api/auth/mfa/verify", auth.loginMfaVerifyHandler);
app.post("/api/auth/logout", auth.logoutHandler);
app.get("/api/session", auth.sessionHandler);

app.post("/api/v1/account/password/change", auth.requireRead, async (req, res) => {
  try {
    const operator = await auth.changePassword(req.actor, req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "account.password.change",
      entityType: "operator",
      entityId: req.actor.id,
      payload: { actor_id: req.actor.id },
    });
    res.json({ ok: true, operator });
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

app.post("/api/v1/account/mfa/setup", auth.requireRead, async (req, res) => {
  try {
    const enrollment = await auth.beginMfaEnrollment(req.actor);
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "account.mfa.setup_started",
      entityType: "operator",
      entityId: req.actor.id,
      payload: { actor_id: req.actor.id },
    });
    res.json({ ok: true, ...enrollment });
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

app.post("/api/v1/account/mfa/verify", auth.requireRead, async (req, res) => {
  try {
    const operator = await auth.verifyMfaEnrollment(req.actor, req.body?.code);
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "account.mfa.enabled",
      entityType: "operator",
      entityId: req.actor.id,
      payload: { actor_id: req.actor.id },
    });
    res.json({ ok: true, operator });
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

app.post("/api/v1/account/mfa/disable", auth.requireRead, async (req, res) => {
  try {
    const operator = await auth.disableMfa(req.actor, req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "account.mfa.disabled",
      entityType: "operator",
      entityId: req.actor.id,
      payload: { actor_id: req.actor.id },
    });
    res.json({ ok: true, operator });
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

app.get("/api/v1/consolidated", auth.requireRead, async (_req, res) => {
  try {
    res.json(await buildConsolidatedResponse(process.env));
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

app.get("/api/v1/crm/pipeline", auth.requireRead, async (_req, res) => {
  try {
    res.json(await listCrmPipeline());
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

app.post("/api/v1/crm/prospects", auth.requireWrite, async (req, res) => {
  try {
    const prospect = await createProspect(req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "crm.prospect.create",
      entityType: "crm_prospect",
      entityId: prospect.id,
      payload: req.body,
    });
    res.status(201).json(prospect);
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

app.post("/api/v1/crm/prospects/:id/activities", auth.requireWrite, async (req, res) => {
  try {
    const prospect = await logProspectActivity(Number(req.params.id), req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "crm.activity.create",
      entityType: "crm_prospect",
      entityId: req.params.id,
      payload: req.body,
    });
    res.status(201).json(prospect);
  } catch (error) {
    const message = String(error?.message || error);
    res.status(message === "Prospect not found" ? 404 : 400).json({ error: message });
  }
});

app.patch("/api/v1/crm/prospects/:id/stage", auth.requireWrite, async (req, res) => {
  try {
    const prospect = await updateProspectStage(Number(req.params.id), req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "crm.prospect.stage_update",
      entityType: "crm_prospect",
      entityId: req.params.id,
      payload: req.body,
    });
    res.json(prospect);
  } catch (error) {
    const message = String(error?.message || error);
    res.status(message === "Prospect not found" ? 404 : 400).json({ error: message });
  }
});

app.get("/api/v1/property/portfolio", auth.requireRead, async (_req, res) => {
  try {
    res.json(await listPropertyManagement());
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

app.post("/api/v1/property/work-orders", auth.requireWrite, async (req, res) => {
  try {
    const workOrder = await createWorkOrder(req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "property.work_order.create",
      entityType: "work_order",
      entityId: workOrder.id,
      payload: req.body,
    });
    res.status(201).json(workOrder);
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

app.patch("/api/v1/property/work-orders/:id", auth.requireWrite, async (req, res) => {
  try {
    const workOrder = await updateWorkOrder(Number(req.params.id), req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "property.work_order.update",
      entityType: "work_order",
      entityId: req.params.id,
      payload: req.body,
    });
    res.json(workOrder);
  } catch (error) {
    const message = String(error?.message || error);
    res.status(message === "Work order not found" ? 404 : 400).json({ error: message });
  }
});

app.get("/api/v1/screening/overview", auth.requireRead, async (_req, res) => {
  try {
    res.json(await listScreeningOverview());
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

app.post("/api/v1/screening/applications", auth.requireWrite, async (req, res) => {
  try {
    const application = await createScreeningApplication(req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "screening.application.create",
      entityType: "screening_application",
      entityId: application.id,
      payload: req.body,
    });
    res.status(201).json(application);
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

app.patch("/api/v1/screening/applications/:id/decision", auth.requireWrite, async (req, res) => {
  try {
    const application = await updateScreeningDecision(Number(req.params.id), req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "screening.application.decision",
      entityType: "screening_application",
      entityId: req.params.id,
      payload: req.body,
    });
    res.json(application);
  } catch (error) {
    const message = String(error?.message || error);
    res.status(message === "Screening application not found" ? 404 : 400).json({ error: message });
  }
});

app.get("/api/v1/admin/operators", auth.requireAdmin, async (_req, res) => {
  try {
    res.json(await auth.listOperators());
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

app.post("/api/v1/admin/operators", auth.requireAdmin, async (req, res) => {
  try {
    const operator = await auth.createOperator(req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "admin.operator.create",
      entityType: "operator",
      entityId: operator.id,
      payload: req.body,
    });
    res.status(201).json(operator);
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

app.patch("/api/v1/admin/operators/:id", auth.requireAdmin, async (req, res) => {
  try {
    const operator = await auth.updateOperator(Number(req.params.id), req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "admin.operator.update",
      entityType: "operator",
      entityId: req.params.id,
      payload: req.body,
    });
    res.json(operator);
  } catch (error) {
    const message = String(error?.message || error);
    res.status(message === "Operator not found" ? 404 : 400).json({ error: message });
  }
});

app.post("/api/v1/admin/operators/:id/reset-password", auth.requireAdmin, async (req, res) => {
  try {
    const operator = await auth.resetOperatorPassword(Number(req.params.id), req.body || {});
    await auth.writeAudit({
      req,
      actor: req.actor,
      action: "admin.operator.password_reset",
      entityType: "operator",
      entityId: req.params.id,
      payload: {
        operator_id: req.params.id,
        revoke_sessions: req.body?.revoke_sessions,
        reset_mfa: req.body?.reset_mfa,
      },
    });
    res.json({ ok: true, operator });
  } catch (error) {
    const message = String(error?.message || error);
    res.status(message === "Operator not found" ? 404 : 400).json({ error: message });
  }
});

app.get("/api/v1/admin/audit-logs", auth.requireAdmin, async (req, res) => {
  try {
    res.json(await auth.listAuditLogs(req.query.limit));
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

app.use(express.static(publicDir));

app.listen(port, host, () => {
  console.log(`RentOut API http://${host}:${port}`);
  if (bootstrapOperator) {
    console.log(`Bootstrap operator created: ${bootstrapOperator.email}`);
  }
});
