# VoltSlot

VoltSlot is a local MERN project for EV charging station management and slot
reservations. This setup includes a React/Vite frontend and an Express API connected to
MongoDB Atlas.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A MongoDB Atlas cluster, database user, and your current IP address allowed
  under Atlas Network Access.

## Install dependencies

Open a terminal in each project folder and run:

```powershell
cd frontend
npm install
```

```powershell
cd backend
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Set `MONGODB_URI` in `backend/.env` to the connection string provided by Atlas.
Replace the placeholders from `.env.example`; URL-encode any special characters
in the database user's password. Do not commit `.env`.
Set `JWT_SECRET` to a unique, randomly generated secret. The optional
`ADMIN_EMAIL` and `ADMIN_PASSWORD` values are used only when seeding the first
administrator; choose a unique password of at least 12 characters.
`CORS_ORIGINS` is a comma-separated allowlist for browser origins. The local
Vite origins shown in `.env.example` are allowed by default; add only trusted
frontend origins when changing the local setup. Login is limited to 10 attempts
per IP address per 15 minutes and registration to 10 per hour. JSON request
bodies are limited to 100 KB.

## Start the applications

In one terminal:

```powershell
cd frontend
npm run dev
```

In a second terminal:

```powershell
cd backend
npm run dev
```

The frontend runs at the Vite URL shown in its terminal (typically
http://localhost:5173). The backend connects to Atlas before listening on port
5000. The health endpoint at http://localhost:5000/api/health reports API and
database status separately; it returns HTTP 503 while the database is
disconnected.

The Vite frontend uses `/api` as its default API base and proxies those requests
to the local backend at `http://localhost:5000`. To change the frontend API base,
copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`.

## Authentication API

- `POST /api/auth/register` — create a customer account.
- `POST /api/auth/login` — authenticate and receive a one-hour bearer token.
- `GET /api/auth/me` — return the authenticated account; send the token in the
  `Authorization: Bearer <token>` header.
- `PATCH /api/auth/me` — update only the authenticated account's name and/or
  email; duplicate email addresses are rejected.

The frontend separates the **User Portal** and **Admin Portal** from the
VoltSlot landing page. User registration creates customer accounts only.
Customer and admin sign-in entry points check the account role before saving a
token. Customers land on `/user/dashboard`; administrators land on
`/admin/dashboard`. Logout removes the JWT from browser storage; expired or
rejected tokens are cleared automatically. Portal routes require the expected
signed-in role, and the backend independently enforces API permissions and
booking ownership.

To verify the normal customer journey locally, open the Vite URL, choose
**Create a customer account**, create an account, update the name or email under
**My profile**, reserve an available future slot from a station, and check it
under **My bookings**. Cancel it before the slot begins, then choose **Sign
out**. Trying to open `/user/profile` or `/user/bookings` after signing out
redirects to sign in.
Public registration always creates a customer; administrator accounts are
created only through the existing environment-configured seed process.

To create the initial administrator after setting `ADMIN_EMAIL` and
`ADMIN_PASSWORD` in `backend/.env`, run from the backend folder:

```powershell
npm run seed:admin
```

The seed refuses to overwrite an existing account with that email.

## Charging stations API

Station listing and details are public. Creating, updating, and deleting a
station require an admin bearer token.

- `GET /api/stations` — list stations; optional filters: `city`,
  `connectorType`, `status`, `availability` (`available` or `unavailable`),
  `search`, `longitude`, `latitude`, and `maxDistance` (meters; defaults to
  10,000 when coordinates are supplied). Each station includes `availableSlots`,
  the count of future slots currently marked available.
- `GET /api/stations/:id` — retrieve a station by MongoDB ID.
- `POST /api/stations` — create a station (admin only).
- `PUT /api/stations/:id` — update provided station fields (admin only).
- `DELETE /api/stations/:id` — delete a station (admin only).

Station deletion is rejected while slots or bookings still reference that
station, preserving reservation history and preventing orphaned records.

Example create request body:

```json
{
  "name": "Campus Charging",
  "description": "Fast charging near campus.",
  "address": "1 College Road",
  "city": "Example City",
  "location": {
    "type": "Point",
    "coordinates": [-122.3, 47.6]
  },
  "connectorTypes": ["CCS", "Type 2"],
  "pricePerKwh": 0.35,
  "openingHours": {
    "opens": "06:00",
    "closes": "22:00"
  },
  "status": "active"
}
```

Successful create/update responses contain `{ "message": "...", "station": { ... } }`.
The station list response contains `{ "stations": [...] }`; the detail response
contains `{ "station": { ... } }`.

## Charging slots API

Slots are scheduled under a station and can be listed publicly. Admin bearer
authentication is required to create, update, activate/deactivate, or delete a
slot.

- `GET /api/stations/:stationId/slots` — list a station's slots by start time.
- `POST /api/stations/:stationId/slots` — create a slot (admin only).
- `PUT /api/stations/:stationId/slots/:slotId` — update its times or availability
  (admin only).
- `DELETE /api/stations/:stationId/slots/:slotId` — delete an unbooked slot
  (admin only).

The current `ChargingSlot` schema contains `startTime`, `endTime`, and status
(`available`, `booked`, or `unavailable`). It does not define a slot number,
connector type per slot, or charging power. Booking workflows own the `booked`
status. The API rejects edits that change a booked or referenced slot's schedule,
blocks deactivation for confirmed bookings, and blocks deletion whenever a
booking references the slot.

Example request:

```http
POST /api/stations/507f1f77bcf86cd799439011/slots
Authorization: Bearer <admin-token>
Content-Type: application/json
```

```json
{
  "startTime": "2026-11-01T10:00:00.000Z",
  "endTime": "2026-11-01T11:00:00.000Z"
}
```

The successful response is `{ "message": "Charging slot created.", "slot": { ... } }`.
To manually verify in the browser, sign in as an administrator, open a station's
details page, and use **Add slot**, **Edit**, **Deactivate/Activate**, or **Delete**.
The station details page also displays public slot schedules for guests.

## Slot reservations and bookings

Reservations claim an existing future `available` slot; the slot's stored start
and end times define the booking date, start time, and duration. The customer
submits an estimated energy amount in kWh because the existing Booking schema
requires it for its price snapshot. The server copies the station's current
price per kWh and calculates the estimated total. This is not a payment.

- `POST /api/bookings` — authenticated reservation:
  `{ "slotId": "<slot-id>", "energyKwh": 24 }`.
- `GET /api/bookings/my` — authenticated user's bookings.
- `GET /api/bookings` — all bookings (admin only).
- `GET /api/bookings/:bookingId` — booking details (owner or admin).
- `PATCH /api/bookings/:bookingId/cancel` — cancel a confirmed booking before
  its slot starts (owner or admin); releases the slot.
- `PATCH /api/bookings/:bookingId/complete` — mark a confirmed booking
  completed after its slot ends (admin only).

Reservation uses an atomic conditional slot update (`available` to `booked`) and
a unique partial index for confirmed bookings, preventing simultaneous
reservations of the same slot. Cancellations are allowed only before the slot
starts. Completed, cancelled, started, or otherwise ineligible bookings cannot
be cancelled. Administrators can view all bookings, cancel eligible bookings,
and complete ended bookings.

For browser verification, sign in as a customer, open a station, choose a future
available slot, enter estimated kWh, and confirm. The confirmation shows the
scheduled time and estimated total. Open **My bookings** to verify it appears
and cancel it before the slot starts. Sign in as an administrator to view all
bookings from **Manage bookings** and complete a reservation only after its
scheduled end.

## Portals

- `/` — landing page with separate User Portal and Admin Portal entry points,
  plus public station browsing.
- `/user/login` and `/user/register` — customer sign-in and customer-only
  registration.
- `/user/dashboard` — station search, supported filters, station details,
  slot availability, reservation, and confirmation.
- `/user/bookings` and `/user/profile` — the signed-in customer's bookings and
  own profile.
- `/admin/login` and `/admin/dashboard` — administrator sign-in and real counts
  for stations, slots, available slots, and bookings.
- `/admin/stations` and `/admin/bookings` — administrator station/slot and
  booking management.

Admin analytics (station/slot counts, booking status totals, recent bookings,
and most-booked stations) come from the admin-protected
`GET /api/admin/dashboard` endpoint. The customer dashboard reads
`GET /api/user/dashboard`, which requires a customer token and matches all
booking analytics to that token's user ID before computing metrics. No
user-list endpoint is exposed; user records are not displayed in the admin
portal.

The user dashboard route is `/user/dashboard`; station search remains at
`/user/stations`. The dashboard displays booking totals by status, the total
count of future confirmed bookings, a bounded upcoming list, and recent
activity. The total upcoming count is computed independently from the
five-entry preview list.

## Tests and build

The frontend test command runs the Vitest component suite and Playwright browser
flows. Install the Chromium browser once after installing frontend dependencies:

```powershell
cd frontend
npx playwright install chromium
npm test
npm run build
```

The browser tests stub API responses and never write to MongoDB Atlas. The
backend tests use isolated mocks; they do not reset or modify the configured
Atlas database.

```powershell
cd backend
npm test
```

## Station browser flow

Open the Vite URL to browse stations and use the search, city, connector,
upcoming slot availability, and station status filters. Open a station card
for its detail page. Use the **Admin
Portal** entry point to sign in with an administrator account; administrators
can add, edit, activate/deactivate, and safely delete stations under **Stations
& slots**. A station with slots or bookings cannot be deleted.
