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
Razorpay credentials are backend-only: set `RAZORPAY_KEY_ID` and
`RAZORPAY_KEY_SECRET` to **Test Mode** credentials in `backend/.env`. Keep
`backend/.env` private and never expose or log the key secret.

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
  "currency": "USD",
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
Every newly created station must include a supported `currency` (`INR` or
`USD`) for its `pricePerKwh`. The admin form defaults new stations to INR and
labels the rate with its selected currency. Existing records without a
currency remain unknown: their rates are not converted or relabeled, and
reservations are blocked until an administrator verifies/configures the
currency. Changing an unknown rate requires explicitly configuring its
currency.

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
submits an estimated energy amount in kWh. The server copies the station's
current price per kWh and calculates the estimated total with the existing
formula. The booking is initially `pending_payment` and holds the slot for ten
minutes; it is not confirmed until the backend verifies its payment.

- `POST /api/bookings` — authenticated pending-payment reservation:
  `{ "slotId": "<slot-id>", "energyKwh": 24 }`.
- `GET /api/bookings/my` — authenticated user's bookings.
- `GET /api/bookings` — all bookings (admin only).
- `GET /api/bookings/:bookingId` — booking details (owner or admin).
- `PATCH /api/bookings/:bookingId/cancel` — cancel an eligible pending or
  confirmed booking before its slot starts (owner or admin); releases the slot.
- `PATCH /api/bookings/:bookingId/complete` — mark a confirmed booking
  completed after its slot ends (admin only).

Reservation uses an atomic conditional slot update (`available` to `booked`),
records which booking owns that slot hold, and enforces a unique partial index
across pending-payment and confirmed bookings. A backend expiration sweep runs
on startup and every 30 seconds; booking requests also expire overdue holds
before attempting to claim a slot. Expiration changes the booking to `expired`
and releases only the slot still owned by that booking. Cancellations are
allowed only before the slot starts. Completed, expired, started, or otherwise
ineligible bookings cannot be cancelled. Administrators can view all bookings,
cancel eligible bookings, and complete ended bookings.

The server computes the estimated booking total as `pricePerKwh × energyKwh`,
rounded to two decimal places, and snapshots the station rate, estimated
energy, total, and currency. Historical booking snapshots are never rewritten
when station pricing changes. Monetary displays use the currency stored on the
station or booking; records with missing/unsupported currency are shown as
unknown rather than assumed to be INR or USD. Mixed-currency amounts are not
combined in analytics.

## Razorpay Test Mode API

Payment endpoints are authenticated and restricted to the customer who owns
the booking. Razorpay orders are created only for pending bookings whose
immutable price snapshot explicitly uses INR. The backend derives integer
paise from the persisted two-decimal booking total; it never accepts an amount
from the client.

- `POST /api/payments/bookings/:bookingId/order` — create or reuse the
  booking's Razorpay order. Returns the public key ID, order ID, amount in
  paise, currency, and checkout display metadata.
- `POST /api/payments/bookings/:bookingId/verify` — verify a checkout result.
  Send `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.
  The backend verifies the HMAC signature, fetches the order and payment from
  Razorpay, checks captured status and exact amount/currency, and confirms the
  still-active reservation.

Repeated order requests reuse the persisted order, and an atomic booking lock
prevents concurrent order creation. Verification is idempotent for the same
captured payment. An order request can be retried during the ten-minute
reservation hold; after expiry the slot is released by the existing lifecycle.
If Razorpay reports a captured payment after the booking expired or was
cancelled, the booking remains inactive and is marked
`paymentReconciliationStatus: "manual_refund_required"`. Reconcile that
payment in the Razorpay dashboard and issue any refund manually; automated
refunds for late payments remain outside the cancellation flow.

## Cancellation and refunds

Customers may cancel their own pending or confirmed booking before its charging
slot starts; administrators may cancel any booking before that time. A paid
booking is eligible for the application's automatic **full refund** only when
its immutable booking currency is INR and its persisted Razorpay payment ID
still resolves to a captured payment with the exact snapshotted total and no
previously refunded amount. The backend does not accept a refund amount from
the caller. Pending unpaid holds are cancelled without a refund. Started,
completed, and expired bookings cannot be cancelled through this endpoint.

The cancellation route atomically marks a paid booking cancelled and claims
one refund attempt, then releases only the slot still owned by that booking.
It sends the full captured amount in paise to Razorpay with a stable
`voltslot_<bookingId>` receipt. Duplicate requests do not submit another
refund; while pending or requiring reconciliation, the customer can use
**Check refund status** to fetch a known refund or search Razorpay's refunds for
the stable receipt. `refundStatus` is `pending`, `completed`, `failed`, or
`manual_reconciliation_required`; only a provider fetch reporting `processed`
sets `paymentStatus` to `refunded`.

If a refund call has an ambiguous network outcome, the booking remains
cancelled and is marked `manual_reconciliation_required`; the application will
not blindly repeat the refund. Reconcile the payment and receipt in the
Razorpay dashboard. If a refund exists, status checking can reconcile it once
it appears in the provider's refund list. If no refund exists, an operator
must verify that fact before clearing the stored reconciliation state to allow
a new attempt. Keep the receipt and refund history; never clear the state based
only on a client report. Late payments after a pending booking was cancelled
or expired continue to use
`paymentReconciliationStatus: "manual_refund_required"` and require separate
manual refund handling.

If an order-creation network failure leaves its outcome ambiguous, the booking
retains an internal order-creation lock instead of risking a second active
Razorpay order. An operator must reconcile the Razorpay dashboard against the
booking before clearing that lock; do not remove it just to enable a retry.

The application does not automatically retry a refund after a failed or
ambiguous result, and it has no operator reconciliation endpoint. Do not clear
or edit stored refund state in the database to force another attempt. An
operator must reconcile the Razorpay payment, refund, and receipt first; any
further refund action must be performed and recorded through the approved
manual process.

### Database index readiness

Booking and slot indexes are declared in the Mongoose schemas; there is no
separate database migration script. The active booking uniqueness constraint
is the `active_booking_per_slot` unique partial index on `bookings.chargingSlot`
for `pending_payment` and `confirmed` bookings. The expiry sweep uses the
`status_1_pendingPaymentExpiresAt_1` index. Other declared indexes support
customer booking history, slot lookup, station geospatial search, station
city/status, and unique station/start/end schedules.

Do not assume an index exists merely because it is in a schema: verify against
the database selected by the backend's configured `MONGODB_URI`. In MongoDB
Atlas, open that database's **Collections → bookings → Indexes** and confirm
the `active_booking_per_slot` index is unique and has a partial filter covering
both active statuses, and confirm the booking expiry index exists. The
`chargingSlots` collection should also have its unique station/start/end index.
Alternatively, with the backend configured for the intended database, run
`Booking.collection.listIndexes().toArray()` from a one-off Node process after
loading the Booking model and connecting with `backend/config/db.js`; inspect
the returned index names, `unique` option, and partial filter. Do not print or
share the URI. Before creating a missing unique index, check for duplicate
active bookings per slot and resolve any conflicts with an explicit data
reconciliation plan; do not delete or reset records to make index creation
succeed.

### Manual local Razorpay Test Mode checklist

Use a local MongoDB database containing a future available slot at a station
whose currency was explicitly confirmed as INR, a customer account, and
Razorpay **Test Mode** credentials in `backend/.env`. Keep both key values
server-side; the frontend receives only the public key ID from the order API.
Start the backend and frontend locally. The tests mock Razorpay and do not
require credentials; no live-provider checks below were performed by the
automated test run.

1. **Booking and successful test payment:** sign in as a customer, reserve the
   future slot, and verify the pending summary shows the INR total and hold
   expiry. Select **Pay Now** and complete Checkout using a test payment
   method. Confirm the booking becomes confirmed only after the backend
   verification response, and the slot remains booked by that booking.
2. **Failed payment and Checkout dismissal:** on separate pending bookings,
   use a provider-supported Test Mode failure and dismiss Checkout. Verify the
   UI reports the failure/dismissal without marking the booking paid or
   confirmed, the hold remains bounded by its original expiry, and retry is
   offered only while the API still considers the booking eligible.
3. **Expired reservation:** leave a pending booking unpaid until its displayed
   ten-minute expiry and allow the backend sweep to run. Verify it becomes
   expired, its slot becomes available, and an order or verification retry
   cannot confirm it.
4. **Duplicate verification:** for a successfully captured Test Mode payment,
   replay the same valid verification request in the local browser's Network
   tools or an authenticated local API client. Confirm the second response is
   idempotent, the booking remains confirmed once, and no second payment is
   created. Do not alter the signature or replay a request against a live
   booking.
5. **Eligible cancellation and refund:** before the slot starts, cancel a paid
   booking as its owner. Verify it is cancelled, the slot is released, and
   the refund is displayed as completed only after a provider status fetch
   reports `processed`. Repeat cancellation/status checking and confirm it
   does not submit a duplicate refund.
6. **Failed or ambiguous refund:** use only a provider-supported Test Mode
   failure scenario, or the existing mocked tests, to exercise rejection and
   unknown network outcome handling. Confirm failed refunds remain failed and
   ambiguous outcomes require manual reconciliation; neither is shown as
   completed, and neither triggers a blind second refund request. Reconcile
   the provider dashboard before any separate manual action.
7. **Admin permissions and slot availability:** verify an administrator can
   cancel an eligible booking but cannot use customer payment APIs; a customer
   cannot cancel another customer's booking. After cancellation, verify the
   released slot is available, and that repeating a cancellation never
   releases a slot currently held by another booking.

The Checkout script is loaded from Razorpay at runtime; it is not bundled with
the frontend, and the private key secret is not sent to the browser or logged.
Backend payment and refund tests mock the Razorpay SDK and require no real
credentials or provider transactions.

For browser verification, sign in as a customer, open a station, choose a future
available slot, enter estimated kWh, and submit. The page shows the pending
payment hold, INR total (when explicitly priced in INR), and its expiry; eligible
pending INR bookings can be paid from the reservation summary or **My bookings**.
Open **My bookings** to verify it appears and cancel it before the slot starts. Sign in as an administrator to view all
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
