# Claude Opus 5 execution prompt

## Local repository layout

Run Claude Code from the `atlaslabs` directory. The parent directory is expected
to have this exact layout:

```text
reference projects/
├── afreka/          # read-only reference
├── atlaslabs/       # only writable target
├── manycat/         # read-only reference
└── minimachines/    # read-only reference
```

From the `reference projects` directory:

```bash
cd atlaslabs
claude --model opus \
  --add-dir ../afreka \
  --add-dir ../manycat \
  --add-dir ../minimachines
```

Confirm that the active model is Claude Opus 5 before beginning implementation.
Keep `Atlas-Labs-Product-Spec.md` in the `atlaslabs` repository root so Claude
can read it throughout the build.

## Add Ponytail to Claude Code

In Claude Code, send these as two separate messages:

```text
/plugin marketplace add DietrichGebert/ponytail
```

```text
/plugin install ponytail@ponytail
```

Start a fresh Claude Code session from `atlaslabs`, then activate Ponytail:

```text
/ponytail full
```

Use `/ponytail-review` before final handoff. Ponytail means minimal,
production-quality implementation: reuse what already exists, prefer native
platform behavior and installed dependencies, and write only the code the
specified product needs. It must never be used to remove authorization,
validation, error handling, data-loss protection, security controls,
accessibility, observability, or tests at trust boundaries.

## Prompt to paste into Claude Opus 5

```text
You are the lead product engineer responsible for building Atlas Labs.

Your working directory is the Atlas target repository:

  .

Three sibling repositories are available only as reference codebases:

  ../manycat
  ../minimachines
  ../afreka

Read ./Atlas-Labs-Product-Spec.md completely before making changes. Treat the
entire specification below this execution prompt as binding product and
engineering requirements.

MISSION

Build out Atlas Labs as an independent, working product:

- a prompt-first Atlas homepage and chat application;
- personal and Atlas Group workspaces;
- collaborative specialist creation and operation;
- an Atlas CLI derived from useful Minimachines interaction patterns;
- safe source connection and synchronization;
- versioned specialists, corrections, evaluations, runs and deployments;
- scoped APIs through which approved specialists can be invoked;
- independent Docker-based local infrastructure and Kubernetes-ready
  production packaging.

Atlas is the only product being built. Manycat, Minimachines and Afreka are
examples to learn from, not services Atlas may depend on.

WRITE BOUNDARY

You may create and modify files only inside the current Atlas repository (`.`).
Treat ../manycat,
../minimachines and ../afreka as read-only, even if filesystem permissions
would allow changes. Do not run formatting, migrations, generators, package
installation or other mutating commands in the reference repositories.

Do not copy or reuse any .env value, credential, private key, certificate,
account identifier, OAuth application, database, bucket, queue, cluster,
registry, deployment target, domain configuration or production endpoint from
a reference project.

Atlas must receive fresh configuration:

- generate new local-only development secrets where safe;
- put non-secret defaults and placeholders in .env.example;
- document every external key the operator must create;
- never fabricate real third-party credentials;
- keep development, staging and production configuration separate;
- ensure no reference repository is needed to build, test, run or deploy Atlas.

REFERENCE AUDIT

Before implementation, inspect the target and all three references. Read their
package manifests, directory structures, relevant schemas, API surfaces,
authentication, UI patterns, CLI implementation, runtime orchestration,
ingestion and provenance code, tests and deployment files.

Write docs/reference-audit.md inside Atlas containing:

1. patterns worth reimplementing from each repository;
2. patterns that conflict with the Atlas spec and must not be copied;
3. security or coupling risks;
4. the smallest implementation approach for Atlas;
5. an explicit statement that all reference repositories remain read-only and
   Atlas has no runtime dependency on them.

Do not perform a blind merge or wholesale copy. Reimplement only what Atlas
needs, following Atlas naming, types, authorization and architecture.

IMPLEMENTATION METHOD

Use Ponytail in full mode. First understand the actual code paths, then choose
the smallest correct change. Prefer:

1. an existing target-repository implementation;
2. the standard library;
3. native framework behavior;
4. an already-installed dependency;
5. a small direct implementation;
6. a new dependency only when it materially reduces risk or complexity.

Preserve the existing Atlas stack unless a verified incompatibility requires a
change:

- Next.js App Router;
- TypeScript;
- Tailwind CSS;
- shadcn/ui;
- tRPC;
- Drizzle ORM;
- PostgreSQL;
- pnpm;
- ESLint and Prettier.

Do not replace the application scaffold, introduce speculative services, build
the public marketplace, or create abstractions for hypothetical providers.
Keep replaceable boundaries for model inference, runtime execution, object
storage and background jobs, but begin with one working implementation of each.

Build in end-to-end vertical slices rather than completing isolated layers.
The priority path is:

1. authentication;
2. personal workspace and Atlas Group;
3. role-enforced membership;
4. specialist creation from Atlas Chat;
5. source connection through Atlas CLI;
6. specialist run with streamed status;
7. correction promoted into an example or evaluation;
8. versioned evaluation;
9. deployment of an approved specialist version;
10. invocation through a scoped service key.

FIRST DELIVERABLE

Before broad implementation, make one complete Architecture Reviewer flow
work:

- a user creates the “Atlas Labs Engineering” group;
- the user invites a Builder and an Operator;
- the group creates an Architecture Reviewer specialist in chat;
- Atlas CLI links an approved local repository;
- excluded files and likely secrets are rejected by default;
- the specialist performs a review in an isolated run;
- a Builder corrects the result and promotes the correction into an evaluation;
- a new specialist version runs the evaluation;
- the approved version is deployed;
- a scoped API key invokes it asynchronously;
- the audit log attributes every sensitive action.

AUTHORIZATION AND PRIVACY

Group ownership is a hard data boundary. Centralize authorization checks and
test cross-group denial. Hiding UI is not authorization.

Personal memory must never enter a group automatically. Any promotion from
personal to group context must show the exact source, scope and retention
behavior and require an explicit action.

All model, source, prompt, specialist, tool and policy versions used by a run
must be traceable. Customer content must not be treated as shared training data
by default. Corrections become memory, examples, evaluations or training data
only through an explicit promotion action.

LOCAL AND DEPLOYMENT ENVIRONMENTS

Create or complete:

- docker-compose.yml for PostgreSQL, a Redis-compatible queue/cache and
  S3-compatible local object storage;
- a production multi-stage Dockerfile;
- database migrations and seed data for the acceptance scenario;
- health and readiness endpoints;
- Kubernetes-ready manifests or a minimal Helm chart only after the local
  vertical slice works;
- documented fresh environment variables;
- scripts for local setup, migration, seed, development, testing and build.

Production PostgreSQL and object storage must be external managed services.
Kubernetes must run stateless control-plane services and isolated jobs/runtimes;
do not bind domain identities directly to pod names.

WORKING RULES

- Inspect git status before editing and preserve unrelated user changes.
- Read repository-specific instructions completely.
- Do not modify the sibling references.
- Do not expose secrets in output, logs, fixtures or commits.
- Do not use destructive git commands.
- Do not stop after writing a plan. Continue implementing the highest-priority
  unblocked vertical slice.
- Ask a question only when a missing decision would materially change the
  product, authorization model, destructive action or external cost.
- When an external credential is unavailable, implement the interface, local
  substitute and .env.example entry, document the blocker, then continue with
  independent work.
- Keep a concise docs/implementation-status.md containing completed work,
  validation results, remaining work and blockers.
- Do not claim a command passed unless you ran it and saw it pass.

VALIDATION

At each stable checkpoint run the relevant:

- pnpm install;
- formatter check;
- ESLint;
- TypeScript checking;
- unit and integration tests;
- database migration against the local container;
- production build;
- authorization and cross-group isolation tests;
- secret scanning of the changed files.

Before handoff:

1. run /ponytail-review and remove unnecessary code without weakening safety;
2. run the complete validation suite;
3. test the documented clean-start workflow;
4. report exactly what works;
5. list any missing external credentials or incomplete phases;
6. provide the commands needed to run Atlas locally.

Begin by inspecting the current Atlas repository and the three read-only sibling repositories,
then write docs/reference-audit.md and implement the first end-to-end vertical
slice.
```

---

# Atlas Labs Product and Implementation Specification

## 1. Product definition

### One-line description

Atlas lets people and teams turn their private knowledge and working methods into collaborative specialist AI workspaces that can be used through chat, a CLI, and scoped APIs.

### Core thesis

General-purpose models are broadly capable but do not naturally understand a specific person, organization, codebase, operating procedure, or domain. Atlas provides the missing layer:

1. Connect the knowledge and tools relevant to a job.
2. Create a persistent specialist workspace around that job.
3. Let a person or Atlas Group improve the specialist through normal work and explicit corrections.
4. Evaluate and version the specialist.
5. Expose the approved capability through chat, CLI, or an API.

At launch, a “specialist” is not necessarily a newly trained model. It is a versioned system consisting of:

- a selected base model;
- instructions and operating policies;
- approved knowledge sources;
- private memory;
- tools and scoped credentials;
- examples and corrections;
- evaluations and acceptance thresholds;
- an isolated runtime;
- an optional typed API contract.

Fine-tuned adapters or small specialist models can be added later when there is enough authorized training data and a measurable performance or cost advantage.

### Positioning

**Primary message:** Build an AI that understands how you work.

**Supporting message:** Create it in chat. Connect your work through the Atlas CLI. Collaborate in an Atlas Group. Use the resulting specialist through an API.

**Long-term message:** Atlas is the operating system and distribution layer for specialist intelligence.

## 2. Product boundaries

### Atlas is

- A chat-first application for creating and operating specialists.
- A collaborative workspace with explicit group ownership and permissions.
- A CLI that connects local projects, documents, tools, and workflows.
- A private runtime for long-running specialist work.
- A versioned evaluation and improvement system.
- A gateway for publishing approved specialist capabilities as APIs.
- Eventually, a marketplace for intentionally published datasets and specialists.

### Atlas is not

- A generic ChatGPT clone.
- A marketplace-first product at launch.
- A promise to train new model weights for every user immediately.
- A system that silently converts personal memory into organizational knowledge.
- A wrapper that gives a model unrestricted access to a laptop, repository, or company network.
- A deployment that shares databases, credentials, infrastructure, or production resources with the reference projects.

## 3. Reference repositories

The implementation agent will run from `reference projects/atlaslabs` with
`../manycat`, `../minimachines`, and `../afreka` granted as additional working
directories. The sibling repositories are reference implementations only.

### Hard isolation rule

Create Atlas as a new project with new infrastructure and new credentials. Do not assume any reference repository remains available at runtime.

Do not:

- connect Atlas to an existing reference-project database;
- copy `.env` files, tokens, private keys, certificates, account IDs, webhook secrets, or deployment configuration;
- reuse production buckets, queues, clusters, domains, registries, billing accounts, OAuth applications, or API keys;
- depend on unpublished packages from a reference repository;
- preserve reference-project identifiers in the Atlas database;
- make Atlas deployments call reference-project production APIs;
- assume matching schemas, authentication models, or infrastructure providers.

The agent may inspect the repositories to understand successful patterns and may reimplement or adapt code when appropriate, but Atlas must compile, run, test, and deploy independently.

### What to learn from each reference

#### Manycat

Use as a reference for:

- chat and room interaction patterns;
- collaborative workspaces;
- projects and workflows as first-class objects;
- streaming agent activity;
- human review, approval, and correction;
- friendly representations of persistent AI teammates;
- mobile-friendly notifications and asynchronous work.

Do not import Manycat’s social feed, public-video concept, consumer identity, or cat branding into the Atlas MVP.

#### Minimachines

Use as a reference for:

- CLI authentication and device pairing;
- remote workspace provisioning;
- file synchronization and upload;
- command execution, logs, and status;
- resumable long-running jobs;
- agent-to-cloud handoff;
- live endpoints and API exposure;
- notification and wait-for-human patterns.

Minimachines branding must not appear in Atlas. Reimplement the relevant runtime and CLI concepts under Atlas-owned namespaces and fresh infrastructure.

#### Afreka

Use as a reference for:

- source ingestion and dataset creation;
- provenance and consent records;
- verification and quality-review workflows;
- annotation tasks;
- versioned datasets;
- contributor and reviewer separation;
- delivery of trustworthy ground-truth data.

The Atlas MVP does not need to recreate Afreka’s entire contributor network. It should preserve the data model required to add human collection and verification workflows later.

## 4. Target users

### Initial user

A technical team with proprietary knowledge that repeatedly performs a specialized task, such as:

- reviewing changes against an internal software architecture;
- researching accounts using a company-specific process;
- triaging support cases using internal policies;
- monitoring operations using private and third-party data;
- preparing structured reports from a repeatable domain workflow.

### Secondary user

An individual expert who wants to create a private specialist around personal knowledge, methods, preferences, or creative work, while controlling what can be shared.

### Initial wedge

The first shipped templates should favor developer and research workflows because the CLI can connect repositories and documents, the output is objectively testable, and the specialist can be consumed immediately through an API.

The platform architecture must remain domain-neutral.

## 5. Core product objects

### User

An authenticated person with a private Atlas account.

### Atlas Group

A shared ownership and permission boundary for a team or organization. A group owns its specialists, sources, threads, evaluations, deployments, API keys, usage, and audit history.

### Membership

Connects a user to a group with one of these roles:

- **Owner:** billing, deletion, membership, security, and all administrative actions.
- **Builder:** sources, tools, prompts, evaluation suites, specialist versions, and deployments.
- **Operator:** chat, approved tools, runs, and existing workflows.
- **Viewer:** read-only access to permitted conversations, outputs, and audit events.

### Workspace

The persistent environment containing chat threads, files, sources, runs, artifacts, and specialist configuration. A workspace is either personal or group-owned.

### Specialist

A named, versioned capability designed for a specific job. Examples:

- Architecture Reviewer
- Contract Redline Specialist
- Account Researcher
- Supply-Chain Monitor

Every specialist must declare:

- name and purpose;
- owner workspace;
- allowed users or roles;
- base-model policy;
- source collection;
- memory policy;
- tool grants;
- execution limits;
- evaluation suite;
- output schema;
- API publication state;
- current version and lifecycle state.

### Source

A connected repository, document collection, dataset, URL, manual note, uploaded file, API, or database view. Sources must record provenance, owner, access scope, ingestion method, retention policy, and version.

### Correction

An explicit human signal attached to an output or action:

- accepted;
- rejected;
- edited;
- preferred alternative;
- policy violation;
- missing context;
- reusable instruction.

Corrections do not automatically become training data. The user or group must approve promotion into memory, examples, evaluations, or an authorized training dataset.

### Evaluation suite

A versioned collection of cases used to determine whether a specialist is ready for use or deployment. Results must be attributable to a specialist version, model configuration, source snapshot, and tool policy.

### Runtime

The isolated compute environment where a specialist performs long-running or tool-using work. Runtime identity, files, credentials, network rules, status, cost, and lifecycle must be recorded.

### Deployment

An immutable specialist version exposed as an internal service or API.

## 6. Main user experience

### Public homepage

The front page at `atlaslabs.id` is centered on one prompt box:

> What should your Atlas become an expert in?

Example placeholder prompts:

- Learn our architecture and review every pull request.
- Turn our research process into an account intelligence specialist.
- Build a support specialist from our policies and resolved tickets.
- Monitor these suppliers and explain changes that matter.

The visual direction is an original frontier-lab aesthetic: Inter typography, warm neutral space, restrained controls, and slowly animated cosmic-fabric or watercolor backgrounds. It should feel serious, private, and alive rather than like a generic SaaS dashboard.

Primary actions:

- Start building
- Sign in
- Download Atlas CLI

### First-run flow

1. User submits a prompt.
2. Atlas preserves the prompt through authentication.
3. User chooses:
   - Personal workspace
   - Create or select an Atlas Group
4. Atlas converts the prompt into a draft specialist manifest.
5. Atlas asks only for essential missing information:
   - desired job;
   - knowledge sources;
   - permitted tools;
   - expected output;
   - privacy and sharing scope.
6. Atlas creates the specialist workspace.
7. Atlas offers CLI pairing when local files, repositories, or commands are required.

### Atlas Chat

Atlas Chat is the control surface for the specialist, not merely a conversation transcript.

The interface must show:

- messages and streamed responses;
- active specialist and version;
- attached sources;
- planned and active tool calls;
- approval requests;
- run status and elapsed time;
- artifacts produced;
- memory or evaluation promotion controls;
- collaborators currently present;
- audit-visible changes.

Chat commands should support natural language first, with slash commands as accelerators:

- `/sources`
- `/members`
- `/runs`
- `/memory`
- `/evaluations`
- `/deploy`
- `/api`

### Group collaboration

All authorized group members can access the shared Atlas workspace and Atlas Chat according to role.

Requirements:

- shared thread history;
- presence and attribution;
- comments and mentions;
- human approval requests;
- group-owned artifacts;
- versioned specialist changes;
- notifications when a specialist is blocked or finished;
- clear display of who added a source, changed a policy, approved an action, or deployed a version.

Personal Atlas memory must never enter a group automatically. Sharing into a group must be an explicit action showing the exact source, scope, duration, and revocation behavior.

## 7. Atlas CLI

### Purpose

The Atlas CLI bridges local work and Atlas-owned cloud workspaces. It must feel like a control plane rather than a second application.

### Package and executable

- Package: `@atlaslabs/cli`
- Executable: `atlas`
- Configuration directory: platform-appropriate user config directory under an Atlas-specific namespace.
- Authentication: browser-based device flow with short-lived device codes.
- Credentials: keychain-backed where supported; never store plaintext access tokens in project files.

### MVP commands

```text
atlas login
atlas logout
atlas whoami

atlas group list
atlas group create
atlas group use <group>
atlas member invite

atlas init
atlas link
atlas status

atlas source add <path>
atlas source list
atlas source sync
atlas source remove <source>

atlas specialist create
atlas specialist list
atlas specialist inspect <specialist>
atlas specialist run <specialist>
atlas specialist deploy <specialist>

atlas logs [run]
atlas wait [run]
atlas open

atlas api-key create
atlas api-key list
atlas api-key revoke
```

### `atlas init`

Creates a project-local `atlas.yaml` containing non-secret identifiers and declared sync rules:

```yaml
version: 1
group: atlas-labs
workspace: product
specialist: architecture-reviewer
sources:
  - path: .
    include:
      - "src/**"
      - "docs/**"
    exclude:
      - ".env*"
      - "node_modules/**"
      - ".git/**"
permissions:
  commands:
    - "pnpm test"
    - "pnpm lint"
```

The CLI must reject common secret files by default and show a dry-run manifest before its first upload.

## 8. Specialist lifecycle

```text
Draft → Configuring → Evaluating → Ready → Deployed → Deprecated
```

### Creation

Atlas translates the user’s stated job into a draft manifest, proposes sources and evaluations, and creates a private workspace.

### Learning

The specialist improves through:

- newly approved sources;
- explicit durable memory;
- accepted examples;
- rejected or edited outputs;
- evaluation failures;
- tool-use outcomes;
- optionally authorized fine-tuning data.

“Learning” must always be inspectable. Users must be able to see what changed and roll back to an earlier specialist version.

### Evaluation

A specialist cannot be deployed until:

- its required evaluation suite has run;
- critical policy tests pass;
- its tool permissions are valid;
- its source access remains authorized;
- its output schema validates.

### Deployment

Deployment freezes:

- specialist manifest version;
- prompt and policy version;
- source snapshot references;
- model policy;
- evaluation result;
- API schema;
- tool and network permissions.

## 9. Specialist API

### Goal

Allow an approved specialist to be consumed by products, automations, CI systems, and other agents without exposing the entire Atlas workspace.

### Authentication

Use Atlas-issued scoped service keys. Store only hashed key material server-side. Show the plaintext key once.

Key scopes:

- `specialist:invoke`
- `specialist:read`
- `runs:read`
- `artifacts:read`
- `events:subscribe`

Keys must be bound to a group, specialist, environment, rate limit, and optional expiration.

### Initial API

```text
POST /v1/specialists/{specialistId}/invoke
GET  /v1/runs/{runId}
GET  /v1/runs/{runId}/events
GET  /v1/runs/{runId}/artifacts
POST /v1/runs/{runId}/cancel
```

Invocation request:

```json
{
  "input": {},
  "threadId": "optional",
  "idempotencyKey": "required-for-retries",
  "callbackUrl": "optional"
}
```

Long-running work should return `202 Accepted` with a run ID. Streaming can use server-sent events initially. Webhooks must be signed.

## 10. Architecture

### Existing application stack

Build Atlas as the newly scaffolded independent T3 application:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- tRPC for first-party application calls
- Drizzle ORM
- PostgreSQL
- pnpm
- ESLint and Prettier

### Local development

Use Docker Compose for reproducible local services:

- PostgreSQL
- Redis-compatible queue/cache service
- S3-compatible object storage
- optional local mail catcher

The Next.js application may run directly on the host during early development for fast hot reload. It must also have a production Dockerfile.

### Production services

Keep logical boundaries even if the MVP initially deploys some components together:

1. **Web/control plane:** authentication, groups, chat UI, configuration, billing, and administration.
2. **API gateway:** specialist invocations, rate limits, service-key authentication, and webhooks.
3. **Orchestrator:** creates runs, schedules work, manages runtime lifecycle, and records state.
4. **Workers/runtimes:** isolated execution environments for specialist work.
5. **Ingestion service:** parses, chunks, versions, and indexes approved sources.
6. **Evaluation worker:** executes suites and stores immutable results.
7. **Model gateway:** provider abstraction, policy enforcement, usage metering, and trace metadata.

### Kubernetes direction

Atlas should be containerized and deployable to Kubernetes, but Kubernetes must not leak into the domain model.

Use:

- Deployments for stateless web, API, orchestration, ingestion, and evaluation services;
- Jobs for migrations and finite evaluation/training tasks;
- isolated Jobs or dedicated runtime workloads for specialist executions;
- Services for internal discovery;
- an external managed PostgreSQL service in production;
- external object storage in production;
- a cloud secret manager rather than plaintext Kubernetes Secrets as the source of truth;
- resource requests, limits, timeouts, network policies, and workload identity.

“Every specialist gets a VM” is the product-level isolation promise. The implementation may initially use strongly isolated ephemeral containers or microVMs behind a runtime abstraction, provided the security boundary and lifecycle are explicit. Do not hard-code Kubernetes Pod identity as the specialist identity.

### Fresh infrastructure requirement

Create new Atlas-specific resources:

- database and database credentials;
- object-storage buckets;
- queue/cache instance;
- model-provider keys;
- OAuth applications;
- encryption keys;
- webhook signing secrets;
- container registry;
- Kubernetes cluster or namespaces;
- observability project;
- email provider credentials;
- domain and TLS configuration.

Use separate development, staging, and production environments. No credential may be shared across them.

## 11. Data model

The initial Drizzle schema should include:

- `users`
- `accounts`
- `sessions`
- `groups`
- `memberships`
- `workspaces`
- `specialists`
- `specialist_versions`
- `threads`
- `messages`
- `sources`
- `source_versions`
- `source_permissions`
- `memories`
- `corrections`
- `evaluation_suites`
- `evaluation_cases`
- `evaluation_runs`
- `tool_definitions`
- `tool_grants`
- `runtimes`
- `runs`
- `run_events`
- `artifacts`
- `deployments`
- `service_keys`
- `api_invocations`
- `audit_events`

Every group-owned row must include an enforceable group boundary. Authorization checks must be centralized and tested; UI hiding is not authorization.

## 12. Security and privacy requirements

- Deny by default.
- Encrypt traffic and sensitive stored data.
- Use envelope encryption for connected credentials.
- Never send a connected source to a model provider without an explicit applicable policy.
- Redact secrets before ingestion and model context assembly.
- Maintain an append-only audit trail for administrative, source, permission, deployment, and API-key events.
- Make retention visible and configurable.
- Support source revocation and downstream invalidation.
- Separate personal and group memory.
- Require approval for destructive or externally visible tool actions.
- Rate-limit user and service-key access.
- Record model, source, prompt, tool, and specialist versions for every run.
- Provide export and deletion paths.
- Do not use customer content to train shared models by default.

## 13. Marketplace sequencing

Do not build a public marketplace in the MVP.

First build:

1. private specialist creation;
2. group collaboration;
3. CLI-connected sources and workflows;
4. evaluations and versioning;
5. scoped specialist APIs.

Then add a private group catalog where specialists can be reused inside one organization.

Only after real specialists are repeatedly reused should Atlas add public publishing. Public listings will require:

- publisher identity;
- provenance;
- evaluation evidence;
- licensing and usage terms;
- pricing and metering;
- version compatibility;
- disclosure of required data and tools;
- review and abuse handling.

## 14. MVP scope

### Must ship

- Homepage prompt that survives authentication.
- User authentication.
- Personal workspace.
- Atlas Group creation and invitations.
- Owner, Builder, Operator, and Viewer roles.
- Specialist creation through chat.
- Shared group chat and streamed runs.
- Source upload and repository connection through Atlas CLI.
- Versioned specialist manifest.
- Explicit correction capture.
- Small evaluation suite and evaluation runs.
- Background run queue.
- Isolated execution adapter.
- Specialist deployment.
- Scoped API keys.
- Asynchronous invocation API.
- Audit events for sensitive actions.
- Docker Compose development environment.
- Production Dockerfile.
- Kubernetes-ready service configuration.

### Can wait

- Public marketplace.
- Payments to specialist publishers.
- Large-scale contributor dispatch.
- Automatic fine-tuning.
- Multi-cloud runtime placement.
- End-user visual workflow builder.
- Full social features.
- Voice and video.
- Mobile-native applications.

## 15. Suggested delivery phases

### Phase 1: Independent foundation

- Audit the three reference repositories.
- Record reusable patterns in an internal implementation note.
- Create no runtime dependency on them.
- Configure fresh Atlas environment variables and local Docker services.
- Implement schema, authentication, groups, memberships, and workspace authorization.

### Phase 2: Chat and specialist manifests

- Build prompt-first homepage.
- Implement personal and group workspaces.
- Add threads, messages, streaming, sources, specialists, and versions.
- Turn a user prompt into a draft specialist manifest.

### Phase 3: Atlas CLI

- Implement device login.
- Add `atlas init`, project linking, safe source sync, status, logs, and open.
- Connect a local repository to a group specialist.

### Phase 4: Runs and improvement

- Add orchestrator and background queue.
- Add isolated runtime adapter.
- Add approval gates, corrections, evaluation cases, and immutable evaluation results.

### Phase 5: Specialist API

- Freeze deployable specialist versions.
- Add service keys, invocation API, run polling, event streaming, artifacts, rate limits, and audit events.
- Ship one end-to-end specialist template, preferably architecture review or research.

## 16. MVP acceptance scenario

A successful MVP must support this complete flow:

1. Benji visits Atlas and enters: “Create a specialist that understands our architecture and reviews changes against our conventions.”
2. He authenticates and creates the “Atlas Labs Engineering” group.
3. He invites Colin as a Builder and Elul as an Operator.
4. Atlas creates a draft Architecture Reviewer specialist.
5. Benji installs the Atlas CLI and links a local repository without uploading secrets or excluded files.
6. The specialist indexes approved source files and proposes an initial evaluation suite.
7. Colin adds evaluation cases and corrects an output.
8. The correction is explicitly promoted to a reusable example or evaluation.
9. The group runs the specialist again and sees the new version outperform the previous version.
10. A group Owner or Builder deploys the approved version.
11. Atlas creates a scoped API key.
12. An external test client submits a review request, receives a run ID, and retrieves the structured result.
13. The audit log identifies who connected the source, changed the specialist, approved deployment, and created the key.
14. Revoking the API key immediately prevents further invocation.

## 17. Success metrics

The north-star metric is:

**Weekly successful specialist runs that produce an accepted artifact or action.**

Supporting metrics:

- time from first prompt to first successful specialist run;
- percentage of new groups that connect a real source;
- percentage that add a second collaborator;
- percentage that create an evaluation;
- percentage that deploy an API;
- accepted output rate;
- correction-to-improvement rate;
- specialist reuse across multiple group members;
- API invocations per deployed specialist;
- runtime cost per accepted run;
- security and authorization failures.

## 18. Instructions to the implementation agent

1. Inspect all three reference repositories before making architecture decisions.
2. Produce a short reference audit listing patterns worth reimplementing and patterns to avoid.
3. Treat the repositories as read-only references.
4. Search the new Atlas repository for `.openai/hosting.json` before making hosting decisions and follow the applicable hosting workflow if it exists.
5. Preserve the existing T3, Drizzle, PostgreSQL, Tailwind, shadcn, pnpm, ESLint, and Prettier setup unless a concrete incompatibility is demonstrated.
6. Create a vertical slice before broad infrastructure:
   - group;
   - specialist;
   - chat;
   - connected source;
   - run;
   - correction;
   - deployment;
   - API invocation.
7. Centralize authorization and write tests for cross-group isolation.
8. Generate all new keys and infrastructure configuration for Atlas.
9. Do not copy secrets or production resource identifiers from any reference project.
10. Keep model providers and runtimes behind interfaces so they can be replaced.
11. Make all learning signals inspectable and reversible.
12. Keep the public marketplace out of the MVP.
13. Finish each phase with linting, formatting, type checking, tests, database migration verification, and a documented local run command.

## 19. Final product statement

Atlas is where a person or group creates a durable AI specialist around the work only they understand. Chat defines and supervises it. The CLI connects it to real work. The runtime gives it a private place to operate. Evaluations make improvement measurable. The API lets the resulting capability become part of any product or workflow.
