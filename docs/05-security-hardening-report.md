# Cooper — Security & Hardening Report

> Scope: the Cooper local-first voice assistant (React 19 + Express 4 SPA, OpenAI Realtime v2 over WebRTC + Responses API). Single user ("Michael"), single shared password, single in-process Node server backed by one JSON file.
>
> Severities in this report are calibrated to what Cooper actually is: a **single-user, local-first** application — not a public, multi-tenant SaaS. Findings are graded by realistic impact in that context, not by checklist maximalism. Every finding is grounded in the verified source brief and confirmed against `server.js` / `src/main.jsx`.

---

## Table of Contents

1. [Executive Risk Summary](#1-executive-risk-summary)
2. [Threat Model](#2-threat-model)
   - [Assets](#21-assets)
   - [Trust Boundaries](#22-trust-boundaries)
   - [Attacker Profiles](#23-attacker-profiles)
3. [Findings Table](#3-findings-table)
4. [Deep Dives](#4-deep-dives-on-top-findings)
   - [F-01 No Login Rate Limiting](#f-01--no-login-rate-limiting--brute-forceable-password)
   - [F-02 Session Secret Defaults to App Password](#f-02--session-secret-defaults-to-the-app-password)
   - [F-03 No CSRF Protection on State-Changing Requests](#f-03--no-csrf-protection-on-state-changing-requests)
   - [F-04 Prompt Injection via Transcript + Custom Prompt](#f-04--prompt-injection-via-transcript--custom-prompt)
   - [F-05 Plaintext Meeting Data at Rest](#f-05--plaintext-transcripts--artifacts-at-rest)
   - [F-06 Secure Cookie Flag Only in Production](#f-06--secure-cookie-flag-only-set-in-production)
5. [Existing Security Strengths](#5-existing-security-strengths)
6. [Remediation Checklist](#6-remediation-checklist)

---

## 1. Executive Risk Summary

Cooper is a **defensively-designed local-first application**. The most security-sensitive decision in the product — never exposing `OPENAI_API_KEY` to the browser — is implemented correctly: the Express server acts as a relay for both the Realtime call mint (`POST /session`) and the Responses API (`createResponse`), and the key never leaves the process. Authentication uses a constant-time password compare and HMAC-signed, `HttpOnly`, `SameSite=Lax` session cookies. Model-generated HTML artifacts are rendered in a `sandbox`ed `<iframe>` that deliberately omits `allow-same-origin`, so generated scripts cannot touch the app origin or its cookies. Markdown is sanitized with DOMPurify before injection. These are the right instincts.

The residual risk is concentrated in **a small number of authentication-hardening and data-at-rest gaps**, none of which are remotely exploitable without first defeating the shared password, and most of which are appropriate to accept-or-defer for a single-user local tool:

- **The single shared password is the entire perimeter, and it is not rate-limited.** An attacker who can reach the server can attempt unlimited guesses (F-01). This is the highest-leverage gap.
- **The session-signing secret defaults to the app password** (`server.js:23`). This couples two secrets that should be independent: a password leak becomes a session-forgery capability, and rotating the password silently invalidates all sessions (F-02).
- **Sensitive meeting transcripts and generated artifacts are stored in plaintext** on local disk with no retention controls (F-05). For a local executive assistant this is the realistic confidentiality concern — it depends entirely on host/disk security.
- **State-changing endpoints have no CSRF token or Origin check** (F-03); `SameSite=Lax` provides meaningful but partial mitigation.
- **Untrusted transcript text is concatenated into model prompts** (F-04); impact is bounded by the iframe sandbox and the absence of tool execution on the Responses path.

**Bottom line:** No critical or remotely-exploitable-without-credentials vulnerabilities were found. The recommended hardening is dominated by two cheap, high-value fixes — add login throttling and require an explicit, independent session secret — plus optional data-at-rest and CSRF defense-in-depth.

```mermaid
quadrantChart
    title Cooper Risk Posture (effort vs. impact)
    x-axis "Low Effort" --> "High Effort"
    y-axis "Low Impact" --> "High Impact"
    quadrant-1 "Plan"
    quadrant-2 "Do First"
    quadrant-3 "Backlog"
    quadrant-4 "Schedule"
    "Login rate limiting": [0.22, 0.85]
    "Explicit session secret": [0.15, 0.72]
    "Encrypt data at rest": [0.6, 0.7]
    "CSRF / Origin check": [0.35, 0.5]
    "Prompt-injection hygiene": [0.45, 0.45]
    "Secure cookie always": [0.18, 0.4]
```

---

## 2. Threat Model

### 2.1 Assets

| Asset | Where it lives | Why it matters |
|-------|----------------|----------------|
| `OPENAI_API_KEY` | Server process env only (`server.js` config, lines 11-25); used as `Authorization: Bearer` to OpenAI | Standing, billable credential. A standing key (not an ephemeral client token) authorizes every Realtime call and Responses request server-side. Leak = unbounded API spend / abuse. |
| `COOPER_APP_PASSWORD` | Server env (`server.js:22`); the sole authentication gate | Single shared credential that protects every API and realtime route. The entire trust perimeter. |
| `COOPER_SESSION_SECRET` | Server env (`server.js:23`), **defaults to the app password** | HMAC key for session-cookie integrity. Knowledge of it enables session forgery. |
| Meeting audio / live transcripts | Audio streamed to OpenAI Realtime; transcripts persisted to `data/cooper.json` | Confidential executive/meeting content. |
| Generated artifacts | `data/artifacts/<uuid>.<md\|html>` (plaintext) + records in `data/cooper.json` | Derived executive briefs, PRDs, plans — sensitive business content. |
| Session cookie `cooper_session` | Browser cookie store; `HttpOnly` | Bearer of authenticated identity. |

### 2.2 Trust Boundaries

```mermaid
flowchart LR
    subgraph Browser["Browser (untrusted client)"]
        UI["React SPA (src/main.jsx)"]
        IFRAME["Sandboxed iframe<br/>(html_prototype render)"]
        RENDER["markdown-it + DOMPurify renderer"]
    end

    subgraph Server["Express process (trusted)"]
        AUTH["Auth middleware<br/>server.js:74-93"]
        RELAY["/session relay<br/>server.js:200-243"]
        RESP["createResponse<br/>server.js:658-703"]
        FS["data/ JSON + artifacts<br/>(plaintext)"]
    end

    OPENAI["OpenAI Realtime v2 + Responses API"]

    UI -- "B1: HTTP(S), cookie auth" --> AUTH
    AUTH --> RELAY
    AUTH --> RESP
    RELAY -- "B2: Bearer OPENAI_API_KEY" --> OPENAI
    RESP -- "B2: Bearer OPENAI_API_KEY" --> OPENAI
    OPENAI -- "B3: model output" --> RENDER
    OPENAI -- "B3: model output (HTML)" --> IFRAME
    RESP --> FS
    FS -. "B4: process <-> filesystem" .-> RESP
```

- **B1 — Browser ↔ Express.** The browser is untrusted. The only gate is the password-derived session cookie checked by the global middleware (`server.js:74-93`). All `/api/*` and `/session` traffic crosses here.
- **B2 — Express ↔ OpenAI.** The server holds and uses `OPENAI_API_KEY`. The key never crosses back toward the browser; the server relays the SDP answer (`/session`, `server.js:200-243`) and model text (`createResponse`, `server.js:658-703`) only.
- **B3 — Model output ↔ Renderer.** OpenAI output is **untrusted data**. Markdown is sanitized via DOMPurify before injection (`src/main.jsx:1588`); HTML prototypes are isolated in a `sandbox` iframe without `allow-same-origin` (`src/main.jsx:1442`).
- **B4 — Process ↔ Filesystem.** Transcripts and artifacts are written in plaintext under `data/`. Artifact reads use a basename `.pop()` (`artifactFileName`, `server.js:873-878`) so directory components are stripped before disk access.

### 2.3 Attacker Profiles

**Attacker WITHOUT the password (network-adjacent / remote-reachable):**
- Can reach `POST /api/auth/login` and attempt to guess the shared password. With **no rate limiting** (F-01), guessing is bounded only by network/CPU throughput.
- Can attempt CSRF against an authenticated user's browser (F-03); `SameSite=Lax` blocks cross-site sub-requests and most cross-origin POSTs, materially reducing this.
- Cannot reach `/session`, `/api/state`, or any data route without a valid signed cookie (`isAuthenticated`, `server.js:954-970`). Cannot read the API key.
- If the password is weak/leaked and `COOPER_SESSION_SECRET` is unset, can **forge session cookies offline** once the password is known (F-02).
- On a local dev deployment served over plain HTTP, can observe the session cookie on the wire because `Secure` is not set outside production (F-06).

**Attacker WITH the password (authorized user, malicious insider, or post-compromise):**
- Has full application capability by design: start calls, read all transcripts/artifacts, enqueue artifact jobs, drive the model. Single shared credential means **no per-user accountability or audit trail** (the codebase is explicitly single-user).
- Can attempt **prompt injection** by seeding malicious transcript text or custom prompts that flow into `buildWorkPrompt` (F-04). Impact is steering artifact *content*; there is no tool execution on the Responses side and HTML output is sandboxed.

**Attacker with host / filesystem access:**
- Reads `OPENAI_API_KEY` from the environment and all meeting data in plaintext from `data/` (F-05). This is outside the application's control and is mitigated only by host security and disk encryption.

---

## 3. Findings Table

Sorted by severity. Locations are `file:line` against the current source. **No Arcade, OAuth, multi-tenant, document-ingestion, or path-traversal-exploit findings are included — those features do not exist in this codebase.**

| ID | Title | Severity | Location | Impact | Remediation |
|----|-------|----------|----------|--------|-------------|
| **F-01** | No login rate limiting / lockout | **High** | `server.js:40-61` (`POST /api/auth/login`) | Single shared password is brute-forceable; the password is the entire perimeter. | Add per-IP throttling + exponential backoff/lockout on failed logins; optional global attempt budget. |
| **F-02** | Session secret defaults to the app password | **High → Med** | `server.js:23`; used by `signPayload` `server.js:980-982` | No key separation: password leak enables offline session forgery; rotating the password silently invalidates all sessions. | Require an explicit, independent, high-entropy `COOPER_SESSION_SECRET`; refuse to start (or warn loudly) if it falls back to the password. |
| **F-03** | No CSRF protection on state-changing POST/PATCH | **Medium** | All mutating routes, e.g. `POST /api/calls` `server.js:280-300`, `PATCH /api/calls/:id` `server.js:302-321`, `POST /api/calls/:id/artifacts` `server.js:371-382` | An attacker page could trigger state changes in an authenticated browser. `SameSite=Lax` (`server.js:55`) gives partial mitigation. | Add a custom-header requirement or `Origin`/`Referer` allowlist check on mutating routes; or a CSRF token. |
| **F-04** | Prompt injection via transcript + custom prompt | **Medium** | `buildWorkPrompt` `server.js:705-745` (full transcript + `customPrompt` concatenated); render at `src/main.jsx:1442` | Untrusted meeting text can steer generated artifact content. Bounded by iframe sandbox and no tool execution on Responses path. | Delimit/label untrusted blocks in the prompt; keep sandbox; treat all output as untrusted (already done for render). |
| **F-05** | Plaintext transcripts & artifacts at rest | **Medium** | `data/cooper.json` (writes `updateDb` `server.js:781-791`); `data/artifacts/<id>.<ext>` (`completeArtifact` `server.js:613-656`) | Sensitive meeting content is unencrypted on disk; no retention/expiry controls. | Encrypt at rest (or rely on full-disk encryption explicitly), add a retention/purge mechanism, document the data footprint. |
| **F-06** | `Secure` cookie flag only set in production | **Medium** | `serializeCookie` calls `server.js:56`, `server.js:67`; flag honored at `server.js:1017` | In dev/local default (`NODE_ENV` ≠ production) the session cookie is sent over plain HTTP and can be sniffed. | Set `Secure` whenever the request is HTTPS; document HTTPS-only for any non-localhost exposure. |
| **F-07** | `html_prototype` iframe allows scripts/popups/modals | **Medium → Low** | `<iframe sandbox="allow-forms allow-modals allow-popups allow-scripts">` `src/main.jsx:1442` | Generated HTML can script, open popups, and show modals — annoyance / redirect surface. Origin-isolated (no `allow-same-origin`), so cookies/app origin are safe. | Tighten sandbox tokens (drop `allow-popups`/`allow-modals` unless needed); consider a sandbox CSP. |
| **F-08** | Single shared credential — no accountability/audit | **Low** | Auth model `server.js:36-93` | No per-user identity; actions are unattributable. Acceptable for a single-user tool. | Accept for single-user; if shared, add per-user accounts + audit logging. |
| **F-09** | SSE broadcasts to all connected clients (no scoping) | **Low** | `GET /api/events` `server.js:250-263`; broadcast on every write | State fan-out to every connected client; harmless single-user, a leak under multi-user. | Scope SSE per session if multi-user is ever introduced. |
| **F-10** | No request logging / metrics / health endpoint; verbose console errors | **Low** | Server-wide (no logging middleware); error paths log to console | No audit/observability; verbose errors could leak internals to console/logs. | Add structured request logging + a `/healthz`; scrub error detail from any client-facing responses. |
| **F-11** | Renderer safety depends on DOMPurify/Mermaid config correctness | **Low** | `DOMPurify.sanitize` `src/main.jsx:1588`; mermaid render `src/main.jsx:1594-1615` | A misconfigured sanitizer or a mermaid render path could become an injection vector. | Pin/lock DOMPurify config, keep deps current, treat mermaid input as untrusted. |

---

## 4. Deep Dives on Top Findings

### F-01 — No login rate limiting → brute-forceable password

**Location:** `POST /api/auth/login`, `server.js:40-61`.

The login handler is well-built in one respect — it uses `safeCompare` (`server.js:984-991`), which length-checks then `timingSafeEqual`s, so it is **constant-time** and not timing-oracle-exploitable. But there is no counter, no delay, and no lockout around it. Each request is an independent, unthrottled guess:

```js
// server.js:46
if (!safeCompare(cleanText(req.body?.password), appPassword)) {
  res.status(401).json({ error: "Invalid password." });
  return;
}
```

Because the shared password is the **entire** authentication perimeter (every `/api/*` and `/session` route depends on it via the middleware at `server.js:74-93`), the strength of the whole system collapses to: *password entropy × guess rate*. With no throttle, an attacker who can reach the port can attempt guesses as fast as the server will answer.

**Why High (in context):** For a tool bound to localhost only, exposure is limited — but the moment Cooper is reachable on a LAN, a tunnel, or any forwarded port, this becomes the single most likely path to full compromise, including read access to all meeting transcripts and the ability to spend the OpenAI key via artifact jobs.

**Remediation:**
- Per-IP failed-attempt counter with exponential backoff and a temporary lockout (e.g. 5 failures → increasing delay).
- A global failed-attempt budget as a backstop against distributed guessing.
- Enforce a minimum password length/entropy at startup.

```mermaid
sequenceDiagram
    participant A as Attacker
    participant E as Express /api/auth/login
    loop Unbounded today
        A->>E: POST {password: guess}
        E->>E: safeCompare (constant-time, but always answers)
        E-->>A: 401 (no delay, no lockout)
    end
    Note over A,E: Fix = throttle + backoff + lockout here
```

### F-02 — Session secret defaults to the app password

**Location:** `server.js:23`, consumed by `signPayload` (`server.js:980-982`) and `isAuthenticated` (`server.js:954-970`).

```js
// server.js:23
const sessionSecret = process.env.COOPER_SESSION_SECRET || appPassword;
```

The HMAC-SHA256 session signature is the integrity guarantee for the `cooper_session` cookie. When `COOPER_SESSION_SECRET` is unset, that signing key **is** the app password. Two distinct security properties get fused:

1. **No key separation.** Anyone who learns the password also holds the signing key and can mint valid session cookies offline — without ever hitting the (constant-time) login endpoint. The password compromise upgrades from "can log in" to "can forge arbitrary sessions, including arbitrarily long-lived ones if `exp` is chosen freely."
2. **Coupled lifecycle.** Rotating the password to recover from a leak also rotates the signing key, silently invalidating every outstanding session. Operationally surprising and a disincentive to rotate.

**Why High → Med:** High in principle (key reuse), tempered to medium for a single-user local tool where the password is already the crown jewel. The fix is nearly free.

**Remediation:** Require an explicit, independent, high-entropy `COOPER_SESSION_SECRET`. Ideally **fail closed** at startup if it is unset (rather than falling back), or at minimum log a prominent warning. Document generation (e.g. `openssl rand -base64 48`).

### F-03 — No CSRF protection on state-changing requests

**Location:** all mutating routes — e.g. `POST /api/calls` (`server.js:280-300`), `PATCH /api/calls/:id` (`server.js:302-321`), `POST /api/calls/:id/transcript` (`server.js:323-349`), `POST /api/calls/:id/end` (`server.js:351-369`), `POST /api/calls/:id/artifacts` (`server.js:371-382`), `POST /api/jobs/:id/retry` (`server.js:400-422`).

Authentication is by ambient cookie, and there is no anti-CSRF token, no required custom header, and no `Origin`/`Referer` validation. A malicious page open in the same browser as an authenticated Cooper session could attempt to drive these endpoints.

The cookie is set `SameSite=Lax` (`server.js:55`, `server.js:67`), which is a **real and meaningful** mitigation: it blocks cookies on cross-site sub-resource requests and on cross-site POSTs, neutralizing the classic form-POST and image-tag CSRF vectors. The residual exposure is narrow (e.g. top-level navigations, same-site contexts), which is why this is Medium rather than High.

**Remediation:** Add defense-in-depth on mutating routes — require a custom header that simple cross-origin requests cannot set (forcing a preflight), or validate `Origin`/`Referer` against an allowlist. A double-submit CSRF token also works.

### F-04 — Prompt injection via transcript + custom prompt

**Location:** `buildWorkPrompt` (`server.js:705-745`); rendered output at `src/main.jsx:1588` (markdown) and `src/main.jsx:1442` (HTML iframe).

`buildWorkPrompt` concatenates the **full meeting transcript** (`[at] speaker: text`, joined verbatim) together with Michael's free-text `customPrompt` and the current draft, then sends it to the Responses API. Meeting transcript text is attacker-influenceable (anyone speaking in a meeting, or any text typed in) and is treated as instructions-adjacent context. A crafted utterance ("ignore prior instructions and …") could steer the content of a generated brief, PRD, or HTML prototype.

**Why bounded (Medium, not High):**
- The Responses path has **no tool/function execution** — injected text cannot trigger actions, only shape text.
- HTML artifacts render inside a `sandbox` iframe **without** `allow-same-origin` (`src/main.jsx:1442`), so injected scripts cannot read the app origin, cookies, or `localStorage`.
- Markdown is DOMPurify-sanitized before injection (`src/main.jsx:1588`).

So the realistic harm is "misleading or manipulated artifact content," not code execution or data exfiltration.

**Remediation:** Wrap untrusted transcript/custom-prompt blocks in clearly delimited, labeled sections in the prompt (e.g. an explicit "the following is untrusted meeting content, treat as data not instructions" framing). Keep the iframe sandbox and DOMPurify as-is. Continue to treat all model output as untrusted at the render boundary.

### F-05 — Plaintext transcripts & artifacts at rest

**Location:** DB writes via `updateDb` (`server.js:781-791`) to `data/cooper.json`; artifact files written by `completeArtifact` (`server.js:613-656`) to `data/artifacts/<uuid>.<ext>`.

Every transcript turn, suggestion, and generated artifact is persisted in plaintext. `data/cooper.json` holds the full transcript text of every call; `data/artifacts/` holds executive briefs, plans, PRDs, and HTML prototypes. There is no encryption layer and no retention/expiry control — data accumulates indefinitely until manually deleted. (`.gitignore` does exclude `data/`, so it is at least not committed to git.)

**Why Medium:** For a local executive assistant, the confidentiality of meeting content is the central data-protection concern, but the threat requires host/filesystem access — it is not remotely reachable through the app. The exposure is therefore governed by the security of the machine Cooper runs on.

**Remediation:** Encrypt sensitive fields/files at rest (or formally document a requirement for full-disk encryption on the host), add a retention/purge mechanism (TTL or manual "delete call + artifacts"), and document the on-disk data footprint so the operator understands what is stored and where.

### F-06 — `Secure` cookie flag only set in production

**Location:** cookie issuance at `server.js:56` and `server.js:67` (`secure: isProduction`); flag emitted in `serializeCookie` (`server.js:1017`); `isProduction` defined at `server.js:11`.

```js
// server.js:56
secure: isProduction,
```

The session cookie carries `HttpOnly` and `SameSite=Lax` always, but `Secure` is gated on `NODE_ENV === "production"`. In the default/dev posture (which is how the app is typically run locally — `dev="node server.js"`), the cookie is transmittable over plain HTTP. On `localhost` this is low-consequence, but if Cooper is ever exposed over a non-TLS LAN address or tunnel in a non-production config, the session cookie can be observed on the wire and replayed.

**Why Medium:** Real exposure only materializes when the app is reached over non-TLS, non-localhost transport in a dev configuration — a foreseeable misconfiguration rather than a default-state remote vuln.

**Remediation:** Set `Secure` whenever the connection is HTTPS (detect via `req.secure` / `X-Forwarded-Proto`) rather than tying it to `NODE_ENV`; and document that any non-localhost exposure must be HTTPS-only.

---

## 5. Existing Security Strengths

Cooper gets the high-leverage decisions right. These should be preserved through any refactor:

- **API key is never exposed to the client.** The server relays both the Realtime call mint (`POST /session`, `server.js:200-243`) and the Responses API (`createResponse`, `server.js:658-703`) using a server-side `Authorization: Bearer`. The browser never sees `OPENAI_API_KEY`.
- **Constant-time password comparison.** `safeCompare` (`server.js:984-991`) length-checks then `timingSafeEqual`s, eliminating timing side channels on login.
- **Integrity-protected sessions.** Cookies are HMAC-SHA256 signed (`signSession`/`signPayload`, `server.js:972-982`) and verified before the expiry check (`isAuthenticated`, `server.js:954-970`).
- **Sensible cookie flags.** `HttpOnly` + `SameSite=Lax` + scoped `Path=/` with a TTL-bounded `Max-Age` (`serializeCookie`, `server.js:1012-1020`).
- **Artifact path-traversal mitigated.** `artifactFileName` (`server.js:873-878`) takes `.pop()` of the split path, stripping any directory components before the disk read in `GET /api/artifacts/:id/content` (`server.js:384-398`).
- **HTML output is origin-isolated.** The `html_prototype` iframe uses `sandbox` **without** `allow-same-origin` (`src/main.jsx:1442`), so generated scripts cannot access the app origin, cookies, or storage.
- **Markdown is sanitized.** `markdown-it` output is run through `DOMPurify.sanitize` before injection (`src/main.jsx:1588`).
- **Cooper is silent by default.** `create_response:false` in `baseSession` (`server.js:116-141`) means the assistant does not auto-respond to VAD turns — reducing unintended model invocation on ambient audio.
- **Job crash recovery + write serialization.** Boot resets `running` jobs to `queued` (`server.js:1063-1090`); all DB writes are serialized through the `writeQueue` promise chain (`updateDb`, `server.js:781-791`), avoiding intra-process write interleaving.

---

## 6. Remediation Checklist

**Do first (cheap, high value):**

- [ ] **F-01** Add per-IP failed-login throttling with exponential backoff + temporary lockout on `POST /api/auth/login` (`server.js:40-61`).
- [ ] **F-02** Require an explicit, independent `COOPER_SESSION_SECRET`; fail closed (or warn loudly) if it falls back to the app password (`server.js:23`).
- [ ] **F-06** Set the cookie `Secure` flag based on actual HTTPS (`req.secure`/`X-Forwarded-Proto`) instead of `NODE_ENV` (`server.js:56`, `server.js:67`); document HTTPS-only for non-localhost exposure.

**Schedule (moderate effort):**

- [ ] **F-03** Add `Origin`/`Referer` allowlist or required custom-header check on all mutating routes (`server.js:280-422`).
- [ ] **F-05** Encrypt meeting data at rest (or formally require host full-disk encryption) and add a retention/purge mechanism for `data/cooper.json` and `data/artifacts/`.
- [ ] **F-04** Delimit and label untrusted transcript/custom-prompt blocks inside `buildWorkPrompt` (`server.js:705-745`).

**Plan / defense-in-depth:**

- [ ] **F-07** Tighten the `html_prototype` iframe sandbox tokens (`src/main.jsx:1442`) — drop `allow-popups`/`allow-modals` unless required.
- [ ] **F-10** Add structured request logging and a `/healthz` endpoint; scrub internal detail from client-facing error responses.
- [ ] **F-11** Pin/lock the DOMPurify config and keep DOMPurify/markdown-it/mermaid dependencies current.

**Accept (appropriate for single-user local scope) — revisit only if Cooper becomes multi-user/networked:**

- [ ] **F-08** Single shared credential / no per-user audit — accepted; add accounts + audit logging only if shared.
- [ ] **F-09** SSE broadcasts to all clients (`server.js:250-263`) — accepted single-user; scope per-session if multi-user is introduced.

---

*This report documents only weaknesses present in the actual Cooper source. There is no Arcade integration, no OAuth, no multi-tenant/multi-user system, no external database, no document ingestion, and no exploitable path-traversal vulnerability in this codebase; such items were deliberately excluded.*
