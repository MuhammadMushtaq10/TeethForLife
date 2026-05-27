# CLAUDE.md — Dental Clinic Website + WhatsApp Agent

> This is the master project intelligence file. Read this at the start of every session.
> Last updated: May 2026

---

## 🏢 Business Context

| Field | Detail |
|---|---|
| Product | Website + WhatsApp appointment reminder system for dental clinics |
| Market | Dental clinics in Karachi, Pakistan |
| Revenue 1 | One-time website fee (PKR 25,000–150,000) |
| Revenue 2 | Monthly WhatsApp agent retainer (PKR 8,000–15,000/month) |
| Owner | Fullstack developer, building this as a side business |
| Stage | Frontend ~65% done (UI only), Backend ~60% done, WhatsApp agent 0% |

---

## 🗂️ Repository Structure

This is a **monorepo with two separate projects:**

```
/
├── frontend/          ← React 18 + Vite (UI complete, not wired to backend)
└── backend/           ← Node.js + Express + TypeORM + PostgreSQL
```

---

## 🎨 Frontend

### Tech Stack
| Layer | Choice |
|---|---|
| Framework | React 18 + Vite 5 (JSX, no TypeScript) |
| Styling | Tailwind CSS 3 with custom theme |
| Routing | React Router v6 |
| State | Redux Toolkit (admin auth only) |
| Forms | react-hook-form |
| HTTP | axios (single client instance) |
| i18n | Custom EN/UR context with RTL support |
| Notifications | react-hot-toast |

### Run Commands
```bash
cd frontend
npm install
npm run dev        # starts on http://localhost:5173
npm run build
```

### Pages & Components (What Exists)
**Public Site (complete UI):**
- `/` — Home (hero, services grid, testimonials)
- `/services` — Services listing
- `/book` — Appointment booking form (Pakistani phone validation, Sunday-closed logic)
- `/about` — About the clinic
- `/contact` — Contact form ⚠️ FAKE — shows success banner without submitting

**Admin Section (complete UI):**
- `/admin/login` — JWT login form
- `/admin/dashboard` — Stats overview
- `/admin/appointments` — List with filters, CSV export, inline status edit
- `/admin/patients` — Patient list with search
- `/admin/appointments/new` — Add appointment modal

### What Is Complete (Frontend)
- All page layouts and UI components
- Bilingual EN/UR with RTL switching
- Pakistani phone number validation
- Sunday-closed booking logic
- JWT auth flow with auto-401 redirect on expiry
- Responsive Tailwind styling across all pages
- Admin CRUD UI for appointments and patients

### What Is Broken / Missing (Frontend)
| Issue | File | Priority |
|---|---|---|
| Contact form submits nowhere — fake success | `Contact.jsx:10-14` | 🔴 High |
| Missing image: `hero-dental.jpg` | Home.jsx | 🔴 High |
| Missing image: `doctor.jpg` | About.jsx | 🔴 High |
| Missing favicon: `tooth.svg` | index.html | 🟡 Medium |
| All social links are `href="#"` | Footer.jsx | 🟡 Medium |
| Privacy/Terms links are `href="#"` | Footer.jsx | 🟡 Medium |
| Google Maps coordinates unverified | Contact.jsx | 🟡 Medium |
| No `.env.example` file | root | 🟡 Medium |
| `serviceImages` keyed by string name — breaks if backend name differs | Home.jsx, Services.jsx | 🟡 Medium |
| Clinic hours inconsistent across Footer/Booking/Contact | multiple | 🟡 Medium |
| JWT stored in localStorage (XSS risk, OK for v1) | store | 🟢 Low |
| No pagination on admin lists | Admin pages | 🟢 Low |
| 5 npm vulnerabilities (4 moderate, 1 high) | — | 🟢 Low |

### Environment Variables (Frontend)
```env
VITE_API_URL=http://localhost:3000   # Backend base URL
```

---

## ⚙️ Backend

### Tech Stack
| Layer | Choice |
|---|---|
| Runtime | Node.js (ESM modules) |
| Framework | Express 4 |
| ORM | TypeORM 0.3 |
| Database | PostgreSQL |
| Validation | Zod |
| Auth | JWT + bcryptjs (single admin user) |
| Email | Nodemailer |
| Security | helmet, cors, express-rate-limit |
| Deploy | AWS Lambda via Serverless Framework v3 + serverless-http |
| Local dev | nodemon OR serverless-offline |

### Run Commands
```bash
cd backend
npm install
cp .env.example .env    # fill in values
npm run dev             # nodemon (plain Express on port 3000)
# OR
npx serverless offline  # Lambda emulation
```

### API Endpoints (All Existing)
```
PUBLIC
GET    /api/services              — list all services
GET    /api/availability          — get available slots for a date
POST   /api/appointments          — book an appointment (rate-limited)
POST   /api/reviews               — submit a review
GET    /api/reviews               — list approved reviews

ADMIN (JWT required)
POST   /api/admin/login           — get JWT token
GET    /api/admin/dashboard       — stats (weekly count bug — see below)
GET    /api/admin/appointments    — list with filters
PATCH  /api/admin/appointments/:id — update status
POST   /api/admin/appointments    — manually add appointment
GET    /api/admin/patients        — list patients with search
GET    /api/admin/patients/export — CSV export
```

### Database Schema
```
services
  id, name, description, duration_minutes, price, image_url, is_active

patients
  id, name, phone (unique identity key), email, created_at

appointments
  id, patient_id (FK), service_id (FK), appointment_date, appointment_time,
  status (PENDING|CONFIRMED|CANCELLED|COMPLETED),
  notes, created_at
  ⚠️ MISSING: reminder_sent_24h boolean, reminder_sent_2h boolean

admin_users
  id, username, password_hash

reviews
  id, patient_name, rating, comment, is_approved, created_at
```

### What Is Complete (Backend)
- Full patient booking flow
- Availability checking (with Sunday closed)
- Admin auth (login, JWT middleware)
- Admin appointment management (list, filter, add, status update)
- Patient list + CSV export
- Review submission + listing
- Rate limiting on bookings
- Initial migration with 8 seeded services
- Lambda-compatible lazy DB init

### What Is Broken / Missing (Backend)
| Issue | File | Priority |
|---|---|---|
| **Double-booking bug**: `isSlotBooked` only checks `PENDING`, not `CONFIRMED` | `appointmentService.js:8-17` | 🔴 Critical |
| Dashboard `weekCount` only counts Mon-to-today, not full week | `adminController.js` | 🟡 Medium |
| Confirmation email is fire-and-forget — SMTP failure is silent | `appointmentController.js` | 🟡 Medium |
| No `.env.example` file | root | 🟡 Medium |
| README is empty | README.md | 🟢 Low |
| No patient cancel/lookup endpoint | — | 🟢 Low |
| No admin endpoints for services or review moderation | — | 🟢 Low |
| No tests | — | 🟢 Low |

### Environment Variables (Backend)
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dental_clinic
DB_USER=postgres
DB_PASSWORD=

# Auth
JWT_SECRET=

# Email (Nodemailer)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Twilio (WhatsApp — not yet used)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# App
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

---

## 🤖 WhatsApp Agent (NOT BUILT YET)

### Plan
- **Provider:** Twilio WhatsApp Business API
- **Scheduler:** `node-cron` (development) → EventBridge scheduled Lambda (production)
- **Trigger:** runs every 15 minutes, checks appointments needing reminders
- **Idempotency:** `reminder_sent_24h` + `reminder_sent_2h` boolean columns on appointments table

### Reminder Flow
```
Patient books appointment
       ↓
Confirmation WhatsApp sent immediately
       ↓
24 hours before → Reminder sent (EN or UR based on patient preference)
       ↓
2 hours before  → Final reminder sent
       ↓
Patient can reply CONFIRM or CANCEL
       ↓
Inbound webhook updates appointment status
```

### Message Templates (to create in Twilio)
```
Confirmation (EN):
"Hi {{name}}, your appointment at Bright Smile Dental is confirmed for {{date}} at {{time}}. 
Reply CANCEL if you need to cancel."

24h Reminder (EN):
"Hi {{name}}, reminder: you have a dental appointment tomorrow at {{time}}. 
Reply CONFIRM to confirm or CANCEL to cancel."

2h Reminder (EN):
"Hi {{name}}, your appointment is in 2 hours at {{time}}. See you soon!"
```

### Files to Create
```
backend/src/
├── services/whatsappService.js     ← Twilio send logic
├── jobs/reminderJob.js             ← cron/scheduler logic
└── controllers/webhookController.js ← inbound CONFIRM/CANCEL handler

backend/src/routes/
└── webhook.js                      ← POST /webhook/whatsapp
```

### Migration to Add
```sql
ALTER TABLE appointments 
ADD COLUMN reminder_sent_24h BOOLEAN DEFAULT FALSE,
ADD COLUMN reminder_sent_2h BOOLEAN DEFAULT FALSE;
```

---

## 🔌 Frontend ↔ Backend Connection

The frontend currently has NO real API calls — everything is static UI. When wiring:

| Frontend action | Backend endpoint |
|---|---|
| Load services on Home/Services page | `GET /api/services` |
| Load available slots on booking form | `GET /api/availability?date=YYYY-MM-DD` |
| Submit booking form | `POST /api/appointments` |
| Submit contact form | `POST /api/contact` ← needs to be created |
| Load reviews | `GET /api/reviews` |
| Submit review | `POST /api/reviews` |
| Admin login | `POST /api/admin/login` |
| Admin dashboard stats | `GET /api/admin/dashboard` |
| Admin appointments list | `GET /api/admin/appointments` |
| Admin update status | `PATCH /api/admin/appointments/:id` |
| Admin add appointment | `POST /api/admin/appointments` |
| Admin patients list | `GET /api/admin/patients` |
| Admin CSV export | `GET /api/admin/patients/export` |

---

## 🚀 Completion Roadmap

### Phase 1 — Fix Critical Bugs (4–6 hours)
- [ ] Fix double-booking bug in `appointmentService.js`
- [ ] Add partial unique index on `(appointment_date, appointment_time)` for active statuses
- [ ] Fix Contact form — create `POST /api/contact` backend route + wire frontend
- [ ] Add missing images: `hero-dental.jpg`, `doctor.jpg`, `tooth.svg`
- [ ] Create `.env.example` for both repos

### Phase 2 — Wire Frontend to Backend (10–14 hours)
- [ ] Set up axios base URL from `VITE_API_URL`
- [ ] Wire services listing (Home + Services pages)
- [ ] Wire availability + booking form
- [ ] Wire reviews section
- [ ] Wire all admin pages to real API
- [ ] Fix `weekCount` dashboard bug

### Phase 3 — Polish (4–6 hours)
- [ ] Add real social media links
- [ ] Add privacy policy + terms pages
- [ ] Verify Google Maps coordinates
- [ ] Make service images/steps data-driven from backend
- [ ] Standardize clinic hours text across all pages
- [ ] Fix npm vulnerabilities

### Phase 4 — WhatsApp Agent (12–16 hours)
- [ ] Create Twilio account + WhatsApp sender
- [ ] Add reminder columns migration
- [ ] Build `whatsappService.js`
- [ ] Build `reminderJob.js` (cron)
- [ ] Build inbound webhook for CONFIRM/CANCEL
- [ ] Add EN + UR message templates
- [ ] Test with real WhatsApp number
- [ ] Wire EventBridge Lambda for production

### Phase 5 — Deploy (4–6 hours)
- [ ] Deploy backend to AWS Lambda (Serverless config already exists)
- [ ] Set up RDS PostgreSQL
- [ ] Deploy frontend to Vercel or S3 + CloudFront
- [ ] Set up environment variables in production
- [ ] Smoke test full flow

**Total estimate: ~35–50 hours for website, +12–16 hours for WhatsApp agent**

---

## ⚠️ Critical Rules for Claude (AI Assistant)

1. **Never overwrite working UI** — the frontend UI is largely complete. Only wire API calls, don't redesign.
2. **Fix double-booking first** before any booking-related work.
3. **Backend is ESM** — always use `import/export`, never `require()`.
4. **TypeORM uses EntitySchema** (not decorators) — keep that pattern.
5. **Zod validates at the route boundary** — add Zod schemas for any new endpoint.
6. **Patient identity = phone number** — upsert by phone, don't create duplicates.
7. **Bilingual support** — any new user-facing text needs both EN and UR keys in the i18n context.
8. **Sunday = closed** — booking logic must always block Sundays.
9. **JWT in Authorization header** — `Bearer <token>` for all admin routes.
10. **WhatsApp templates must be pre-approved by Twilio** — don't hardcode message strings outside the template system.

---

## 📁 Key Files Reference

### Frontend
| File | Purpose |
|---|---|
| `src/context/i18nContext.jsx` | EN/UR translations + RTL switching |
| `src/store/adminSlice.js` | Redux slice for admin JWT auth |
| `src/lib/axios.js` | Axios instance (set base URL here) |
| `src/pages/Contact.jsx:10-14` | ⚠️ Fake form submit — fix this |
| `src/pages/Home.jsx` | `serviceImages` object — keyed by name string |
| `src/pages/Services.jsx` | `serviceDetails` object — same issue |

### Backend
| File | Purpose |
|---|---|
| `src/services/appointmentService.js:8-17` | ⚠️ Double-booking bug is here |
| `src/services/availabilityService.js:5-17` | Slot generation (has dead branches) |
| `src/controllers/adminController.js` | ⚠️ weekCount bug is here |
| `src/entities/` | TypeORM EntitySchema definitions |
| `src/middleware/auth.js` | JWT verification middleware |
| `serverless.yml` | AWS Lambda + VPC config |