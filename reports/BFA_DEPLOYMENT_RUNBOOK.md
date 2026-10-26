# BFA Apartments Management System — Production Deployment Runbook

> **Target Version**: BFA v1.0.0 Production Release Candidate  
> **Architecture**: Three-tier containerized stack (Nginx 1.27 + Node.js 20 REST API + MariaDB 10.11 LTS)  
> **Audience**: Systems Engineers, DevOps Engineers, and System Administrators  

---

## 1. TARGET HOST PREREQUISITES

Before commencing deployment on the production host, ensure the target server satisfies the following requirements:

- **Operating System**: Ubuntu 22.04 LTS / Debian 12 / RHEL 9 (or any modern Linux distribution with systemd).
- **Container Runtime**:
  - Docker Engine >= 24.0
  - Docker Compose >= v2.20
  - Verify with: `docker --version` and `docker compose version`
- **Hardware Sizing**:
  - Minimum: 2 vCPU, 4 GB RAM, 20 GB SSD
  - Recommended: 4 vCPU, 8 GB RAM, 50 GB NVMe SSD
- **Network Ingress & Firewall**:
  - Inbound ports `80` (HTTP) and `443` (HTTPS) open to public traffic.
  - Inbound port `22` (SSH) restricted to management bastion/VPN.
  - Ports `3306` (MariaDB) and `5000` (Backend API) must **never** be exposed publicly; they communicate exclusively across the internal Docker bridge network (`bfa_network`).

---

## 2. REQUIRED PRODUCTION ENVIRONMENT VARIABLES

Create a production `.env` file in the project root on the target server. 

> [!CAUTION]
> Never commit the production `.env` file to Git or include it in repository archives.

| Variable Name | Description | Mandatory | Validation Rules |
|:---|:---|:---:|:---|
| `NODE_ENV` | Runtime environment mode | Yes | Must be `production` |
| `PORT` | Backend HTTP listen port inside container | Yes | Set to `5000` |
| `APP_NAME` | Display name of the ERP system | Yes | `"BFA Apartments Management System"` |
| `APP_URL` | Public backend URL | Yes | e.g., `https://api.bfa-apartments.com` |
| `FRONTEND_URL` | Public frontend URL | Yes | e.g., `https://bfa-apartments.com` |
| `DB_HOST` | Database host name in Docker network | Yes | Set to `mariadb` |
| `DB_PORT` | Database listen port | Yes | Set to `3306` |
| `DB_NAME` | Production database schema name | Yes | `bfa_apartments_db` |
| `DB_USER` | Application database user | Yes | `bfa_prod_user` |
| `DB_PASSWORD` | Application database password | Yes | High-entropy password |
| `DB_ROOT_PASSWORD` | MariaDB root administrative password | Yes | High-entropy password |
| `DB_CONNECTION_LIMIT` | MySQL connection pool size | No | Default: `25` |
| `JWT_SECRET` | Secret key for signing and verifying JWTs | Yes | **Minimum 32 characters**; random entropy |
| `JWT_EXPIRES_IN` | JWT token lifespan | Yes | e.g., `7d` |
| `CORS_ORIGIN` | Allowed web origins | Yes | Comma-separated trusted domains. **No wildcards allowed.** |
| `SUPER_ADMIN_EMAIL` | Initial Super Admin login email | Optional | Used only if running `seedAdmin.js` |
| `SUPER_ADMIN_PASSWORD` | Initial Super Admin password | Optional | Min 12 characters; used only by `seedAdmin.js` |

---

## 3. SECURE SECRET GENERATION PROCEDURE

Generate cryptographically secure random values on the host using OpenSSL before starting the deployment:

```bash
# 1. Generate JWT Secret (64 hex characters = 256 bits of entropy)
openssl rand -hex 32

# 2. Generate MariaDB Application Password (32 alphanumeric characters)
openssl rand -base64 24

# 3. Generate MariaDB Root Password (32 alphanumeric characters)
openssl rand -base64 24
```

Copy these generated values into the production `.env` file on the deployment host. Set permissions:
```bash
chmod 600 .env
```

---

## 4. STEP-BY-STEP DEPLOYMENT WORKFLOW

### Step 4.1: Clone Repository on Production Host
```bash
git clone <repository_url> /opt/bfa-apartments
cd /opt/bfa-apartments
```

### Step 4.2: Verify Build Context & Exclusions
Ensure the root `.dockerignore` is present to protect secrets:
```bash
ls -la .dockerignore
```

### Step 4.3: Configure Production Environment
```bash
cp .env.production.example .env
nano .env  # Insert generated high-entropy secrets and verified domains
```

### Step 4.4: Build Container Images
Build the production multi-stage backend and frontend images:
```bash
docker compose build --no-cache
```

### Step 4.5: Launch the Application Stack
Start all services in detached mode:
```bash
docker compose up -d
```

### Step 4.6: Verify Container Health Status
Inspect service initialization and container healthchecks:
```bash
docker compose ps
```
All three services (`bfa_mariadb`, `bfa_backend`, `bfa_frontend`) should display `healthy`.

---

## 5. POST-DEPLOYMENT VERIFICATION & HEALTH CHECKS

Execute the following automated probes against the running deployment:

### 5.1 Backend Process Health Check
```bash
curl -i http://localhost/api/v1/health/live
```
- **Expected Status**: `HTTP/1.1 200 OK`
- **Expected Response**: `{"status":"live", ...}`

### 5.2 System & Database Readiness Check
```bash
curl -i http://localhost/api/v1/health/ready
```
- **Expected Status**: `HTTP/1.1 200 OK`
- **Expected Response**: `{"status":"ready", "checks":{"database":"ok", "pdfStorage":"ok"}}`

### 5.3 Nginx Static Asset & Security Header Check
```bash
curl -I http://localhost/
```
- **Expected Headers**:
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`

---

## 6. POST-DEPLOYMENT SMOKE TESTS

Perform the following smoke tests to confirm operational readiness:

1. **Authentication Smoke Test**:
   - Send `POST /api/v1/auth/login` with configured administrator credentials.
   - Verify signed JWT token is issued with proper role assignment.
2. **Access Control & Property Isolation Smoke Test**:
   - Query `GET /api/v1/reservations` without token; verify `HTTP 401 Unauthorized`.
   - Query as Property Manager; verify data returned is strictly isolated to the manager's assigned property.
3. **Public Booking Smoke Test**:
   - Send `POST /api/v1/public/booking` with a 1-night stay on an available apartment.
   - Verify `HTTP 201 Created` with valid `reservationCode` and `authCode`.
   - Send a 2-night stay payload; verify rejection with `HTTP 422 Unprocessable Entity`.
4. **Booking Authentication Code Lookup**:
   - Send `POST /api/v1/public/booking-lookup` with the issued `authCode` and guest email.
   - Verify reservation details are displayed accurately.

---

## 7. BACKUP & DISASTER RECOVERY PROCEDURES

### 7.1 Automated Daily Database Backup
Add a cron job to `/etc/cron.d/bfa-backup`:
```bash
0 2 * * * root docker exec bfa_mariadb mysqldump -u root -p"$DB_ROOT_PASSWORD" bfa_apartments_db | gzip > /var/backups/bfa/bfa_backup_$(date +\%F_\%H\%M\%S).sql.gz
```

### 7.2 Manual Backup Command
```bash
docker exec bfa_mariadb mysqldump -u root -p"$DB_ROOT_PASSWORD" --single-transaction --quick bfa_apartments_db > backup_manual_$(date +%Y%m%d_%H%M%S).sql
```

### 7.3 Database Restoration Procedure
In the event of database recovery:
```bash
# 1. Stop backend service to prevent write operations during restore
docker compose stop backend

# 2. Restore database from backup file
docker exec -i bfa_mariadb mysql -u root -p"$DB_ROOT_PASSWORD" bfa_apartments_db < backup_manual_YYYYMMDD_HHMMSS.sql

# 3. Restart backend service
docker compose start backend

# 4. Verify readiness probe
curl http://localhost/api/v1/health/ready
```

---

## 8. ROLLBACK PROCEDURES

If an anomaly or regression is detected following a deployment:

### 8.1 Rollback Application Code & Containers
```bash
# 1. Checkout previous stable release tag
git checkout <previous_stable_tag_or_commit>

# 2. Rebuild images with previous code
docker compose build

# 3. Restart services
docker compose up -d

# 4. Confirm health
docker compose ps
curl http://localhost/api/v1/health/ready
```

### 8.2 Database Schema Rollback
If a failed deployment included breaking schema changes:
1. Stop the backend container: `docker compose stop backend`.
2. Restore the pre-deployment database backup using the restoration procedure in Section 7.3.
3. Restart the backend container on the previous release version.

---

## 9. INCIDENT RESPONSE & TROUBLESHOOTING

| Symptom | Probable Cause | Corrective Action |
|:---|:---|:---|
| Backend fails startup with `CRITICAL: Startup Environment Validation Failed` | Missing `JWT_SECRET`, insecure default secret, or wildcard in `CORS_ORIGIN`. | Inspect logs: `docker compose logs backend`. Provide valid production secrets in `.env`. |
| Database connection refused | MariaDB container still initializing or incorrect `DB_PASSWORD`. | Check database logs: `docker compose logs mariadb`. Confirm passwords in `.env` match for both services. |
| 502 Bad Gateway on `/api/v1/` | Backend container is crashing or not healthy. | Inspect health probes: `docker inspect --format='{{json .State.Health}}' bfa_backend`. Inspect logs: `docker compose logs --tail=100 backend`. |
| Single Page App (SPA) routes return 404 | Nginx missing `try_files` fallback. | Verify `nginx/nginx.conf` contains `try_files $uri $uri/ /index.html;`. |

---

## 10. SUMMARY & CONTACTS

- **Application Name**: BFA Apartments Management System
- **Engineering Team**: BFA Core Engineering
- **Production Gate Verdict**: **CONDITIONAL PASS** (Awaiting execution of Step 4 on production host with Docker Engine)
