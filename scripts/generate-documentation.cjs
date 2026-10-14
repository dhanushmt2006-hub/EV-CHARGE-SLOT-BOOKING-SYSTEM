const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const docs = path.join(root, 'docs')
const generatedAt = new Date().toISOString().slice(0, 10)

const styles = `
  @page { size: A4; margin: 19mm 17mm 19mm; }
  * { box-sizing: border-box; }
  body { color: #1f2d27; font: 10pt/1.52 Arial, Helvetica, sans-serif; }
  h1, h2, h3, h4 { color: #103c2d; line-height: 1.2; break-after: avoid; }
  h1 { font-size: 25pt; margin: 0 0 12pt; }
  h2 { font-size: 17pt; margin: 23pt 0 8pt; border-bottom: 1px solid #d6e5dd; padding-bottom: 5pt; }
  h3 { font-size: 12pt; margin: 14pt 0 5pt; }
  h4 { font-size: 10pt; margin: 10pt 0 4pt; }
  p { margin: 4pt 0 8pt; }
  ul, ol { margin: 4pt 0 9pt; padding-left: 19pt; }
  li { margin: 2pt 0; }
  a { color: #16734a; text-decoration: none; }
  code, pre { font-family: Consolas, 'Courier New', monospace; }
  code { font-size: 8.5pt; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f1f6f3; border-left: 3px solid #269663; padding: 9pt; font-size: 8pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 13pt; font-size: 8.3pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { color: #fff; background: #15533c; text-align: left; font-weight: 700; }
  th, td { border: 1px solid #cbd8d1; padding: 5pt 6pt; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) { background: #f4f8f6; }
  .cover { min-height: 250mm; display: flex; flex-direction: column; justify-content: center; text-align: center; break-after: page; }
  .cover .mark { color: #178553; font-size: 13pt; letter-spacing: 3px; font-weight: 700; margin-bottom: 32pt; }
  .cover h1 { font-size: 29pt; max-width: 155mm; margin: 0 auto 12pt; }
  .cover .subtitle { font-size: 16pt; max-width: 150mm; margin: 0 auto 24pt; color: #4a6658; }
  .cover .rule { width: 55mm; border-top: 3px solid #1b9860; margin: 0 auto 25pt; }
  .cover .meta { width: 130mm; margin: 0 auto; text-align: left; font-size: 10pt; }
  .cover .meta td { border: 0; border-bottom: 1px solid #dce5df; padding: 6pt 4pt; }
  .cover .meta td:first-child { width: 42%; font-weight: 700; color: #15533c; }
  .cover .year { margin-top: 24pt; color: #5a7064; font-size: 10pt; }
  .toc { break-after: page; }
  .toc ol { list-style: none; padding: 0; }
  .toc li { border-bottom: 1px dotted #b8c9bf; padding: 5pt 2pt; margin: 0; }
  .toc a { color: #214d39; }
  .lead { font-size: 11.5pt; color: #456354; }
  .callout { background: #edf6f0; border-left: 4px solid #24975c; padding: 9pt 12pt; margin: 9pt 0 12pt; break-inside: avoid; }
  .warn { background: #fff5df; border-left-color: #da9c2f; }
  .muted { color: #63746b; font-size: 8.5pt; }
  .diagram { margin: 11pt 0 4pt; padding: 8pt; border: 1px solid #d7e3dc; background: #fbfdfb; break-inside: avoid; }
  .diagram svg { width: 100%; height: auto; display: block; }
  .caption { font-size: 8.5pt; text-align: center; color: #596b60; margin: 2pt 0 10pt; }
  .placeholder { min-height: 35mm; border: 1.5px dashed #91a99a; background: #f8faf8; display: flex; align-items: center; justify-content: center; text-align: center; color: #607367; padding: 12pt; margin: 8pt 0; break-inside: avoid; }
  .small { font-size: 8.5pt; }
  .nowrap { white-space: nowrap; }
  .section-start { break-before: page; }
  .check { color: #146c43; font-weight: 700; }
  .no-break { break-inside: avoid; }
`

const architectureSvg = `
<svg viewBox="0 0 820 325" role="img" aria-label="VoltSlot frontend, Express API, and MongoDB architecture">
 <defs><marker id="a" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#398365"/></marker></defs>
 <rect x="20" y="52" width="220" height="155" rx="14" fill="#eaf5ee" stroke="#34865f" stroke-width="2"/>
 <text x="130" y="83" text-anchor="middle" font-size="18" font-weight="700" fill="#164b32">React frontend</text>
 <text x="130" y="112" text-anchor="middle" font-size="13" fill="#314b3c">Vite · React Router</text>
 <text x="130" y="137" text-anchor="middle" font-size="13" fill="#314b3c">User and admin portals</text>
 <text x="130" y="162" text-anchor="middle" font-size="13" fill="#314b3c">Axios · Bearer JWT</text>
 <text x="130" y="187" text-anchor="middle" font-size="12" fill="#64766a">Browser / localStorage token</text>
 <rect x="300" y="52" width="220" height="155" rx="14" fill="#eef2fa" stroke="#6178aa" stroke-width="2"/>
 <text x="410" y="83" text-anchor="middle" font-size="18" font-weight="700" fill="#293f70">Express API</text>
 <text x="410" y="112" text-anchor="middle" font-size="13" fill="#394763">Routes · validation</text>
 <text x="410" y="137" text-anchor="middle" font-size="13" fill="#394763">JWT auth · role checks</text>
 <text x="410" y="162" text-anchor="middle" font-size="13" fill="#394763">Booking conflict handling</text>
 <text x="410" y="187" text-anchor="middle" font-size="12" fill="#647089">JSON over HTTP</text>
 <rect x="580" y="52" width="220" height="155" rx="14" fill="#f8f2e8" stroke="#be8a37" stroke-width="2"/>
 <text x="690" y="83" text-anchor="middle" font-size="18" font-weight="700" fill="#73531e">MongoDB</text>
 <text x="690" y="112" text-anchor="middle" font-size="13" fill="#55482d">Mongoose models</text>
 <text x="690" y="137" text-anchor="middle" font-size="13" fill="#55482d">Users · stations · slots</text>
 <text x="690" y="162" text-anchor="middle" font-size="13" fill="#55482d">Bookings · indexes</text>
 <text x="690" y="187" text-anchor="middle" font-size="12" fill="#786b53">MONGODB_URI at runtime</text>
 <line x1="242" y1="128" x2="292" y2="128" stroke="#398365" stroke-width="3" marker-end="url(#a)"/>
 <text x="267" y="114" text-anchor="middle" font-size="11" fill="#315d46">HTTPS / JSON</text>
 <line x1="298" y1="155" x2="248" y2="155" stroke="#7b91ba" stroke-width="2" marker-end="url(#a)"/>
 <line x1="522" y1="128" x2="572" y2="128" stroke="#398365" stroke-width="3" marker-end="url(#a)"/>
 <text x="547" y="114" text-anchor="middle" font-size="11" fill="#315d46">Mongoose</text>
 <line x1="578" y1="155" x2="528" y2="155" stroke="#7b91ba" stroke-width="2" marker-end="url(#a)"/>
 <rect x="172" y="247" width="476" height="51" rx="10" fill="#f5f8f6" stroke="#bbccc1"/>
 <text x="410" y="269" text-anchor="middle" font-size="13" font-weight="700" fill="#345644">Access control is enforced by backend middleware and route ownership checks</text>
 <text x="410" y="288" text-anchor="middle" font-size="11" fill="#61766a">UI visibility improves usability; it is not a security boundary</text>
</svg>`

const erSvg = `
<svg viewBox="0 0 820 405" role="img" aria-label="VoltSlot entity relationship diagram">
 <defs><marker id="e" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#4d8065"/></marker></defs>
 <g font-family="Arial" font-size="13">
  <rect x="18" y="42" width="210" height="138" rx="8" fill="#eaf5ee" stroke="#34865f" stroke-width="2"/>
  <text x="123" y="67" text-anchor="middle" font-size="17" font-weight="700" fill="#164b32">User</text>
  <text x="34" y="94" fill="#314b3c">_id · name · email</text><text x="34" y="117" fill="#314b3c">password · role</text><text x="34" y="140" fill="#314b3c">createdAt · updatedAt</text>
  <rect x="302" y="20" width="235" height="169" rx="8" fill="#eef2fa" stroke="#6178aa" stroke-width="2"/>
  <text x="419" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="#293f70">ChargingStation</text>
  <text x="320" y="74" fill="#394763">_id · name · address · city</text><text x="320" y="98" fill="#394763">location · connectorTypes</text><text x="320" y="122" fill="#394763">pricePerKwh · openingHours</text><text x="320" y="146" fill="#394763">status · timestamps</text>
  <rect x="592" y="42" width="210" height="138" rx="8" fill="#f8f2e8" stroke="#be8a37" stroke-width="2"/>
  <text x="697" y="67" text-anchor="middle" font-size="17" font-weight="700" fill="#73531e">ChargingSlot</text>
  <text x="608" y="94" fill="#55482d">_id · chargingStation</text><text x="608" y="117" fill="#55482d">startTime · endTime</text><text x="608" y="140" fill="#55482d">status · timestamps</text>
  <rect x="276" y="244" width="274" height="143" rx="8" fill="#f6eef5" stroke="#9b6996" stroke-width="2"/>
  <text x="413" y="270" text-anchor="middle" font-size="17" font-weight="700" fill="#624062">Booking</text>
  <text x="294" y="298" fill="#59455c">_id · customer (User ref)</text><text x="294" y="321" fill="#59455c">chargingStation / chargingSlot refs</text><text x="294" y="344" fill="#59455c">bookingDate · status · price</text><text x="294" y="367" fill="#59455c">createdAt · updatedAt</text>
  <line x1="228" y1="111" x2="287" y2="111" stroke="#4d8065" stroke-width="2" marker-end="url(#e)"/>
  <text x="257" y="99" text-anchor="middle" font-size="11" fill="#3d5a48">1 : many</text>
  <line x1="537" y1="104" x2="582" y2="104" stroke="#4d8065" stroke-width="2" marker-end="url(#e)"/>
  <text x="559" y="91" text-anchor="middle" font-size="11" fill="#3d5a48">1 : many</text>
  <path d="M 126 183 L 126 222 L 320 222 L 320 235" fill="none" stroke="#4d8065" stroke-width="2" marker-end="url(#e)"/>
  <text x="208" y="216" text-anchor="middle" font-size="11" fill="#3d5a48">customer</text>
  <path d="M 419 190 L 419 235" fill="none" stroke="#4d8065" stroke-width="2" marker-end="url(#e)"/>
  <text x="458" y="218" text-anchor="middle" font-size="11" fill="#3d5a48">station</text>
  <path d="M 697 183 L 697 222 L 506 222 L 506 235" fill="none" stroke="#4d8065" stroke-width="2" marker-end="url(#e)"/>
  <text x="604" y="216" text-anchor="middle" font-size="11" fill="#3d5a48">slot</text>
 </g>
</svg>`

const mainSections = [
  ['abstract', 'Abstract'],
  ['introduction', 'Introduction'],
  ['systems', 'Existing and Proposed Systems'],
  ['requirements', 'Software and Hardware Requirements'],
  ['architecture', 'System Architecture'],
  ['modules', 'System Modules'],
  ['database', 'Database Design'],
  ['api', 'API Documentation'],
  ['implementation', 'Implementation Details'],
  ['manual', 'User Manual'],
  ['testing', 'Testing and Results'],
  ['security', 'Security Considerations'],
  ['limitations', 'Limitations and Future Enhancements'],
  ['conclusion', 'Conclusion'],
  ['references', 'References'],
]

const apiRows = [
  ['GET', '/api/health', 'API and database readiness', 'None', '200 or 503'],
  ['POST', '/api/auth/register', 'Create customer account', 'None', '201'],
  ['POST', '/api/auth/login', 'Authenticate and issue JWT', 'None', '200'],
  ['GET', '/api/auth/me', 'Get current account', 'Any valid JWT', '200'],
  ['PATCH', '/api/auth/me', 'Update own name/email', 'Any valid JWT', '200'],
  ['GET', '/api/user/dashboard', 'Customer booking summary and activity', 'customer', '200'],
  ['GET', '/api/admin/dashboard', 'Station, slot and booking analytics', 'admin', '200'],
  ['GET', '/api/stations', 'List/filter stations and upcoming availability', 'None', '200'],
  ['GET', '/api/stations/:id', 'Get one station', 'None', '200'],
  ['POST', '/api/stations', 'Create station', 'admin', '201'],
  ['PUT', '/api/stations/:id', 'Update station', 'admin', '200'],
  ['DELETE', '/api/stations/:id', 'Delete station without dependent slots/bookings', 'admin', '200 / 409'],
  ['GET', '/api/stations/:stationId/slots', 'List slots in start-time order', 'None', '200'],
  ['POST', '/api/stations/:stationId/slots', 'Create slot', 'admin', '201'],
  ['PUT', '/api/stations/:stationId/slots/:slotId', 'Update schedule/status', 'admin', '200 / 409'],
  ['DELETE', '/api/stations/:stationId/slots/:slotId', 'Delete slot without booking history', 'admin', '200 / 409'],
  ['POST', '/api/bookings', 'Claim available future slot and create booking', 'customer (JWT)', '201 / 403 / 409'],
  ['GET', '/api/bookings/my', 'List bookings for token subject', 'Any valid JWT', '200'],
  ['GET', '/api/bookings', 'List all bookings', 'admin', '200'],
  ['GET', '/api/bookings/:bookingId', 'Read own booking or any booking as admin', 'Owner or admin', '200 / 403'],
  ['PATCH', '/api/bookings/:bookingId/cancel', 'Cancel eligible owner booking; admin may cancel any', 'Owner or admin', '200 / 403 / 409'],
  ['PATCH', '/api/bookings/:bookingId/complete', 'Mark ended confirmed booking completed', 'admin', '200 / 409'],
]

function table(headers, rows, widths) {
  const colgroup = widths ? `<colgroup>${widths.map((width) => `<col style="width:${width}%">`).join('')}</colgroup>` : ''
  return `<table>${colgroup}<thead><tr>${headers.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

function placeholder(title, instructions) {
  return `<div class="placeholder"><div><strong>[SCREENSHOT PLACEHOLDER: ${title}]</strong><br>${instructions}</div></div>`
}

function toc(items) {
  return `<nav class="toc"><h1>Contents</h1><ol>${items.map(([id, title]) => `<li><a href="#${id}">${title}</a></li>`).join('')}</ol></nav>`
}

function cover(shortTitle) {
  return `<section class="cover"><div class="mark">V O L T S L O T</div><h1>VoltSlot</h1><p class="subtitle">EV Charging Station Management and Slot Reservation System</p><div class="rule"></div><p class="lead">${shortTitle}</p><table class="meta"><tbody>
    <tr><td>Student name</td><td>[Enter student name]</td></tr>
    <tr><td>USN</td><td>[Enter USN]</td></tr>
    <tr><td>Department</td><td>[Enter department]</td></tr>
    <tr><td>College</td><td>[Enter college name]</td></tr>
    <tr><td>Project guide</td><td>[Enter guide name]</td></tr>
    <tr><td>Academic year</td><td>[Enter academic year]</td></tr>
    </tbody></table><p class="year">Prepared from the VoltSlot source code · ${generatedAt}</p></section>`
}

function commonStyles() {
  return `<style>${styles}</style>`
}

function referenceList() {
  return `<ol>
    <li>React documentation, <a href="https://react.dev/learn">https://react.dev/learn</a></li>
    <li>Node.js documentation, <a href="https://nodejs.org/docs/latest/api/">https://nodejs.org/docs/latest/api/</a></li>
    <li>Express documentation, <a href="https://expressjs.com/">https://expressjs.com/</a></li>
    <li>MongoDB manual, <a href="https://www.mongodb.com/docs/manual/">https://www.mongodb.com/docs/manual/</a></li>
    <li>Mongoose documentation, <a href="https://mongoosejs.com/docs/">https://mongoosejs.com/docs/</a></li>
    <li>JSON Web Token introduction, <a href="https://jwt.io/introduction">https://jwt.io/introduction</a>. VoltSlot uses the <code>jsonwebtoken</code> npm package to sign and verify bearer tokens.</li>
    <li>Vite documentation, <a href="https://vite.dev/guide/">https://vite.dev/guide/</a></li>
    <li>Bootstrap documentation, <a href="https://getbootstrap.com/docs/5.3/">https://getbootstrap.com/docs/5.3/</a></li>
    </ol><p class="muted">References are vendor/project documentation; retrieved for this report on ${generatedAt}. The implementation-specific descriptions in this report are based on the source code in this repository.</p>`
}

function mainReport() {
  const apiTable = table(['Method', 'Endpoint', 'Purpose', 'Authentication / authorization', 'Success / notable result'], apiRows, [9, 26, 25, 26, 14])
  const modelTable = table(['Model / collection', 'Fields (type; constraints/defaults)', 'Relations / indexes'], [
    ['User<br><code>users</code>', '<code>name</code> String required, trimmed, 2–100; <code>email</code> String required, unique, lowercase, valid email, max 254; <code>password</code> String required, select:false; <code>role</code> enum customer/admin, default customer; timestamps.', 'Created by registration or administrator seed. Password hashed with bcrypt cost 12 in registration and model save hook.'],
    ['ChargingStation<br><code>chargingstations</code>', '<code>name</code> String required, max 150; <code>description</code> String optional, max 2000; <code>address</code> String required, max 300; <code>city</code> String required, max 100; <code>location</code> GeoJSON Point with [longitude, latitude] bounds; <code>connectorTypes</code> nonempty enum list; <code>pricePerKwh</code> Number >= 0; <code>openingHours</code> required opens/closes HH:mm; <code>status</code> active/inactive/maintenance default active; timestamps.', '2dsphere index on location; compound index city/status. Opening hours is embedded without its own _id.'],
    ['ChargingSlot<br><code>chargingslots</code>', '<code>chargingStation</code> ObjectId ref required; <code>startTime</code>, <code>endTime</code> Date required and end later than start; <code>status</code> available/booked/unavailable default available; timestamps.', 'Many slots belong to one station. Unique compound index station + start + end.'],
    ['Booking<br><code>bookings</code>', '<code>customer</code>, <code>chargingStation</code>, <code>chargingSlot</code> ObjectId refs required; <code>bookingDate</code> Date required default now; <code>status</code> confirmed/cancelled/completed default confirmed; <code>price</code> object with pricePerKwh, energyKwh, totalAmount (Numbers >=0), currency (uppercase three-letter code default USD); timestamps.', 'References one user, one station, one slot. Indexes customer/date and slot/status; partial unique index allows at most one confirmed booking per slot.'],
  ], [17, 58, 25])

  return `<!doctype html><html><head><meta charset="utf-8">${commonStyles()}<title>VoltSlot Project Documentation</title></head><body>
    ${cover('Project Documentation Report')}${toc(mainSections)}
    <h1 id="abstract">Abstract</h1>
    <p class="lead">VoltSlot is a web application for finding electric-vehicle charging stations, publishing scheduled charging slots, reserving available slots, and managing station operations.</p>
    <p>The system uses a React single-page frontend and an Express/Node.js REST API backed by MongoDB through Mongoose. Customers can register, authenticate, browse and filter station listings, view schedules, place a reservation, review their own booking history, and cancel eligible bookings. Administrators have a separate portal for station and slot maintenance, booking oversight, and operational analytics. The backend validates inputs, verifies JWT bearer tokens, requires customer role for reservation creation, applies role checks to administrator and customer analytics operations, restricts booking reads/actions by ownership where applicable, and atomically claims a specific available slot against competing reservations.</p>
    <p>This report documents the implementation visible in the repository and the automated tests executed while generating it. Personal/college fields remain editable placeholders. No live database mutation or application screenshot is represented as having occurred.</p>

    <h2 id="introduction">1. Introduction</h2>
    <h3>Background</h3><p>EV drivers need reliable information about charging locations and times, while station operators need a way to maintain location details and availability. VoltSlot models stations and scheduled charging slots and connects a reservation to a customer, station, and slot.</p>
    <h3>Problem statement</h3><p>Without a shared directory and booking workflow, customers may not know where future capacity exists, while administrators need a controlled interface to maintain station data, publish slots, and oversee reservations. VoltSlot provides a single web application for these tasks.</p>
    <h3>Motivation</h3><p>The project demonstrates a full-stack implementation of authenticated role-specific workflows, REST API validation, document modelling, and automated tests for common authorization and scheduling cases.</p>
    <h3>Objectives</h3><ul><li>Provide customer registration, sign-in, profile editing, and a customer dashboard.</li><li>Allow station discovery with text, city, connector, operational-status, availability, and optional proximity filters.</li><li>Allow customers to reserve available future slots and manage eligible bookings.</li><li>Give administrators station, slot, and booking management plus summary analytics.</li><li>Enforce authentication, role policies, input constraints, booking ownership, and reservation conflict controls on the API.</li></ul>
    <h3>Scope and limitations</h3><p>Implemented scope includes the browser UI, REST API, MongoDB/Mongoose persistence, JWT authentication, role-gated portals, station/slot/booking flows, analytics, and automated unit/API/browser tests. This repository does not implement payment processing, live charger telemetry, notification delivery, or a deployment workflow. Browser tests stub API responses and backend tests use mocked Mongoose operations; neither proves persistence against a production database.</p>

    <h2 id="systems">2. Existing System and Proposed System</h2>
    <h3>Existing-system context</h3><p>For a project report, the baseline is the common fragmented process of consulting separate station listings and coordinating availability/reservations manually. This is contextual framing, not a measured comparison against a named installed competitor or prior VoltSlot release.</p>
    <h3>Limitations addressed</h3><ul><li>Station descriptions, connectors, location, and schedule information may be managed in different places.</li><li>Customers can lack a consistent view of upcoming availability and booking history.</li><li>Administrators need separated tools for operational data and customer booking review.</li><li>Manual reservation coordination can leave race conditions or unclear ownership unless the service validates and claims a slot.</li></ul>
    <h3>Proposed solution</h3><p>VoltSlot provides a customer station directory and booking workflow alongside an administrator portal. The backend exposes validated station, slot, booking, account, and dashboard endpoints; MongoDB stores the system records, and indexes support lookups and confirmed-slot uniqueness.</p>
    <h3>Advantages</h3><ul><li>Role-specific navigation and workflows.</li><li>Station search and schedule visibility in one interface.</li><li>Server-side reservation checks and a database uniqueness constraint for confirmed bookings per slot.</li><li>Ownership-aware customer booking retrieval and cancellation rules.</li><li>Admin summaries, booking-status charts, and most-booked station analytics.</li></ul>

    <h2 id="requirements">3. Software and Hardware Requirements</h2>
    ${table(['Category', 'Implementation / recommendation'], [
      ['Frontend', 'React 19, React Router 7, Vite 8, Axios, Bootstrap 5, Recharts and React Icons (package manifest dependencies).'],
      ['Backend', 'Node.js (runtime exercised here: v24.19.0), Express 5, Mongoose 9, bcrypt, jsonwebtoken, express-validator, express-rate-limit, Helmet, CORS.'],
      ['Database', 'MongoDB configured by backend environment variable MONGODB_URI; server startup connects to MongoDB before listening.'],
      ['Development / tests', 'npm, Vite, Vitest, React Testing Library, Playwright, Node built-in test runner, Supertest.'],
      ['Browser', 'Current desktop/mobile browser with JavaScript and localStorage enabled; internet/reachability to the configured API and database is required for live operations.'],
      ['Practical local hardware (recommendation)', '64-bit computer, 4 CPU cores, 8 GB RAM, and at least 2 GB free disk for source/dependencies/build output. These are practical recommendations, not application-enforced minimums.'],
      ['Network / security configuration', 'Reachable MongoDB deployment and environment configuration for MONGODB_URI and JWT_SECRET; configure CORS_ORIGINS when the frontend is served from a non-local origin. Do not place credentials in reports or source control.'],
    ], [25, 75])}

    <h2 id="architecture">4. System Architecture</h2>
    <div class="diagram">${architectureSvg}</div><p class="caption">Figure 1. VoltSlot logical three-tier web architecture (derived from app setup and API client).</p>
    <h3>Components</h3><ul><li><strong>Frontend:</strong> React SPA using React Router for public, customer, and admin pages; Axios calls the API and adds a Bearer token from browser localStorage.</li><li><strong>Backend:</strong> Express app mounts authentication, customer/admin analytics, stations, nested slot, and booking routers under <code>/api</code>. Helmet, CORS policy, JSON body limit, JWT middleware, validation, and centralized error handling are configured in <code>backend/app.js</code>.</li><li><strong>Database:</strong> MongoDB collections are represented by Mongoose models. The server connects through <code>MONGODB_URI</code> before starting its listener.</li></ul>
    <h3>Data flow</h3><ol><li>The browser submits a form or loads a page and calls the REST API with JSON; authenticated calls attach <code>Authorization: Bearer &lt;token&gt;</code>.</li><li>Express validates request values and, where configured, authenticates the JWT and checks a role.</li><li>Route handlers read or update Mongoose documents and perform booking/slot checks.</li><li>The API responds with JSON and a suitable status; React updates the page or renders an error.</li></ol>

    <h2 id="modules">5. System Modules</h2>
    <h3>Authentication and profile</h3><p>Registration creates customer accounts only; passwords must include uppercase, lowercase, and a digit and be 8–72 characters/bytes according to route validation. bcrypt hashes passwords at cost 12. Login verifies the hash and issues a JWT with role, subject, and one-hour expiry. The client restores a session through <code>GET /auth/me</code>; profile updates accept name and email.</p>
    <h3>Admin Portal</h3><p>Protected admin routes include an operations dashboard, station list/form, slot tools on station details, and booking review. Admins can add/edit/delete stations, create/edit/activate/deactivate/delete slots subject to booking dependencies, filter bookings by status, cancel reservations, and mark ended confirmed bookings completed.</p>
    <h3>User Portal</h3><p>Customer pages include booking metrics and activity, station browsing/details, My Bookings, and profile editing. The shared slot view offers reserve controls to customer-role accounts; unauthenticated visitors are directed to sign in. Admin slot views expose management actions instead of reservation controls.</p>
    <h3>Station management</h3><p>Station records contain address/city, coordinates, connector types, kWh price, opening hours, and active/inactive/maintenance status. Admin-only create/update/delete routes validate model data. Deletion is rejected while slot or booking records depend on a station.</p>
    <h3>Slot management</h3><p>Each slot belongs to a station and has start/end timestamps and available/booked/unavailable status. Only admins create or edit slots. The API rejects invalid ranges and duplicate station/time intervals, and prevents deleting or rescheduling slots referenced by booking history.</p>
    <h3>Booking and cancellation</h3><p>The reservation handler validates an ObjectId and positive finite energy estimate, atomically changes an available future slot to booked, requires an active station, computes the estimated total from station price, and creates a confirmed booking. A partial unique index provides a second guard against duplicate confirmed bookings for one slot. Customer cancellation is restricted to the booking owner, before the slot starts; cancellation releases the slot. Admins can cancel any eligible booking and can complete a confirmed booking only after the slot ends.</p>
    <h3>Dashboards and analytics</h3><p>The customer dashboard aggregates only the token subject's booking data, status totals, upcoming count/list, and recent activity. Admin analytics aggregate station/slot counts, booking status totals, recent bookings, and top stations. Charts are rendered in React with Recharts.</p>
    <h3>Authorization and security</h3><p>Route guards improve UI routing, but API middleware is the security boundary. Administrator station/slot/dashboard endpoints require admin role; customer dashboard and booking creation require customer role. Booking reads and cancellation check ownership or administrator status.</p>

    <h2 id="database">6. Database Design</h2>
    <div class="diagram">${erSvg}</div><p class="caption">Figure 2. Entity relationships from Mongoose references. A confirmed slot can have at most one booking at a time.</p>
    ${modelTable}
    <h3>Relationships and integrity</h3><ul><li>One station can have many charging slots.</li><li>Each booking references one customer account, one station, and one charging slot. The schema stores ObjectId references; the API populates or joins display details when returning bookings.</li><li>Customer booking lists filter by the authenticated user ID rather than accepting an arbitrary customer ID.</li><li>A unique partial index on <code>chargingSlot</code> where status is <code>confirmed</code> prevents multiple confirmed bookings per slot. A slot/time compound unique index prevents duplicate schedules within the same station.</li><li>Station deletion is blocked when slots or bookings reference it. Slot schedule changes/deletion are blocked when any historical booking depends on the slot.</li></ul>

    <h2 id="api">7. API Documentation</h2>
    <p>All API paths below are prefixed with <code>/api</code>. The server returns JSON. “JWT” means <code>Authorization: Bearer &lt;token&gt;</code>. Roles use the backend values <code>customer</code> and <code>admin</code>.</p>
    ${apiTable}
    <h3>Request payloads (field summary)</h3>
    ${table(['Operation', 'Body / query fields evidenced by handlers'], [
      ['Register', '<code>{ name, email, password }</code>; optional role is accepted only as customer.'],
      ['Login', '<code>{ email, password }</code>.'],
      ['Profile PATCH', '<code>{ name?, email? }</code>; at least one allowed field and no other fields.'],
      ['Station create/update', 'Editable fields: <code>name, description, address, city, location, connectorTypes, pricePerKwh, openingHours, status</code>. <code>location</code> uses GeoJSON Point coordinates [longitude, latitude].'],
      ['Slot create/update', 'Create requires ISO <code>startTime</code> and <code>endTime</code>; update accepts schedule and/or <code>status: available|unavailable</code>. Booking transitions control booked status.'],
      ['Booking create', '<code>{ slotId, energyKwh }</code>; energyKwh must be a finite number greater than zero.'],
      ['Station list query', '<code>city, connectorType, status, availability, search, longitude, latitude, maxDistance</code>; maxDistance is in meters, 1–50,000. Coordinates must be supplied together.'],
      ['Cancel / complete', 'No request body required; booking ID is a URL parameter.'],
    ], [24, 76])}
    <h3>Representative response shapes</h3><pre>POST /api/auth/login → 200
{ "message": "Login successful.", "token": "&lt;JWT&gt;", "user": { "id": "...", "name": "...", "email": "...", "role": "customer" } }

GET /api/stations → 200
{ "stations": [{ "_id": "...", "name": "...", "availableSlots": 2 }] }

POST /api/bookings → 201
{ "message": "Charging slot reserved successfully.", "booking": { "status": "confirmed", "price": { "totalAmount": 8.4 } }, "slot": { "durationMinutes": 60 } }</pre>
    <h3>Common errors</h3><p><code>400</code> malformed/invalid input or IDs; <code>401</code> missing, invalid, expired, or no-longer-valid account token; <code>403</code> role/ownership denied; <code>404</code> unknown station, slot, booking, or account; <code>409</code> duplicate/conflicting schedule, reservation conflict, dependent record, or ineligible transition; <code>413</code> JSON body exceeds 100 KB; <code>429</code> login/registration rate limit; <code>500</code> unexpected or configuration error; <code>503</code> health endpoint when database is disconnected.</p>
    <div class="callout warn"><strong>Implementation-specific authorization note:</strong> <code>POST /api/bookings</code> uses <code>authenticateToken</code> but does not call <code>authorizeRoles('customer')</code>. The frontend currently shows reservation controls only to signed-in customer-role accounts, and the booking is associated with the JWT subject; however, the frontend role gate is not a security control. The code does not establish that direct API calls from an authenticated admin are rejected for role alone. This report records that limitation rather than overstating server enforcement.</div>

    <h2 id="implementation">8. Implementation Details</h2>
    <h3>Frontend structure</h3>${table(['Area', 'Source locations / responsibilities'], [
      ['Routing and shells', '<code>frontend/src/App.jsx</code> defines public, admin, customer and authenticated routes; <code>components/*PortalLayout.jsx</code> render role-specific navigation.'],
      ['Pages', '<code>pages/</code> contains dashboards, station directory/details, login/register, booking history, profile, admin station maintenance, and admin booking management.'],
      ['Reusable UI', '<code>components/</code> contains station and booking cards, station form, slot list/editor, loading/error components and layouts.'],
      ['Authentication/API', '<code>auth/AuthContext.jsx</code> manages account state; <code>api/client.js</code> configures Axios, bearer token attachment and 401 session clearing.'],
      ['Styling and tests', '<code>App.css</code>, <code>main.jsx</code>, Vitest/React Testing Library tests in <code>src/App.test.jsx</code>; Playwright specs under <code>frontend/e2e/</code>.'],
    ], [24, 76])}
    <h3>Backend structure</h3>${table(['Area', 'Source locations / responsibilities'], [
      ['Server and app', '<code>backend/server.js</code> loads environment configuration, connects MongoDB, then listens; <code>app.js</code> configures middleware, mounts API routes and handles errors.'],
      ['Routes', '<code>routes/auth.js</code>, <code>user.js</code>, <code>admin.js</code>, <code>stations.js</code>, <code>slots.js</code>, <code>bookings.js</code>.'],
      ['Models', '<code>models/User.js</code>, <code>ChargingStation.js</code>, <code>ChargingSlot.js</code>, <code>Booking.js</code>.'],
      ['Auth/data', '<code>middleware/auth.js</code> verifies JWTs and checks role; <code>config/db.js</code> requires MONGODB_URI; <code>scripts/seedAdmin.js</code> creates an initial admin from configured environment variables.'],
      ['Tests', 'Node test runner, Supertest, and model/route tests under <code>backend/*.test.js</code>.'],
    ], [24, 76])}
    <h3>Authentication flow</h3><ol><li>Registration or login validates credentials and creates a one-hour signed JWT.</li><li>Frontend saves the token in localStorage and stores the returned public user.</li><li>Axios sends the token as a bearer header. On startup, the app requests <code>/auth/me</code> to restore session state.</li><li>Backend middleware verifies signature/expiry and validates subject and role. A 401 response clears client token and dispatches an unauthorized event.</li><li>Protected React routes redirect based on loading state, authentication, and role; API middleware remains authoritative.</li></ol>
    <h3>Booking workflow</h3><ol><li>Customer opens a station and loads the public schedule.</li><li>Only a customer-role session receives the Reserve control in the frontend; energy estimate is collected.</li><li>Backend validates input, atomically claims an available future slot, checks station status, calculates amount, and saves a confirmed booking referencing customer/station/slot.</li><li>Client displays confirmation and refreshes availability. Conflict/validation responses are surfaced to the user.</li><li>Customer can cancel a confirmed booking before its start time; API checks ownership and releases the slot.</li></ol>
    <h3>Admin management workflow</h3><p>An authenticated admin opens the administration portal, creates or edits station information, follows the station's slot-management action, and schedules or activates slots. Admin booking management lists all bookings and exposes eligible cancellation/completion operations. The UI and backend avoid deleting station/slot records that have dependent booking records.</p>
    <h3>MongoDB integration</h3><p>Mongoose connects using <code>MONGODB_URI</code>; the server does not start listening until the connection succeeds. Models define validation, timestamps, references, and indexes. Automated backend tests mock Mongoose methods and avoid modifying live Atlas records.</p>

    <h2 id="manual">9. User Manual</h2>
    <h3>Customer</h3><ol><li>Open the frontend and choose customer registration or sign in. Registration creates a customer account; use the credentials configured for your deployment.</li><li>Browse the public directory or choose <em>Find stations</em> in the User Portal. Search by text/city and optionally filter connector, station status, slot availability, or coordinates when supported.</li><li>Open a station to see details and scheduled slots. Sign in as a customer to reserve an available future slot.</li><li>Select Reserve, enter estimated energy in kWh, then confirm. Review the confirmation and estimated price.</li><li>Open <em>My bookings</em> to review status and schedule. Cancel an eligible confirmed booking before its start; confirm the cancellation prompt.</li><li>Open <em>My profile</em> to update name/email, or use Sign out to clear the browser session.</li></ol>
    <h3>Administrator</h3><ol><li>Sign in through the Admin Portal using an administrator account. Public registration cannot create an administrator account; the repository includes a guarded seed script requiring administrator credentials in local environment configuration.</li><li>Use Dashboard for station/slot/booking counts, booking-status analytics, top booked stations, and recent activity.</li><li>Open Stations &amp; slots. Add a station or edit an existing station's location, connectors, pricing, hours, and operational status.</li><li>Choose Manage slots for a station. Create future slots, edit allowed schedules, activate/deactivate or delete eligible slots. Existing bookings can block certain changes/deletions.</li><li>Open Manage bookings to filter bookings by status, cancel eligible bookings, or mark an ended confirmed booking completed.</li><li>Sign out when finished.</li></ol>
    <p class="muted">The exact visible navigation label on station cards/details is “View details”; admin station rows provide “Manage slots”; the portal provides “Stations &amp; slots” and “Manage bookings”.</p>
    <h3>Screenshot insertion points</h3><p class="muted">Screenshots are intentionally placeholders: no screenshot was taken using synthetic data or by mutating the configured database. Replace these boxes with genuine application captures if an isolated demo environment is available.</p>
    ${placeholder('Landing page and station listing', 'Insert genuine capture of the running public directory / landing page.')}
    ${placeholder('Customer dashboard and slot reservation', 'Insert genuine customer account capture: dashboard, station schedule, and confirmation. Do not show secrets or another customer’s data.')}
    ${placeholder('My Bookings', 'Insert genuine customer booking-history capture from a safe demo account.')}
    ${placeholder('Admin dashboard and management', 'Insert genuine administrator dashboard plus station/slot management captures from a safe demo environment.')}

    <h2 id="testing">10. Testing and Results</h2>
    <p>Results below were executed for this documentation task, in the current local checkout. Browser E2E tests use mocked/stubbed API responses; the backend tests use isolated mocked database methods, as documented in the repository runtime validation report. They do not represent live Atlas mutations or end-to-end persistence.</p>
    ${table(['Verification', 'Command', 'Observed result'], [
      ['Backend automated suite', '<code>cd backend; npm test</code>', '<span class="check">PASS</span> · 71 tests, 18 suites; 71 passed, 0 failed, 0 skipped. Node built-in test runner.'],
      ['Frontend unit/component suite', '<code>cd frontend; npm exec vitest run</code> (part of npm test)', '<span class="check">PASS</span> · 31 tests, 1 test file; all 31 passed.'],
      ['Frontend browser E2E', '<code>cd frontend; npm test</code> (Playwright phase)', '<span class="check">PASS</span> · 8 tests passed; customer registration/roles/login/profile/logout, dashboards, station/slot admin operations, customer booking/reservation, admin booking review/cancellation, and mobile navigation. API requests are stubbed.'],
      ['Frontend production build', '<code>cd frontend; npm run build</code>', '<span class="check">PASS</span> · Vite 8.3.4 production build; 680 modules transformed; build completed successfully.'],
      ['Live database CRUD / browser screenshots', 'Not run', 'Not claimed. No database mutation was performed for this documentation task; screenshot placeholders are provided.'],
    ], [22, 28, 50])}
    <p class="muted">Verification iteration: the first Playwright run had 7 passing tests and 1 failure because an invalid-login response was displayed as an expired-session message. The login page was corrected to show the API's invalid-credentials message; the final full frontend test command then passed all 31 unit tests and all 8 browser tests.</p>
    <h3>Representative verified test cases</h3>${table(['Case', 'Input / setup', 'Expected behavior', 'Observed'], [
      ['Registration', 'Valid customer fields; disallowed admin role test', 'Hash password; return public user/JWT; reject public admin assignment.', 'Pass in backend auth tests.'],
      ['Authorization', 'Missing/expired token; customer to admin endpoint; admin to booking-create endpoint', '401 for invalid session; 403 for forbidden role, without slot/booking mutation.', 'Pass in backend auth/admin/station/slot/booking tests.'],
      ['Slot conflict', 'Attempt competing/repeated reservation of same slot', 'Only one claim succeeds; conflict response protects booked slot.', 'Pass in backend booking tests.'],
      ['Booking ownership', "Customer accesses or cancels own and another customer's booking", 'Own record permitted; another customer’s access denied.', 'Pass in backend booking tests.'],
      ['Cancellation', 'Owner cancels future confirmed booking', 'Booking becomes cancelled; slot is released; started/nonconfirmed cases rejected.', 'Pass in backend booking tests.'],
      ['Customer UI reservation', 'Signed-in customer with future available slot, energy 24 kWh', 'Reserve/confirm posts slot ID + energy and displays confirmation.', 'Pass in frontend unit and stubbed E2E tests.'],
      ['Admin management UI', 'Admin creates/edits/deletes station/slot using stubbed API', 'Admin actions render and update; reserved slots remain protected.', 'Pass in Playwright admin-management tests.'],
    ], [17, 29, 34, 20])}
    <p class="muted">No manual browser tests are claimed. The Playwright E2E suite is automated; its API calls are intercepted by test fixtures, so it verifies frontend behavior rather than live database behavior.</p>

    <h2 id="security">11. Security Considerations</h2><ul>
    <li><strong>Password storage:</strong> bcrypt hashing with work factor 12; the User model excludes password from default queries and removes it from JSON.</li>
    <li><strong>JWT sessions:</strong> JWT secret is required; tokens include subject and role and expire after one hour. Keep JWT_SECRET outside source control.</li>
    <li><strong>Role-based authorization:</strong> middleware rejects missing/invalid bearer tokens and unauthorized roles. Reservation creation requires the customer role; admin-only station/slot operations and analytics are checked server-side.</li>
    <li><strong>Input constraints:</strong> route validators, explicit editable-field allowlists, Mongoose constraints, ObjectId checks, request JSON limit of 100 KB, and CORS allowlist.</li>
    <li><strong>Ownership:</strong> customer booking listing scopes to JWT user ID; detail and cancel actions enforce owner unless the account is admin.</li>
    <li><strong>Reservation conflicts:</strong> atomic slot claim and a partial unique confirmed-booking index prevent competing confirmations. Changes to records with dependent history are restricted.</li>
    <li><strong>Request throttling / headers:</strong> login and registration rate limits; Helmet security headers.</li>
    <li><strong>Secret handling:</strong> report omits .env contents. Configure Mongo URI, JWT secret, and admin seed credentials locally/through a managed secret mechanism. Never commit credentials.</li>
    </ul><div class="callout"><strong>Booking authorization verified:</strong> booking creation requires a customer JWT; administrator tokens receive 403 before a slot is claimed. UI visibility is not relied on as the security boundary.</div>

    <h2 id="limitations">12. Limitations and Future Enhancements</h2><h3>Observed limitations</h3><ul>
    <li>No payment processing, refund, or invoice module appears in the inspected routes/models/UI.</li><li>No push/email/SMS notifications or live station telemetry are implemented in the inspected application sources.</li><li>Station and booking list routes do not expose pagination in the inspected handlers, so large datasets may need future query limits.</li><li>Automated backend route tests use mocked database operations; real deployment-level concurrency and index behavior require a separate isolated MongoDB integration test.</li><li>Browser E2E tests use stubbed API responses and do not prove persistence against a live backend/database.</li><li>The frontend does not include live captured screenshots in this submission; labelled insertion areas are provided.</li><li>The data model uniquely prevents duplicate confirmed bookings for the same slot ID, but it does not reject reservations for distinct slot records whose time intervals overlap. Station-level capacity/charger semantics are not modelled.</li>
    </ul><h3>Potential future work (not implemented)</h3><ul><li>If overlapping intervals should conflict, define station charger/capacity semantics and implement database-safe exclusion for distinct slot records.</li><li>Add isolated MongoDB integration tests and concurrency testing against a disposable test database.</li><li>Add pagination/sorting controls for larger directories and booking histories.</li><li>Add optional payment integration, booking notifications, maps/route planning, and charger status telemetry after separate requirements and security review.</li><li>Introduce deployment automation, observability, and operational backups appropriate to the eventual hosting environment.</li></ul>

    <h2 id="conclusion">13. Conclusion</h2><p>VoltSlot is a MERN application that connects station discovery, scheduled slot administration, customer bookings, and operational oversight. Its implementation demonstrates reusable React pages, Express REST routes, Mongoose document relationships, role-aware UI, API authentication and authorization, input validation, and automated checks for booking conflicts and ownership. The executed test suites and production build provide evidence for local code-level behavior; mocked test boundaries and the lack of station-level exclusion for distinct overlapping slots should remain visible when planning deployment or further security work.</p>

    <h2 id="references">14. References</h2>${referenceList()}
    <p class="muted">Documentation generator source: <code>scripts/generate-documentation.cjs</code>. Report generated ${generatedAt}.</p>
    </body></html>`
}

function apiReport() {
  return `<!doctype html><html><head><meta charset="utf-8">${commonStyles()}<title>VoltSlot API Reference</title></head><body>
    ${cover('API Reference')}${toc([['overview', 'API Overview'], ['auth', 'Authentication and Account'], ['stations', 'Stations and Slots'], ['bookings', 'Bookings'], ['errors', 'Authorization and Errors']])}
    <h1 id="overview">API Overview</h1><p class="lead">Concise reference for the routes mounted by the VoltSlot Express application.</p>
    <p>Base prefix: <code>/api</code>. JSON is used for request/response bodies. JWT-protected requests send <code>Authorization: Bearer &lt;token&gt;</code>. Backend roles are <code>customer</code> and <code>admin</code>.</p>
    <h2 id="auth">Authentication and Account</h2>${table(['Method / path', 'Access', 'Payload / result'], [
      ['GET /health', 'Public', 'Returns <code>{ api: "ok", database: "connected|disconnected" }</code>; status 200 or 503.'],
      ['POST /auth/register', 'Public', '<code>{ name, email, password }</code>; optional role must equal customer. Returns 201 with message, token, public user.'],
      ['POST /auth/login', 'Public', '<code>{ email, password }</code>; returns 200 with token and public user; invalid credentials 401.'],
      ['GET /auth/me', 'JWT', 'Returns current public user; invalid/missing account token 401.'],
      ['PATCH /auth/me', 'JWT', '<code>{ name?, email? }</code>; only these fields; returns updated public user.'],
      ['GET /user/dashboard', 'customer', 'Returns own booking summary, upcoming bookings and recent bookings.'],
      ['GET /admin/dashboard', 'admin', 'Returns station/slot counts, booking statuses, recent bookings and top stations.'],
    ], [30, 18, 52])}
    <h2 id="stations">Stations and Slots</h2>${table(['Method / path', 'Access', 'Payload / query / behavior'], [
      ['GET /stations', 'Public', 'Optional city, connectorType, status, availability, search, longitude, latitude, maxDistance filters; stations include availableSlots count.'],
      ['GET /stations/:id', 'Public', 'Station detail. Invalid ID 400; missing station 404.'],
      ['POST /stations', 'admin', 'Create station using editable fields: name, description, address, city, location, connectorTypes, pricePerKwh, openingHours, status. 201.'],
      ['PUT /stations/:id', 'admin', 'Update at least one station editable field.'],
      ['DELETE /stations/:id', 'admin', 'Delete only with no dependent slots/bookings; conflict 409 otherwise.'],
      ['GET /stations/:stationId/slots', 'Public', 'List slots sorted by startTime.'],
      ['POST /stations/:stationId/slots', 'admin', '<code>{ startTime, endTime }</code> as timestamp strings; status defaults to available.'],
      ['PUT /stations/:stationId/slots/:slotId', 'admin', 'Accept schedule fields and/or status available/unavailable. Booked/dependent records prevent changes.'],
      ['DELETE /stations/:stationId/slots/:slotId', 'admin', 'Delete unreferenced slot only; dependent booking history conflicts.'],
    ], [35, 15, 50])}
    <h3>Station body details</h3><p><code>location: { type: "Point", coordinates: [longitude, latitude] }</code>; coordinate bounds are longitude −180..180 and latitude −90..90. Connectors are CCS, CHAdeMO, Type 1, Type 2, GB/T, Tesla. Opening hours use HH:mm. Operational status is active/inactive/maintenance.</p>
    <h2 id="bookings">Bookings</h2>${table(['Method / path', 'Access', 'Behavior / payload'], [
      ['POST /bookings', 'customer JWT', '<code>{ slotId, energyKwh }</code>; requires valid slot ID and positive finite energy. Claims a future available slot, checks active station, creates confirmed booking with calculated price. Admin is rejected with 403; slot conflict 409.'],
      ['GET /bookings/my', 'JWT', 'List records where customer reference matches token subject.'],
      ['GET /bookings', 'admin', 'List all bookings.'],
      ['GET /bookings/:bookingId', 'Owner or admin', 'Read one booking; other customer receives 403.'],
      ['PATCH /bookings/:bookingId/cancel', 'Owner or admin', 'Confirmed booking before start only; admin can cancel another user. Cancellation releases slot.'],
      ['PATCH /bookings/:bookingId/complete', 'admin', 'Confirmed booking only, after slot end.'],
    ], [38, 22, 40])}
    <div class="callout"><strong>Authorization:</strong> <code>POST /bookings</code> requires a customer JWT. Separately, distinct slot records with overlapping time ranges are not globally excluded by the current data model/indexes.</div>
    <h2 id="errors">Authorization and Errors</h2>${table(['Status', 'Meaning in current API'], [
      ['400', 'Invalid body/query/ID or model validation failure.'],
      ['401', 'Missing/invalid/expired JWT, deleted token account, or authentication configuration error.'],
      ['403', 'Insufficient role or access to a booking owned by another customer.'],
      ['404', 'Requested resource/account not found.'],
      ['409', 'Duplicate schedule, booking race/conflict, dependent record, or invalid state transition.'],
      ['413', 'JSON body exceeds configured 100 KB limit.'],
      ['429', 'Login or registration request limit exceeded.'],
      ['500 / 503', 'Unexpected API failure / health check indicates database disconnected.'],
    ], [15, 85])}
    <p class="muted">Generated from handlers under <code>backend/routes/</code> and app middleware. No API examples expose live records or credentials.</p>
    </body></html>`
}

function manualReport() {
  const manualSections = [['customer', 'Customer Guide'], ['admin', 'Administrator Guide'], ['screens', 'Screenshot Insertion Points'], ['help', 'Account and Safety Notes']]
  return `<!doctype html><html><head><meta charset="utf-8">${commonStyles()}<title>VoltSlot User Manual</title></head><body>
    ${cover('User Manual')}${toc(manualSections)}
    <h1 id="customer">Customer Guide</h1><p class="lead">Follow these steps to find a station, reserve an available slot, and manage your booking.</p>
    <h2>1. Register and sign in</h2><ol><li>Open VoltSlot and choose customer registration, or choose the User Portal sign-in link.</li><li>Enter your name, email, and a password meeting the form rules (8–72 characters/bytes including uppercase, lowercase, and a number).</li><li>After registration, VoltSlot signs in the new customer. On later visits, sign in with your email and password.</li></ol>
    <h2>2. Browse charging stations</h2><ol><li>Use the public landing-page directory or select <em>Find stations</em> in the User Portal.</li><li>Search by name/address/city. Narrow results by city, connector type, slot availability, or station status.</li><li>Open a station card's <em>View details</em> link to review location, price, opening hours, connectors, and the slot schedule.</li></ol>
    <h2>3. Reserve a slot</h2><ol><li>Sign in to a customer account. Guests can browse schedules but must sign in before reserving.</li><li>Select an available future slot and choose <em>Reserve</em>.</li><li>Enter the estimated energy in kWh, then select <em>Confirm reservation</em>.</li><li>Review the confirmation and estimated total. If another user claims the slot first, refresh and select another available time.</li></ol>
    <h2>4. View and cancel bookings</h2><ol><li>Choose <em>My bookings</em> in the User Portal.</li><li>Review the booking's station, schedule, energy/price, and status.</li><li>For an eligible confirmed booking that has not started, choose <em>Cancel booking</em> and confirm. The application refreshes the list; the slot is released when the cancellation succeeds.</li></ol>
    <h2>5. Update profile / sign out</h2><p>Choose <em>My profile</em> to update the account name or email address. Choose <em>Sign out</em> to end the browser session.</p>

    <h1 id="admin" class="section-start">Administrator Guide</h1><p class="lead">The administrator portal provides station, slot, booking, and analytics tools.</p>
    <h2>1. Sign in</h2><p>Use the Admin Portal sign-in entry and an existing admin account. Public account registration is limited to customer accounts. The backend repository has a seed script for the first admin and expects ADMIN_EMAIL and ADMIN_PASSWORD in a local backend environment file; the seed script enforces input checks and refuses an existing account. Do not share the file or its values.</p>
    <h2>2. Review dashboard and analytics</h2><p>The dashboard shows station and slot totals, booking status counts, bookings-by-status chart, most-booked station chart, and recent booking activity. Cards and shortcuts link to station/slot and booking operations.</p>
    <h2>3. Manage stations</h2><ol><li>Choose <em>Stations &amp; slots</em> in the admin navigation.</li><li>Select <em>Add station</em> to enter a name, address/city, longitude/latitude, one or more connectors, price/kWh, operating hours, and operational status.</li><li>Select <em>Edit</em> on an existing row to update its details; save or cancel.</li><li>Choose delete and confirm only when appropriate. A station with dependent slots or bookings cannot be deleted.</li></ol>
    <h2>4. Manage slots</h2><ol><li>Choose <em>Manage slots</em> for a station.</li><li>Choose <em>Add slot</em>; enter the scheduled start and end and create it.</li><li>Use Edit to adjust an eligible slot. Use Activate/Deactivate for availability status or Delete for a slot without booking history.</li><li>Booked slots and slots referenced by booking history are protected from conflicting schedule changes/deletion.</li></ol>
    <h2>5. Manage bookings</h2><ol><li>Choose <em>Manage bookings</em>.</li><li>Filter the list by all, confirmed, cancelled, or completed status.</li><li>Cancel a confirmed eligible booking if needed, or mark a confirmed booking complete after the scheduled slot has ended.</li></ol>
    <h2>6. Sign out</h2><p>Use the Sign out control in the portal navigation when administration work is complete.</p>

    <h1 id="screens" class="section-start">Screenshot Insertion Points</h1><p>Screenshots were not captured for this documentation build because no isolated demo account/database was established for safe browser interaction. These labelled boxes are intentionally not presented as application screenshots.</p>
    ${placeholder('Landing page and station listing', 'Insert a genuine capture from a running VoltSlot build.')}
    ${placeholder('User dashboard', 'Insert a genuine capture using a test customer account.')}
    ${placeholder('Slot reservation and confirmation', 'Insert a genuine capture using a disposable test slot/account.')}
    ${placeholder('My Bookings', 'Insert a genuine capture with private details redacted.')}
    ${placeholder('Admin dashboard', 'Insert a genuine capture using a test administrator account.')}
    ${placeholder('Station and slot management', 'Insert a genuine capture using a safe test environment.')}

    <h1 id="help" class="section-start">Account and Safety Notes</h1><ul><li>Only register ordinary customer accounts through the public registration form. Administrator provisioning is handled separately.</li><li>Do not share account passwords, JWTs, MongoDB connection strings, environment files, or customer records in screenshots.</li><li>Booking creation is restricted to customer-role tokens by the API; admin UI hiding is supplementary and not the authorization boundary.</li><li>Errors can mean the slot was reserved by someone else, is no longer eligible, or is blocked by existing booking history. Review the message and refresh before retrying.</li><li>The current model protects a slot ID from a second confirmed booking, but does not define station-level capacity for distinct overlapping slot records.</li><li>For deployment/configuration trouble, contact the system administrator; this guide does not describe production deployment.</li></ul>
    </body></html>`
}

function testReport() {
  const testSections = [['summary', 'Execution Summary'], ['cases', 'Verified Test Cases'], ['scope', 'Test Boundaries'], ['reproduce', 'Reproduction Commands']]
  return `<!doctype html><html><head><meta charset="utf-8">${commonStyles()}<title>VoltSlot Test Report</title></head><body>
    ${cover('Automated Test Report')}${toc(testSections)}
    <h1 id="summary">Execution Summary</h1><p class="lead">Results from commands executed for this documentation task; these are not copied from an earlier report.</p>
    <p>Execution date: ${generatedAt}. Backend test suite completed before frontend tests. Frontend test command ran Vitest and Playwright.</p>
    ${table(['Suite / check', 'Command', 'Observed result'], [
      ['Backend Node test suite', '<code>cd backend; npm test</code>', '<span class="check">PASS</span><br>71 tests; 18 suites; 71 passed, 0 failed, 0 skipped; exit code 0.'],
      ['Frontend unit/component suite', '<code>cd frontend; npm test</code> (Vitest phase)', '<span class="check">PASS</span><br>31 tests in one file; 31 passed; exit code 0.'],
      ['Frontend browser E2E suite', '<code>cd frontend; npm test</code> (Playwright phase)', '<span class="check">PASS</span><br>8 tests passed, 0 failed; exit code 0.'],
      ['Production build', '<code>cd frontend; npm run build</code>', '<span class="check">PASS</span><br>Vite production build was executed for report verification.'],
      ['Manual UI test / real database test', 'Not run', 'Not claimed. No live MongoDB data was changed.'],
    ], [25, 30, 45])}
    <p class="muted">The first Playwright attempt had 7 passes and 1 failure: a wrong-password response appeared as an expired-session message. The login page was corrected to display the invalid-credentials response, and the full frontend command was rerun successfully (31 unit tests and 8 browser tests passed).</p>
    <h2 id="cases">Verified Test Cases</h2>${table(['Area', 'Coverage represented in source tests', 'Observed result'], [
      ['Authentication', 'Valid/invalid login, customer registration, role assignment rejection, JWT errors, protected routes, profile updates, rate limits.', 'Backend tests passed; frontend registration/login and role flows passed in Vitest/E2E.'],
      ['Stations', 'Public listing filters and availability, validation, admin create/update/delete, dependent-record deletion protection.', 'Backend tests passed; admin browser flow passed with API stubs.'],
      ['Slots', 'Public ordered slot listing, admin authorization, create/update/status changes, duplicate schedule, invalid IDs, dependency protection.', 'Backend tests passed; admin Playwright management flow passed with API stubs.'],
      ['Bookings', 'Customer-only reservation, unavailable/invalid inputs, future/active station checks, repeated/concurrent same-slot conflict, list scope, ownership, cancellation, completion.', 'Backend tests passed using isolated mocked Mongoose operations. Distinct overlapping slot records are not covered.'],
      ['Analytics', 'Admin dashboard aggregate data and authorization; customer dashboard own-data scope and authorization.', 'Backend tests passed; frontend dashboards passed with stubbed responses.'],
      ['Security middleware', 'CORS policy, security headers, oversized request body behavior.', 'Backend tests passed.'],
      ['User reservation experience', 'Customer session selects available future slot, submits energy amount, sees confirmation; customer browsing and booking history flow.', 'Frontend Vitest and customer Playwright flow passed with API stubs.'],
    ], [18, 54, 28])}
    <h2 id="scope">Test Boundaries and Unresolved Failures</h2><ul><li>Backend route/model tests are automated but use mocked Mongoose/database methods. They do not demonstrate behavior against a real Atlas instance, transaction isolation, or a deployed MongoDB configuration.</li><li>Playwright E2E tests start the Vite frontend and intercept API calls with fixtures. They demonstrate rendered browser flows and client behavior but do not verify persistence or actual API network integration.</li><li>Vitest uses mocked client modules where appropriate; these are component/frontend tests.</li><li>No manual browser test or live database CRUD test was run for this report. No screenshots are claimed.</li><li>All test commands listed above completed successfully in this run; there are no unresolved failures from that run.</li><li>The tests cover concurrent attempts for the same slot ID; they do not cover distinct slot records with partially overlapping time ranges. The implementation has no station-level overlap exclusion.</li><li>No real MongoDB records were read or modified during documentation generation.</li></ul>
    <h2 id="reproduce">Reproduction Commands</h2><pre>cd backend
npm test

cd ../frontend
npm test
npm run build</pre>
    <p class="muted">Evidence: terminal results from this documentation task. The generated report distinguishes automated tests from unrun manual/live-data validation.</p>
    </body></html>`
}

async function writePdf(browser, filename, html) {
  const page = await browser.newPage({ viewport: { width: 1123, height: 794 } })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.pdf({
    path: path.join(docs, filename),
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="width:100%;margin:0 17mm;color:#718077;font:8px Arial;">VoltSlot · Project documentation</div>',
    footerTemplate: '<div style="width:100%;margin:0 17mm;color:#718077;font:8px Arial;display:flex;justify-content:space-between;"><span>Source-based report · ' + generatedAt + '</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '21mm', right: '17mm', bottom: '21mm', left: '17mm' },
    preferCSSPageSize: true,
  })
  await page.close()
}

async function main() {
  await fs.mkdir(docs, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    await writePdf(browser, 'VoltSlot_Project_Documentation.pdf', mainReport())
    await writePdf(browser, 'VoltSlot_API_Reference.pdf', apiReport())
    await writePdf(browser, 'VoltSlot_User_Manual.pdf', manualReport())
    await writePdf(browser, 'VoltSlot_Test_Report.pdf', testReport())
  } finally {
    await browser.close()
  }
  for (const filename of [
    'VoltSlot_Project_Documentation.pdf',
    'VoltSlot_API_Reference.pdf',
    'VoltSlot_User_Manual.pdf',
    'VoltSlot_Test_Report.pdf',
  ]) {
    const stat = await fs.stat(path.join(docs, filename))
    console.log(`${filename}: ${stat.size} bytes`)
  }
}

main().catch((error) => {
  console.error('PDF generation failed:', error.message)
  process.exitCode = 1
})
