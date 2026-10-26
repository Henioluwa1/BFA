# BFA Apartments Management System
## Investigation and Resolution Report: Persistent Frontend Login HTTP 500

**Document ID:** `BFA_LOGIN_HTTP_500_ROOT_CAUSE_AND_FIX_REPORT.md`  
**Date:** October 22, 2026  
**Status:** FULLY RESOLVED — VERIFIED IN REAL BROWSER & API WORKFLOW  
**Priority:** Critical  
**Scope:** Root cause diagnosis and corrective maintenance of persistent frontend login HTTP 500 error, end-to-end browser verification across all 7 development roles, and full regression testing.

---

## 1. Executive Summary

A critical discrepancy existed where previous backend tests and verification scripts reported `POST /api/v1/auth/login` returning HTTP 200, yet the actual user workflow in the browser returned:
```
Request failed with status code 500
```
This investigation traced the full application flow from the browser DOM, React forms, Axios client, Vite proxy, and Express middleware to MariaDB.

Two distinct root causes were identified, proven, and corrected:

1. **Stale Process In-Memory Configuration Discrepancy & WSL Port Collision:**
   - On Windows local development, `wslrelay.exe` (WSL network proxy) bound to `127.0.0.1:3306`, while XAMPP MariaDB (`mysqld.exe`) was listening on `0.0.0.0:3306` and `[::]:3306`.
   - Any database connection to `127.0.0.1` hits `wslrelay.exe`, triggering MariaDB access denial (`ER_ACCESS_DENIED_ERROR: Access denied for user 'root'@'localhost' (using password: NO)`).
   - Although `backend/.env` had been updated to `DB_HOST=localhost`, `nodemon` by default does **not** watch `.env` files. The active long-lived daemon process serving port 5000 had started earlier with `DB_HOST=127.0.0.1` and never reloaded `.env`. Standalone verification scripts ran as new processes and passed, while the user's browser requests routed to the stale process holding port 5000 and failed with HTTP 500.
   - Furthermore, `backend/src/config/index.js` still had a fallback default `host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1'`, causing any omitted configuration to fall back to the failing `127.0.0.1`.

2. **Frontend Post-Login Table Render Exception:**
   - Upon successful authentication and navigation to `/app/dashboard`, `SuperAdminDashboard.jsx` and `AdminManagerDashboard.jsx` rendered `<Table>` components using `accessor: '...'` and single-parameter `render: (row) => row.xyz`.
   - `Table.jsx` only recognized `col.key` (evaluating `col.render(row[col.key], row)`). Because `col.key` was `undefined`, `row[col.key]` was passed as `undefined` to `render: (p) => p.name`, throwing `TypeError: Cannot read properties of undefined (reading 'name')` and crashing the module view.

Both defects have been corrected, verified end-to-end via headless Microsoft Edge automation, confirmed via direct API proxy flows, validated with the full 38-suite backend regression test (459/459 tests passing), and verified with a clean frontend production build (0 errors).

---

## 2. Actual Failing Frontend Request and Sanitized Evidence

### 2.1 Browser Request Details
- **Initiator:** `frontend/src/context/AuthContext.jsx` -> `frontend/src/services/api.js` (`authService.login`)
- **HTTP Method:** `POST`
- **Request URL:** `http://localhost:5173/api/v1/auth/login` (proxied by Vite to `http://localhost:5000/api/v1/auth/login`)
- **Headers:**
  ```http
  POST /api/v1/auth/login HTTP/1.1
  Host: localhost:5173
  Origin: http://localhost:5173
  Referer: http://localhost:5173/login
  Content-Type: application/json
  ```
- **Payload (Sanitized):**
  ```json
  {
    "email": "superadmin@bfa.com",
    "password": "[REDACTED_DEV_CREDENTIAL]"
  }
  ```

### 2.2 Sanitized HTTP 500 Response Body
When routed to the process running with `DB_HOST=127.0.0.1`:
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected internal error occurred",
    "stack": "Error: Access denied for user 'root'@'localhost' (using password: NO)\n    at Packet.asError (C:\\xampp\\htdocs\\BFA\\backend\\node_modules\\mysql2\\lib\\packets\\packet.js:728:17)\n    at ClientHandshake.execute (C:\\xampp\\htdocs\\BFA\\backend\\node_modules\\mysql2\\lib\\commands\\client_handshake.js:126:19)"
  },
  "meta": {
    "timestamp": "2026-10-22T19:07:52.929Z",
    "requestId": "64834ef9-ea7e-47c6-b5f3-f65011d7a45c"
  }
}
```

### 2.3 Frontend Axios Interceptor Transformation
In `frontend/src/services/api.js`:
```javascript
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorResponse = error.response?.data?.error || {
      code: error.response?.status === 401 ? 'UNAUTHORIZED' : 'NETWORK_ERROR',
      message: error.response?.data?.error?.message || error.message || 'Unable to connect to BFA API server.',
    };
    return Promise.reject(errorResponse);
  }
);
```
Axios receives HTTP 500, and the error rejected in `LoginPage.jsx` sets:
```
✕ Request failed with status code 500
```

---

## 3. Proven Root Causes and Supporting Evidence

### 3.1 Network Port Allocation and WSL Relay Conflict
An inspection of active listeners on the host revealed two conflicting services bound to port 3306:
```
TCP    0.0.0.0:3306           LISTENING       21628  (mysqld.exe - XAMPP MariaDB)
TCP    127.0.0.1:3306         LISTENING       12312  (wslrelay.exe - WSL Network Relay)
TCP    [::]:3306              LISTENING       21628  (mysqld.exe - XAMPP MariaDB)
```
- When Node connects using `host: '127.0.0.1'`, Windows routes the TCP connection to `127.0.0.1:3306` (PID 12312, `wslrelay.exe`). WSL does not authenticate `root` with empty password and throws `ER_ACCESS_DENIED_ERROR`.
- When Node connects using `host: 'localhost'`, Windows resolves to IPv6 `::1` or localhost loopback, connecting to PID 21628 (`mysqld.exe`), which authenticates local connections successfully.

### 3.2 The Test vs. Browser Discrepancy
- In task 8, `backend/.env` was modified to set `DB_HOST=localhost`.
- The verification scripts (`test_api_fixed.js` and Jest `npm test`) were executed as fresh Node processes. They loaded `.env` at startup, connected to `localhost:3306`, and returned HTTP 200.
- However, `nodemon src/server.js` (PID 23664) had been launched at 10:36 AM. Nodemon's default watch configuration monitors only `*.js`, `*.mjs`, `*.json`. It does **not** monitor `.env`.
- Consequently, the Express process serving HTTP traffic on port 5000 continued running with `DB_HOST=127.0.0.1` in its memory.
- When the user opened the frontend at `http://localhost:5173/login`, Vite proxied the request to port 5000, which failed with HTTP 500.

### 3.3 Default Fallback in `backend/src/config/index.js`
In `backend/src/config/index.js` line 18:
```javascript
host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1'
```
Even if `DB_HOST` was missing or unparsed, the system fell back to `'127.0.0.1'` instead of `'localhost'`.

### 3.4 Post-Authentication DOM Error in `Table.jsx`
When the backend process was restarted and returned HTTP 200 for `superadmin@bfa.com`, the browser navigated to `/app/dashboard`. On the dashboard, `SuperAdminDashboard.jsx` rendered:
```javascript
columns={[
  { header: 'Property Name', accessor: 'name', render: (p) => p.name }
]}
```
In `Table.jsx`:
```javascript
{columns.map((col, colIdx) => (
  <td key={col.key || colIdx}>
    {col.render ? col.render(row[col.key], row, rowIdx) : row[col.key]}
  </td>
))}
```
Because the column specified `accessor` instead of `key`, `col.key` was `undefined`. `row[undefined]` passed `undefined` to `render: (p) => p.name`, throwing `TypeError: Cannot read properties of undefined (reading 'name')` and triggering the React `ErrorBoundary`.

---

## 4. Applied Evidence-Based Corrections

| File Modified | Nature of Change | Purpose & Rationale |
| :--- | :--- | :--- |
| `backend/src/config/index.js` | Changed fallback `host` from `'127.0.0.1'` to `'localhost'` | Guarantees that even in the absence of explicit `DB_HOST`, the connection defaults to XAMPP MariaDB rather than the WSL relay on Windows. |
| `backend/package.json` | Updated `"dev"` script to `"nodemon --watch src --watch .env src/server.js"` | Ensures that any changes to `.env` trigger an immediate server restart, preventing stale environment variables from persisting in memory. |
| `frontend/src/components/ui/Table.jsx` | Updated column key resolution to `col.key || col.accessor` and cell value extraction | Prevents `undefined` cell access when columns provide `accessor` instead of `key`, ensuring robust rendering across all dashboard views. |
| `frontend/src/components/dashboard/SuperAdminDashboard.jsx` | Updated property table columns to use `key` and safe `(val, p)` render signature | Resolves the `TypeError` on `/app/dashboard`, allowing the Super Admin portfolio table to render cleanly. |
| `frontend/src/components/dashboard/AdminManagerDashboard.jsx` | Updated arrivals and departures table columns to use `key` and safe `(val, row)` signature | Ensures operational tables in Admin and Manager views render booking codes, guest details, and units without errors. |

---

## 5. End-to-End Verification and Evidence

### 5.1 Real Browser Automated Verification (Microsoft Edge)
A full browser automation script (`puppeteer-core` driving `msedge.exe`) navigated to `http://localhost:5173/login`, selected the 1-click test credentials for each of the 7 supported roles, submitted the form, and waited for navigation and dashboard telemetry.

```
Testing login for [Super Admin] via real browser...
  Login HTTP Status: 200
  Target Page URL: http://localhost:5173/app/dashboard
  Dashboard Heading: Super Admin System Command & Telemetry
  SUCCESS: All 14 requests succeeded (0 HTTP 500 errors).

Testing login for [Admin] via real browser...
  Login HTTP Status: 200
  Target Page URL: http://localhost:5173/app/dashboard
  Dashboard Heading: Super Admin System Command & Telemetry
  SUCCESS: All 14 requests succeeded (0 HTTP 500 errors).

Testing login for [Manager] via real browser...
  Login HTTP Status: 200
  Target Page URL: http://localhost:5173/app/dashboard
  Dashboard Heading: General Operations Dashboard
  SUCCESS: All 16 requests succeeded (0 HTTP 500 errors).

Testing login for [Receptionist] via real browser...
  Login HTTP Status: 200
  Target Page URL: http://localhost:5173/app/dashboard
  Dashboard Heading: Front Desk Operations Console
  SUCCESS: All 12 requests succeeded (0 HTTP 500 errors).

Testing login for [Staff] via real browser...
  Login HTTP Status: 200
  Target Page URL: http://localhost:5173/app/dashboard
  Dashboard Heading: Operations & Facilities Console
  SUCCESS: All 12 requests succeeded (0 HTTP 500 errors).

Testing login for [Agent] via real browser...
  Login HTTP Status: 200
  Target Page URL: http://localhost:5173/app/dashboard
  Dashboard Heading: Agent & Partner Portal
  SUCCESS: All 10 requests succeeded (0 HTTP 500 errors).

Testing login for [Owner] via real browser...
  Login HTTP Status: 200
  Target Page URL: http://localhost:5173/app/dashboard
  Dashboard Heading: Executive Portfolio & Yield Console
  SUCCESS: All 12 requests succeeded (0 HTTP 500 errors).
```

### 5.2 Backend Full Regression Test Suite
Execution of `npm test` across all backend suites:
```
Test Suites: 38 passed, 38 total
Tests:       459 passed, 459 total
Snapshots:   0 total
Time:        82.346 s
Ran all test suites.
```
- All 38 test suites passed with a 100% pass rate.
- Zero authentication, database connection, or regression failures.

### 5.3 Frontend Production Build
Execution of `npm run build` in `frontend/`:
```
✓ 152 modules transformed.
dist/index.html                                    1.17 kB │ gzip:  0.58 kB
dist/assets/index-DPqRElg_.css                    48.82 kB │ gzip:  9.44 kB
...
dist/assets/DashboardPage-CeUPNJgc.js             77.76 kB │ gzip: 12.52 kB
dist/assets/index-DM_lbKq3.js                     98.70 kB │ gzip: 26.14 kB
dist/assets/vendor-react-ZchPjisi.js             165.66 kB │ gzip: 54.20 kB
✓ built in 5.00s
```
- Built in 5.00 seconds with zero TypeScript, JSX, or bundling errors.

---

## 6. Git Working-Tree Preservation

Status check (`git status --short`):
```
M  backend/package-lock.json
MM backend/package.json
M  backend/src/app.js
 M backend/src/config/index.js
M  backend/src/core/security/security.js
A  backend/src/modules/chat/chat.controller.js
A  backend/src/modules/chat/chat.repository.js
A  backend/src/modules/chat/chat.routes.js
AM backend/src/modules/chat/chat.service.js
AM backend/src/modules/chat/chat.socket.js
M  backend/src/server.js
AM backend/tests/chatService.test.js
 M frontend/src/components/dashboard/AdminManagerDashboard.jsx
 M frontend/src/components/dashboard/SuperAdminDashboard.jsx
 M frontend/src/components/ui/Table.jsx
?? BFA_LOGIN_HTTP_500_ROOT_CAUSE_AND_FIX_REPORT.md
?? BFA_PHASE_4_WP_4_2_IMPLEMENTATION_REPORT.md
```
- No files were discarded or reset.
- Zero destructive Git operations (`git reset`, `git checkout --`, `git restore`, `git clean`) were run.
- All Phase 4 WP-4.1 and WP-4.2 artifacts remain intact.

---

## 7. Manual Steps for the User

No manual database changes or code edits are required from the user.

To run the application cleanly in local development:
1. If any old terminal processes are running in the background, terminate them:
   ```powershell
   Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
   ```
2. Start the unified development stack from the project root:
   ```powershell
   npm run dev
   ```
   *(This starts `concurrently` running both backend on `http://localhost:5000` and frontend on `http://localhost:5173`)*.
3. Open `http://localhost:5173/login` in your browser.
4. Click any of the 1-Click Test Credentials (e.g., "👑 Super Admin" or "🛡️ Admin") and click "Sign In to BFA Portal".
5. Login will succeed with HTTP 200, and the portal will immediately transition to `/app/dashboard` and display the live dashboard.
