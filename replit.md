# Smart Governance Platform

A role-aware civic service portal for reporting issues, coordinating service teams, and making administrative performance visible.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/smart-governance-platform run dev` — run the web application
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck and build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate React Query hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push database schema changes (development only)
- Required env: `DATABASE_URL` and `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/smart-governance-platform/src/App.tsx` — public pages, authentication screens, role portals, and workflows
- `artifacts/smart-governance-platform/src/index.css` — shared civic visual system and responsive layout
- `artifacts/api-server/src/routes/governance.ts` — auth, dashboards, complaints, departments, users, notifications, and contact endpoints
- `artifacts/api-server/src/lib/auth.ts` — JWT creation, bearer validation, and role authorization
- `artifacts/api-server/src/lib/seed.ts` — idempotent demo departments, users, complaints, and notifications
- `lib/api-spec/openapi.yaml` — API source of truth
- `lib/api-client-react/src/generated/` — generated React Query client and TypeScript schemas
- `lib/api-zod/src/generated/` — generated server-side Zod validators
- `lib/db/src/schema/index.ts` — PostgreSQL/Drizzle schema and relations

## Architecture decisions

- The app uses the workspace's shared Express/PostgreSQL architecture so the web artifact, API server, generated client, and database remain compatible with Replit workflows.
- Authentication is local JWT with BCrypt-compatible password hashing and explicit role checks for citizen, staff, and administrator routes.
- OpenAPI is the contract boundary; regenerate the client and Zod validators after changing `lib/api-spec/openapi.yaml`.
- Demo seed data is idempotent and runs when the API starts, making the preview immediately usable without hard-coded frontend records.
- The browser stores only the signed JWT and a display copy of the user profile; every protected API request still validates the bearer token on the server.

## Product

- Public landing page explaining the service, with About and Contact pages
- Role selection and separate citizen, staff, and administrator authentication flows
- Citizen registration, complaint submission, searchable complaint history, status timeline, notifications, and profile
- Staff dashboard with assigned workload, complaint filtering, status changes, remarks, and resolution notes
- Administrator dashboard with platform metrics, complaint search and filters, user/staff directories, department CRUD, reports, notifications, and complaint oversight
- Responsive layouts for desktop and mobile, including a collapsible portal sidebar

## User preferences

- The requested product is a polished, professional civic-service interface inspired by the supplied reference, not a direct copy.

## Gotchas

- The frontend Vite config requires `PORT` and `BASE_PATH` when running a production build manually; the managed web workflow supplies the runtime port.
- Keep the generated API client and Zod package in sync with the OpenAPI file; do not hand-edit generated files.
- Protected portal routes depend on the browser JWT token. Clearing local storage or using an expired token returns the user to role selection.
- Use the development database push command only against the provisioned development database; production schema changes need an explicit migration workflow.
- Demo credentials are documented in the root README and are intended for local/demo use only.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
