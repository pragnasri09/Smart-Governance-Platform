# Smart Governance Platform

Smart Governance is a complete civic-service workflow for the academic project **“Smart Governance Platform for Administrative Operations with Citizen Service Assistance.”** It gives citizens one clear place to report issues and follow progress, gives service teams a focused work queue, and gives administrators a live view of demand and performance.

## What is included

- Public service landing page, About page, and validated Contact form
- Role selection with separate citizen, service staff, and administrator access
- JWT authentication, BCrypt-compatible password hashing, and role-based API authorization
- Citizen complaint submission, history, detail timeline, and notifications
- Staff assigned-work queue with status, remarks, and resolution updates
- Administrator dashboards, user/staff directories, department CRUD, complaint oversight, reports, and notifications
- PostgreSQL persistence through Drizzle ORM
- OpenAPI-first contract with generated React Query hooks and Zod validators
- Responsive desktop/mobile interface with loading, error, empty, and validation states

## Demo accounts

The API seeds demo data on startup. These accounts are for preview and development only:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@sgp.gov.in` | `DemoPass123!` |
| Citizen | `ananya.rao@gmail.com` | `DemoPass123!` |
| Service staff | `meera.iyer@sgp.gov.in` | `DemoPass123!` |

## Run locally in Replit

The repository uses pnpm workspaces and managed workflows:

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/smart-governance-platform run dev
```

The managed database must be provisioned and `DATABASE_URL` must be available. `SESSION_SECRET` is required for signing JWTs. The API seeds demo rows after it starts.

Useful checks:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/smart-governance-platform run typecheck
PORT=19676 BASE_PATH=/ pnpm --filter @workspace/smart-governance-platform run build
```

## Architecture

```text
React + Vite web artifact
        │
        │ generated React Query client
        ▼
Express API server ── Zod request validation
        │
        ▼
PostgreSQL via Drizzle ORM
```

### Source-of-truth locations

- `lib/api-spec/openapi.yaml` — REST contract
- `lib/db/src/schema/index.ts` — database tables and relations
- `artifacts/api-server/src/routes/governance.ts` — API implementation
- `artifacts/api-server/src/lib/auth.ts` — authentication and authorization
- `artifacts/api-server/src/lib/seed.ts` — repeatable demo data
- `artifacts/smart-governance-platform/src/App.tsx` — application routes and workflows
- `artifacts/smart-governance-platform/src/index.css` — visual system and responsive styles

If the OpenAPI contract changes, regenerate the client and validators before changing consumers:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Data and security notes

- Passwords are never stored in plaintext.
- Protected routes require a signed bearer token and enforce the user's role server-side.
- Citizens can only view their own complaints.
- Staff can only view and update complaints assigned to them.
- Administrators can view platform-wide records and manage departments.
- Demo credentials and seed data must be replaced or removed before a production rollout.

## License

MIT. See `LICENSE`.