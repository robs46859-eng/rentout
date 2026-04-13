# RentOut Launch Audit

Date: 2026-04-13

## Current operational posture

The suite now has a real internal-ops auth foundation:

- operator accounts in the database
- password hashing
- session persistence
- TOTP MFA with recovery codes
- password rotation and admin reset flows
- role checks
- audit logs on auth events and all write routes

That is a meaningful step toward launch-readiness. It replaces the previous static token model.

## What ships now

- Express API plus static dashboard
- dual database runtime:
  - SQLite for local development
  - Postgres via `DATABASE_URL` for production
- operator auth:
  - `operators`
  - `auth_sessions`
  - `auth_login_challenges`
  - `audit_logs`
- property-management surface:
  - assets
  - units
  - leases
  - work orders
- CRM surface:
  - prospects
  - activities
  - stage progression
- screening surface:
  - policies
  - applications
  - decision reasons
- optional market and demographic enrichment
- Render blueprint in `render.yaml`

## What is now real and launch-relevant

- Password login and server-side session validation
- MFA enrollment, MFA-gated login challenges, and recovery-code fallback
- Role-based protection of read/write/admin routes
- Auditability of operator actions
- Operator-admin UI and audit-log UI in the dashboard
- Property operations with actual work-order state
- Screening criteria stored as policy rows instead of one-off flags
- Production-ready database direction for Render

## What still blocks a full public launch

- No first-party account recovery flow
- No email-based password reset or identity proofing flow
- No permission scoping below coarse roles
- No tenant/resident identity layer
- No PMS sync
- No external screening integration
- No alerting or structured observability stack
- No immutable compliance review workflow for adverse action decisions

## Recommended next platform moves

1. Add first-party password recovery and forced-rotation policy enforcement.
2. Add PMS ingestion and background jobs.
3. Add external screening vendor integration and adverse-action workflow.
4. Add monitoring, error tracking, and deployment health checks beyond `/api/health`.
5. Add finer-grained permissions for leasing, maintenance, and compliance operators.
