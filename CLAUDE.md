# CLAUDE.md

## Project Overview
A website + WhatsApp appointment reminder system for dental clinics in Karachi, Pakistan.

**Important scope note:** This repository contains only the **backend API** (`teeth-for-life-backend`). There is no frontend code in this repo — the React/Vue/etc. client lives elsewhere (or has not been created yet). The backend exposes JSON endpoints intended to be consumed by a separate frontend.

## Business Context
- Clients: Dental clinics in Karachi
- Product 1: Clinic website (one-time fee)
- Product 2: WhatsApp appointment reminder agent (monthly retainer)
- Status: Website 60-70% complete, WhatsApp agent not started
- The booking confirmation email already promises the patient "We'll confirm via WhatsApp at {phone} within 1 hour" — so a WhatsApp integration is implicitly committed to the customer flow but is not implemented.

## Tech Stack

### Frontend
- **Not in this repository.** No frontend framework, build tooling, or assets are present.
- The backend CORS layer expects the client at `FRONTEND_URL` (defaults to `http://localhost:5173`, which is Vite's default — suggesting a Vite-based React/Vue frontend is planned).

### Backend
- **Framework:** Express.js 4 (ES Modules — `"type": "module"`)
- **Database:** PostgreSQL via TypeORM 0.3 (using `EntitySchema`, not decorators)
- **Auth:** JWT (`jsonwebtoken`) + `bcryptjs` for single-admin login
- **Validation:** Zod
- **Email:** Nodemailer (SMTP)
- **Security:** `helmet`, `cors`, `express-rate-limit`
- **Deployment target:** AWS Lambda via Serverless Framework v3 (`serverless-http` adapter, VPC config for RDS)
- **Dev libs:** `nodemon`, `serverless-offline`
- **Dev command:** `npm run dev` (nodemon on [src/server.js](src/server.js))
- **Start command:** `npm start`
- **Migrate command:** `npm run migrate`
- **Offline serverless:** `npm run offline` (port 3000)

## Folder Structure
```
.
├── handler.js                  # Lambda entrypoint (wraps app via serverless-http)
├── serverless.yml              # AWS Lambda + VPC config
├── package.json
├── README.md                   # essentially empty
└── src/
    ├── app.js                  # Express app: middleware, route mounting, lazy DB init
    ├── server.js               # Local dev entrypoint (app.listen)
    ├── db/
    │   └── index.js            # TypeORM DataSource (Postgres, dual local/Lambda config)
    ├── entities/               # TypeORM EntitySchemas
    │   ├── Appointment.js
    │   ├── Patient.js
    │   ├── Review.js
    │   └── Service.js
    ├── migrations/
    │   ├── 1700000000000-InitialSchema.js   # creates tables + seeds 8 services
    │   └── run.js                            # CLI runner
    ├── routes/                 # thin Express routers
    │   ├── adminRoutes.js
    │   ├── appointmentRoutes.js
    │   ├── availabilityRoutes.js
    │   ├── reviewRoutes.js
    │   └── serviceRoutes.js
    ├── controllers/            # request/response handling + Zod validation
    │   ├── adminController.js
    │   ├── appointmentController.js
    │   ├── availabilityController.js
    │   ├── reviewController.js
    │   └── serviceController.js
    ├── services/               # business logic + TypeORM repository calls
    │   ├── adminService.js
    │   ├── appointmentService.js
    │   ├── availabilityService.js
    │   ├── dentalService.js    # service catalog lookups
    │   ├── emailService.js
    │   ├── patientService.js
    │   └── reviewService.js
    ├── middleware/
    │   ├── auth.js             # JWT bearer middleware
    │   └── rateLimiter.js      # booking limiter (5/hr/IP)
    └── validators/
        └── schemas.js          # Zod schemas (booking, admin booking, review, availability)
```

## Environment Variables
No `.env.example` is committed. Required variables (inferred from code):

**Database — local mode** (used when `DATABASE_URL` is unset):
- `DB_HOST` — defaults to `127.0.0.1`
- `DB_PORT` — defaults to `5432`
- `DB_USERNAME` — defaults to `postgres`
- `DB_PASSWORD` — defaults to undefined
- `DB_NAME` — defaults to `TeethForLife1`

**Database — Lambda mode** (used when set):
- `DATABASE_URL` — full Postgres connection string; enables SSL (`rejectUnauthorized: false`)

**Auth:**
- `JWT_SECRET` — signing secret for admin tokens (8h expiry)
- `ADMIN_EMAIL` — single admin login email
- `ADMIN_PASSWORD_HASH` — bcrypt hash of the admin password

**Email (SMTP):**
- `SMTP_HOST`
- `SMTP_PORT` — defaults to `587`
- `SMTP_USER` — also used as `from` address
- `SMTP_PASS`

**Misc:**
- `FRONTEND_URL` — CORS origin; defaults to `http://localhost:5173`
- `PORT` — local server port; defaults to `3000`
- `NODE_ENV` — disables TypeORM query logging when `production`

**Serverless deploy only** (referenced in [serverless.yml](serverless.yml)):
- `LAMBDA_SECURITY_GROUP_ID`
- `SUBNET_ID_1`, `SUBNET_ID_2`

## API Endpoints

All routes are prefixed with `/api`.

**Health**
- `GET /api/health` — returns `{ status: 'ok', timestamp }`

**Public — patient-facing**
- `POST /api/appointments/book` — book a slot (rate-limited: 5/hr/IP). Body validated by `bookingSchema` (Pakistani phone regex, no Sundays, 09:00–18:30 in 30-min slots). Triggers fire-and-forget confirmation email.
- `GET /api/services` — list all `is_active: true` services, sorted by name.
- `GET /api/availability?date=YYYY-MM-DD` — returns array of available `HH:MM` slots for the date (excludes Sundays, excludes slots already PENDING/CONFIRMED).
- `GET /api/reviews` — list up to 50 visible reviews (newest first) with patient name.
- `POST /api/reviews` — submit a review (rating 1–5). Upserts patient by phone.

**Admin — all routes below `/api/admin` except `/login` require `Authorization: Bearer <jwt>`**
- `POST /api/admin/login` — `{ email, password }` → `{ token, email }`
- `GET /api/admin/dashboard` — `{ todayCount, weekCount, totalPatients, noShowRate, upcoming[5] }`
- `GET /api/admin/appointments?date=&status=&search=` — filtered list with joined patient/service
- `POST /api/admin/appointments` — manual booking (forces `status: CONFIRMED`, `source: MANUAL`)
- `PATCH /api/admin/appointments/:id` — update `status`, `notes`, `showed_up`
- `GET /api/admin/patients?search=` — list patients
- `GET /api/admin/appointments/export?from=&to=` — CSV download

## Database Schema

**`patients`**
- `id` UUID PK
- `full_name` VARCHAR(255) NOT NULL
- `phone` VARCHAR(20) UNIQUE NOT NULL — Pakistani format `+92XXXXXXXXXX` or `0XXXXXXXXXX`
- `email` VARCHAR(255) nullable
- `date_of_birth` DATE nullable
- `created_at` TIMESTAMP
- Indexed on `phone`

**`services`** — seeded with 8 rows in the initial migration
- `id` UUID PK
- `name`, `description`, `duration_minutes`, `price_pkr` (INT, PKR)
- `is_active` BOOLEAN default `true`
- Seeded: General Checkup, Teeth Cleaning, Teeth Whitening, Root Canal, Dental Implant, Braces Consultation, Kids Dentistry, Tooth Extraction (prices PKR 2,000–50,000)

**`appointments`**
- `id` UUID PK
- `patient_id` UUID → `patients(id)` ON DELETE CASCADE
- `service_id` UUID → `services(id)` ON DELETE SET NULL
- `appointment_date` DATE, `appointment_time` TIME
- `status` ENUM `appointment_status`: PENDING, CONFIRMED, CANCELLED, NO_SHOW, COMPLETED (default PENDING)
- `source` ENUM `appointment_source`: ONLINE, MANUAL (default ONLINE)
- `notes` TEXT nullable
- `showed_up` BOOLEAN default false
- `created_at`, `updated_at`
- Indexed on `appointment_date`, `status`, `patient_id`

**`reviews`**
- `id` UUID PK
- `patient_id` UUID → `patients(id)` ON DELETE CASCADE
- `rating` INT CHECK 1–5
- `comment` TEXT nullable
- `is_visible` BOOLEAN default true
- `created_at` TIMESTAMP

## What Is Complete
- Express app skeleton with helmet, cors, rate limiter, error handler
- TypeORM + Postgres setup with dual-mode (local dev vs Lambda + VPC + SSL)
- Lazy DB init on first request (Lambda cold-start friendly)
- Zod request validation with Pakistani-phone regex and Sunday-blocked / business-hours rules
- Patient upsert-by-phone pattern (no patient signup; phone is the identity)
- Full public booking flow: list services → check availability → book slot → send email
- Reviews list + submit
- Admin JWT auth (single admin, env-configured hash)
- Admin dashboard stats (today/week counts, total patients, 30-day no-show rate, next 5 upcoming)
- Admin appointment list with date/status/search filters
- Admin manual-add appointment (auto-CONFIRMED)
- Admin appointment status updates
- Admin patient list
- Admin CSV export of appointments by date range
- Initial migration with all 4 tables, enums, indexes, and 8 seeded services
- Serverless Framework config for AWS Lambda deploy (VPC + RDS-ready)
- Rate limit on `/api/appointments/book` (5/hr/IP)

## What Is Incomplete / TODO

**Critical bugs**
- [src/services/appointmentService.js:8-17](src/services/appointmentService.js#L8-L17) — `isSlotBooked` only matches `status: 'PENDING'`. A `CONFIRMED` appointment will be treated as a free slot and double-booked. Should check `status IN ('PENDING', 'CONFIRMED')` to match the availability service.
- [src/controllers/appointmentController.js:36-43](src/controllers/appointmentController.js#L36-L43) — confirmation email is fire-and-forget and the patient is told "We'll confirm via WhatsApp at {phone} within 1 hour", but no WhatsApp sender exists.
- [src/services/availabilityService.js:5-17](src/services/availabilityService.js#L5-L17) — `generateTimeSlots` has dead-code branching (`if (h < 18 || h === 18)` is always true for `h < 19`) and a redundant final filter. Currently produces 09:00–18:30, which works, but the logic should be simplified.
- [src/services/adminService.js:44-48](src/services/adminService.js#L44-L48) — "weekCount" is computed as Monday-to-today, so it excludes future appointments in the current week. May be intentional, but inconsistent with the word "week."

**Missing features**
- No WhatsApp integration anywhere (see plan below).
- No patient-facing appointment lookup / cancellation route. Patients have no way to see or cancel a booking.
- No `.env.example` file.
- No tests (no `test` script, no test directory).
- README is empty (literally one BOM character + heading).
- No `services` admin endpoints (cannot add / edit / disable services without raw SQL).
- No `reviews` moderation endpoint (admin cannot toggle `is_visible` via API).
- Frontend repo doesn't exist in this codebase.

**Hardening / nice-to-have**
- `isSlotBooked` race condition: two requests within milliseconds can both pass the check and create duplicate appointments. Needs a unique constraint on `(appointment_date, appointment_time)` for active statuses, or a transaction with `SELECT ... FOR UPDATE`.
- Booking validation accepts `appointment_time` like `09:00` but stores as a TIME column — confirm Postgres handles bare `HH:MM` consistently (driver does, but explicit `:00` seconds would be safer).
- No request logging / structured logs.
- `email` field on Patient is non-unique — if the same phone is reused with different emails, the latest wins (current `upsertByPhone` behavior).

## WhatsApp Agent Plan
- **Not built yet.**
- Stack to use: Twilio WhatsApp API + Node.js cron job
- Reminder flow: booking saved → 24hr reminder → 2hr reminder
- Needs: `/api/appointments` endpoint, Twilio setup, scheduler
- Recommended additions to this repo when starting:
  - New `src/services/whatsappService.js` wrapping Twilio's WhatsApp sender
  - Cron via `node-cron` or a scheduled EventBridge rule (Lambda) — Lambda is the better fit since the API already deploys there
  - New `reminders` table or `reminder_sent_24h` / `reminder_sent_2h` boolean columns on `appointments` to guarantee idempotency
  - Twilio env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
  - Wire WhatsApp confirmation into the booking flow at [src/controllers/appointmentController.js:36](src/controllers/appointmentController.js#L36) (currently only email)

## How To Run Locally

**Backend (this repo):**
```powershell
# 1. install (already done)
npm install

# 2. create a .env file with at minimum:
#    DB_HOST=127.0.0.1
#    DB_PORT=5432
#    DB_USERNAME=postgres
#    DB_PASSWORD=...
#    DB_NAME=TeethForLife1
#    JWT_SECRET=some-long-random-string
#    ADMIN_EMAIL=admin@example.com
#    ADMIN_PASSWORD_HASH=$2a$10$...   (bcrypt hash)
#    FRONTEND_URL=http://localhost:5173

# 3. ensure Postgres is running and the database exists
#    createdb TeethForLife1   (or via pgAdmin)

# 4. run migrations + seed services
npm run migrate

# 5. start dev server (nodemon, port 3000)
npm run dev

# alternative: serverless-offline (closer to Lambda runtime)
npm run offline
```

**Frontend:** not in this repo.

## Key Files
- [src/app.js](src/app.js) — Express app assembly. Middleware order, route mounting, lazy DB init, global error handler.
- [src/server.js](src/server.js) — local dev entrypoint.
- [handler.js](handler.js) — Lambda entrypoint via `serverless-http`.
- [serverless.yml](serverless.yml) — AWS deploy config (Node 20, us-east-1, VPC with two subnets, single proxy function).
- [src/db/index.js](src/db/index.js) — TypeORM DataSource. Dual-mode local vs Lambda; `max: 1` pool for Lambda safety.
- [src/migrations/1700000000000-InitialSchema.js](src/migrations/1700000000000-InitialSchema.js) — single source of truth for schema + seeded service catalog.
- [src/validators/schemas.js](src/validators/schemas.js) — all request-body validation, including Pakistani phone regex `^(\+92|0)[0-9]{10}$`.
- [src/services/appointmentService.js](src/services/appointmentService.js) — slot-booking + create/update. **Has the double-booking bug.**
- [src/services/availabilityService.js](src/services/availabilityService.js) — slot generator (09:00–18:30 in 30-min steps, Sundays closed).
- [src/services/adminService.js](src/services/adminService.js) — login, dashboard, listing, CSV export.
- [src/services/emailService.js](src/services/emailService.js) — Nodemailer; transporter is `null` if SMTP env not set (no-op gracefully).
- [src/middleware/auth.js](src/middleware/auth.js) — JWT bearer middleware for admin routes.
- [src/middleware/rateLimiter.js](src/middleware/rateLimiter.js) — booking limiter (5/hr/IP).

## Code Conventions
- **Modules:** ESM (`import`/`export`), `"type": "module"` in [package.json](package.json). All imports use explicit `.js` extensions.
- **Layering:** `routes → controllers → services → entities` with no cross-layer shortcuts. Controllers do validation + response shaping; services do DB work; entities are TypeORM EntitySchemas (not classes/decorators).
- **TypeORM style:** `EntitySchema` (declarative object), not the decorator API. Repositories are obtained via `AppDataSource.getRepository(Entity)` inside small `getRepo()` helpers.
- **Validation:** Zod schemas in [src/validators/schemas.js](src/validators/schemas.js), invoked via `schema.safeParse(req.body)` in controllers. 400 returned with `{ errors: result.error.errors }`.
- **Naming:**
  - Files: camelCase for code (`adminController.js`), PascalCase for entities (`Appointment.js`).
  - DB: snake_case columns (`appointment_date`, `is_active`, `patient_id`), plural snake_case tables (`patients`, `appointments`).
  - Routes: kebab-free, lowercased plurals (`/api/appointments`, `/api/services`).
  - Enums: SCREAMING_SNAKE_CASE values (`PENDING`, `NO_SHOW`).
- **Identity:** Patients are identified by `phone` (unique), not email or password. `upsertByPhone` is the canonical pattern for creating-or-finding a patient on every booking/review.
- **Phone format:** Pakistani — must match `^(\+92|0)[0-9]{10}$`.
- **Currency:** All prices stored as integer PKR (no decimals, no separate currency column).
- **Time:** Appointments stored in DB-local TIME. Slot logic assumes the clinic's local timezone (Asia/Karachi); not made explicit anywhere — assume server runs in PKT or set TZ accordingly.
- **Error handling:** Controllers wrap their body in `try/catch`, log via `console.error`, return generic 500 `{ error: 'Failed to ...' }`. The global error handler in [src/app.js:44-47](src/app.js#L44-L47) is a final safety net.
- **Lambda-awareness:** DB pool is `max: 1`, DataSource is initialized lazily on first request, not at module load. Don't break this pattern — eager DB init will cause Lambda cold-start failures.
