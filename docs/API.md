# API Reference

Base URL: `/api`. Auth is a session cookie (`voicepilot_session`) set by
signin/signup; every route below is authenticated unless noted. Tenant-scoped
routes resolve the org/workspace via `withWorkspace` (403 if you're not a
member). Roles: `owner` | `admin` | `member`; write routes generally require
`owner`/`admin`. Errors are `{"error": "message"}` with an appropriate status.
See TROUBLESHOOTING.md for rate-limit details.

## Auth

| Method | Route | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/signup` | none | `{email, password (≥8), name?, orgName?}` — creates user + org (owner) + "Main business" workspace + mock provider config | `201 {user, org, workspace}` + session cookie. Rate-limited 10/min |
| POST | `/api/auth/signin` | none | `{email, password}` | `200 {user, orgs:[{id,name,planKey,role}]}` + session cookie. 401 on bad creds. Rate-limited 10/min |
| POST | `/api/auth/signout` | cookie | — | `200 {ok:true}`, destroys session, clears cookie |
| GET | `/api/auth/me` | cookie | — | `200 {user, orgs:[{id,name,planKey,workspaces:[{id,name,category,timezone}], role}]}` |

## Orgs & workspaces

| Method | Route | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/orgs` | user | — | `200 {orgs:[{id,name,role,plan:{key,name}}]}` |
| POST | `/api/orgs` | user | `{name}` | `201 {org:{id,name,planKey}}` (creator = owner, plan `free`). Rate-limited 10/min |
| GET | `/api/orgs/[orgId]/audit` | org `owner`/`admin` | `?limit=` (1–200, default 100) | `200 {logs:[...]}` |
| GET | `/api/orgs/[orgId]/workspaces` | org member | — | `200 {workspaces:[{id,name,category,timezone,createdAt}]}` |
| POST | `/api/orgs/[orgId]/workspaces` | org `owner`/`admin` | `{name, category?, timezone?}` — category ∈ `general,home-services,healthcare,real-estate,restaurant,salon,education,sales,ecommerce,support,receptionist`. Plan `maxWorkspaces` enforced | `201 {workspace}`. Rate-limited 20/min |

## Templates

| Method | Route | Auth | Response |
|---|---|---|---|
| GET | `/api/templates` | user | `200 {templates:[{key,name,category,description}]}` — the 10 system templates |

## Agents

| Method | Route | Auth | Body / params | Response |
|---|---|---|---|---|
| GET | `/api/workspaces/[wsId]/agents` | workspace member | — | `200 {agents:[{id,name,status,templateKey,updatedAt,createdAt}]}` |
| POST | `/api/workspaces/[wsId]/agents` | `owner`/`admin` | `{name, config?, templateKey?}` — plan `maxAgents` enforced | `201 {agent:{id,name,status}}`. Rate-limited 30/min |
| POST | `/api/workspaces/[wsId]/agents/from-template` | `owner`/`admin` | `{templateKey, name?, businessName?}` — plan `maxAgents` enforced | `201 {agent}` (config = template defaults). Rate-limited 30/min |
| GET | `/api/workspaces/[wsId]/agents/[agentId]` | workspace member | — | `200 {agent}` (full config) |
| PATCH | `/api/workspaces/[wsId]/agents/[agentId]` | `owner`/`admin` | `{name?, config?, status?}` — status ∈ `draft,published,archived`; config merged via `mergeAgentConfig` | `200 {agent:{id,name,status}}` |
| POST | `/api/workspaces/[wsId]/agents/[agentId]/publish` | `owner`/`admin` | — | `200 {agent:{id,name,status}}` — validates first; fails unless businessName, agentName, greeting, closing, ≥1 language, and sane length/slot settings are present |
| DELETE | `/api/workspaces/[wsId]/agents/[agentId]` | `owner`/`admin` | — | `200` (call logs cascade) |

## Simulated calls

| Method | Route | Auth | Body / params | Response |
|---|---|---|---|---|
| POST | `/api/workspaces/[wsId]/simulate` | workspace member | `{agentId, callerScript:[strings] (1–40), callerName?, callerPhone?, direction? ("inbound"\|"outbound"), doNotCall?, hasConsent?, recordingAnswer? ("yes"\|"no")}` | `201 {callId, result:{status, transcript, summary, outcome, durationSec, costEstimateUsd, isSimulated:true, aiDisclosed, recordingConsent, toolAudit, blocked?}}`. Also writes `CallLog` + `UsageRecord` + audit `call.simulated`. Rate-limited 60/min |
| GET | `/api/workspaces/[wsId]/calls` | workspace member | `?limit=` (1–100, default 25), `?direction=inbound\|outbound`, `?agentId=` | `200 {calls:[{id,agent:{id,name},direction,status,startedAt,durationSec,outcome,costEstimateUsd,isSimulated}], total}` |
| GET | `/api/workspaces/[wsId]/calls/[callId]` | workspace member | — | `200 {call}` — full transcript, summary, outcome, compliance flags |
| GET | `/api/workspaces/[wsId]/usage` | workspace member | — | `200 {period:"YYYY-MM", usage:{minutes,calls,providerCost}, plan:{key,name,priceMonthlyUsd,includedMinutes,overagePerMinUsd,maxWorkspaces,maxAgents}, percentUsed, alert:"ok"\|"warning"\|"hard-limit", statusCounts}` |

## Knowledge base

| Method | Route | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/workspaces/[wsId]/knowledge` | workspace member | — | `200 {sources:[{id,type,title,content,status,errorMessage,createdAt,updatedAt}]}` |
| POST | `/api/workspaces/[wsId]/knowledge` | `owner`/`admin` | `{type:"faq"\|"text"\|"document"\|"url", title, content}` — max 200k chars. `url` sources are stored with `status:"not-implemented"` (URL ingestion does not exist) | `201 {source}`. Rate-limited 30/min |
| DELETE | `/api/workspaces/[wsId]/knowledge/[id]` | `owner`/`admin` | — | `200 {ok:true}` |

## Providers

| Method | Route | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/workspaces/[wsId]/providers` | workspace member | — | `200 {providers:[{provider,enabled,isLive,hasCredentials}], guides:[...setup guides with pricing/terms notes...]}` |
| POST | `/api/workspaces/[wsId]/providers/[provider]/setup` | `owner`/`admin` | `[provider]` ∈ `mock,twilio,vapi,retell,deepgram`. `{credentials?, enabled?, enableLive?, confirmLive?}` — credentials validated against the setup guide, AES-GCM encrypted at rest. `isLive` requires **both** `enableLive:true` and `confirmLive:true` | `200 {provider,enabled,isLive,hasCredentials, warning?}` — warning notes live calls stay disabled until Phase 2. Rate-limited 20/min |

> There are **no webhook routes** in this prototype. `parseInboundWebhook` on the
> mock telephony provider returns `null`; see WEBHOOKS.md.

## Admin (platform)

Requires `isPlatformAdmin` (seeded: `admin@voicepilot.local`).

| Method | Route | Response |
|---|---|---|
| GET | `/api/admin/health` | `200 {health:{users,orgs,totalCalls,failedCalls,liveProviderConfigs,telephonyMode:"simulated-only",db:"ok"}, recentErrors}` |
| GET | `/api/admin/orgs` | `200 {orgs:[{id,name,plan,workspaces,members,createdAt,minutesThisPeriod}]}` |
| GET | `/api/admin/users` | `200 {users:[{id,email,name,isPlatformAdmin,createdAt,membershipCount}]}` — password hashes never exposed |
| GET | `/api/admin/audit?limit=` | `200 {logs:[...]}` across all orgs |
