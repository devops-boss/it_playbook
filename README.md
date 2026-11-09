# IT Operations Playbook — Big Outsource

A standalone, searchable internal web knowledge base and incident playbook system for the IT personnel of **Big Outsource** (supporting 26 real client accounts). It runs entirely on-premise on your own network: no external SaaS, no cloud CDNs, and no network traffic leaving the building at runtime.

An IT agent who has never seen an issue before can locate the validated fix and start troubleshooting **within thirty seconds** of looking.

---

## 1. What is in the Box

| Feature | Details |
|---|---|
| **Search First** | Postgres full-text search with typo tolerance (`pg_trgm`), admin-managed synonyms, weighted relevance (title, Quick Fix, steps, symptoms), and a command palette on `Ctrl+K`. |
| **26 Real Client Accounts** | Health Carousel, MyVRhost, Imagine Learning, Harper Group, Clearabee, DoNotPay, Feed, CelebVM, Priceline RevOps, Miratech, US Legal Support, Driveline Baseball, Cohley, Fat Pizza, Under the Doormat, Medex, Lem Garcia Law, Freedom and Glory, InMotion, Travers, Essentials in Writing, Cipher Billing, IFA, Skanwear, MyCali PT, Kiddom. |
| **Strict 2-Role Security** | Exactly two roles: **IT Support** and **Admin**. Row Level Security (RLS) on all tables. Authenticator-app MFA (TOTP) enforced on every sign-in. |
| **HESK Ticketing Integration** | Tickets store only the **Tracking ID** (e.g., `BOS-49281`), auto-linked to Big Outsource's HESK helpdesk (`https://helpdesk.bigoutsource.com/ticket.php?track={ID}`). |
| **The Whole Problem on One Page** | Quick Fix highlight box (`#E07E3C`), interactive step-by-step React Flow troubleshooting flowchart, numbered checklist resolution steps, copy-for-ticket text, and attachments. |
| **Coverage Heat Map & Matrix** | Multi-dimensional matrix mapping accounts to categories/issue types, highlighting documentation gaps (`+ 0` links directly to create playbook), with CSV export. |
| **Automated Backups & DR** | Automated backups combining database dump, Storage files, and configuration export, 7 daily + 4 weekly retention, safety pre-restore snapshots, and recovery runbooks. |

---

## 2. Quick Start

You need **Docker Engine** (v26+) and **Docker Compose** (v2+).

```bash
git clone <repository-url> bos-playbook
cd bos-playbook

# 1. Generate secure credentials and .env
make secrets

# 2. Issue TLS certificates (using internal CA or self-signed)
make certificates

# 3. Build and launch the stack
make up

# 4. Apply versioned database migrations
make migrate

# 5. Load the 26 real accounts and 8 real users (Reinier Vista & Ronald Balza as Admins)
make seed-real
```

Open `https://playbook.test.local` (or your configured `DOMAIN`).

---

## 3. Users and Roles

The system strictly enforces **two roles**:

1. **IT Support**
   - Has full operational permissions: search, read, author, and edit scenarios and playbooks.
   - Can manage client accounts, categories, and classification options (issue types, severities, impact scopes).
   - Can pin frequent playbooks and view coverage matrices.
   - **Cannot** manage users, deactivate users, or reset MFA.
2. **Admin**
   - Has all IT Support permissions plus user administration.
   - Only Admins can access the **Admin → Users** screen to invite users, edit names/emails, deactivate accounts, and trigger MFA resets.
   - Big Outsource Admins: **Reinier Vista** (`paulreinier.vista@bigoutsource.com`) and **Ronald Balza** (`ronald.balza@bigoutsource.com`).

### Initial Real Users (8 Personnel)
- **Reinier Vista** — `paulreinier.vista@bigoutsource.com` (**Admin**)
- **Ronald Balza** — `ronald.balza@bigoutsource.com` (**Admin**)
- **Aldrin Brucal** — `aldrin.brucal@bigoutsource.com` (IT Support)
- **Karla Espiritu** — `karla.espiritu@bigoutsource.com` (IT Support)
- **Paolo Pizana** — `paolo.pizana@bigoutsource.com` (IT Support)
- **Francis Katigbak** — `frkatigbak@bigoutsource.ph` (IT Support)
- **Lee An Aragoza** — `lyaragoza@bigoutsource.ph` (IT Support)
- **Wesley Bibon** — `wfbibon@bigoutsource.ph` (IT Support)

---

## 4. Multi-Factor Authentication (MFA) & User Management

### 4.1 Authenticator-App MFA (TOTP)
- **Mandatory on every sign-in**: Password authentication is insufficient; sessions remain unverified until the 6-digit TOTP code is supplied.
- **Initial Enrollment**: On first login, users scan a TOTP QR code using Google Authenticator, Microsoft Authenticator, or 1Password.
- **Admin MFA Reset**: If a staff member loses their authenticator device, an Admin can click **Reset MFA** in **Admin → Users**. The reset action is recorded in `pb_audit_log`, and the user is prompted to re-enroll on their next login.
- **Clock Drift Prevention**: Server time must be synchronized within 30 seconds via NTP (`chrony` or `systemd-timesyncd`).

### 4.2 Adding New Users
There is **no public sign-up**. To add a new team member:
1. Log in as an Admin and navigate to **Admin → Users**.
2. Click **Add User**, enter the staff member's name, email, and assign the role (**IT Support** or **Admin**).
3. The system generates a one-time invitation link. Provide this link to the employee.
4. On first sign-in, the user sets their password and enrolls their authenticator app.

---

## 5. Accounts, Categories & Ticketing Configuration

### 5.1 Accounts
- Navigate to **Manage → Accounts** or **Admin → Accounts**.
- Edit account details, brand badge colors, descriptions, and statuses (Active, Onboarding, Offboarding, Archived).
- **HESK Ticket URL Template**: Configure account-level or global ticket URL templates:
  ```text
  https://helpdesk.bigoutsource.com/ticket.php?track={ID}
  ```
  Sample ticket entries store only the **Tracking ID** (e.g., `BOS-49281`), automatically hyperlinked to the live ticket.

### 5.2 Categories
- Navigate to **Manage → Categories**.
- Supports an unlimited-depth hierarchical tree (e.g., `Network > Wi-Fi`, `Apps > Microsoft Teams`).
- Add, rename, nest, and reorder categories. Stable IDs ensure bookmarks and links never break upon renaming.

---

## 6. Automated Backups & Disaster Recovery

### 6.1 Automated Backup Script (`make backup`)
The backup script (`scripts/backup.sh`) produces a single compressed archive:
- **Database Dump**: Custom format dump (`database.dump`) + plain SQL dump (`database.sql`).
- **Storage Volume**: `storage.tar.gz` capturing all attachments and rich-text screenshots.
- **Configuration Export**: `config.json` containing complete settings, categories, criteria, and options via `export_config()`.
- **Manifest**: `MANIFEST.txt` with timestamp, hostname, and archive metadata.
- **Log Tracking**: Timestamped `[SUCCESS]` or `[ERROR]` entries written to `backups/backup.log`.

### 6.2 Retention Policy
- **7 daily backups**: Non-Sunday backups older than 7 days are automatically purged.
- **4 weekly backups**: Sunday backups are retained for 4 weeks (28 days).
- Purged backups are logged to `backups/backup.log`.

### 6.3 Scheduling Backups via Cron
Schedule daily execution at 2:17 AM in root crontab:
```cron
17 2 * * * cd /opt/bos-playbook && ./scripts/backup.sh >> /var/log/bos-backup.log 2>&1
```

### 6.4 Restoring from a Backup (`make restore`)
```bash
make restore ARCHIVE=backups/backup-20261027-224629.tar.gz
```
- **Safety Snapshot**: Automatically dumps current state to `pre-restore-YYYYMMDD-HHMMSS.tar.gz` before applying changes.
- **Database Restoration**: Restores database objects, recreates extensions (`pg_trgm`, `unaccent`, `pgcrypto`), and re-establishes service privileges.
- **Storage Restoration**: Extracts storage volume files directly into the active storage service.
- **Verification**: Outputs post-restore counts of Accounts, Users, and Scenarios.

---

## 7. Upgrades & Rollbacks

### 7.1 Upgrading Application
```bash
cd /opt/bos-playbook

# 1. Always take a fresh backup first
make backup

# 2. Pull latest code
git pull

# 3. Rebuild frontend image
docker compose build frontend

# 4. Apply versioned migrations (idempotent)
make migrate

# 5. Restart modified services
docker compose up -d
```

### 7.2 Rolling Back
```bash
# 1. Checkout previous tag or commit
git checkout <previous-tag>
docker compose build frontend
docker compose up -d

# 2. If schema changes need to be rolled back, restore from pre-upgrade backup:
make restore ARCHIVE=backups/backup-<pre-upgrade-stamp>.tar.gz
```

---

## 8. Offline & Air-Gapped Installation

Every Docker image is pinned by exact version tag.

On an internet-connected machine:
```bash
docker compose build frontend
make save-images     # writes images/bos-playbook-images-YYYYMMDD.tar
```
Transfer the folder and `images/` tarball to the offline server:
```bash
make load-images
make up
make migrate
```

---

## 9. Recommended Server Specifications

For Big Outsource (8 active IT personnel, supporting 26 client accounts, up to 50 peak concurrent sessions):

| Component | Minimum | Recommended | Notes |
|---|---|---|---|
| **OS** | Ubuntu Server 22.04 LTS | Ubuntu Server 24.04 LTS | Debian 12 also fully supported |
| **CPU** | 4 Cores | 8 Cores | Needed during Next.js standalone image builds |
| **RAM** | 8 GB | 16 GB | 2 GB DB, 1 GB Frontend, 768 MB Studio/Realtime, 512 MB Kong |
| **Disk** | 100 GB SSD | 250 GB SSD | Baseline stack: ~15 GB; Attachment growth: ~5-10 GB/year |
| **Network** | 1 Gbps LAN | 1 Gbps LAN | Only ports 80 and 443 exposed to company LAN |

---

## 10. Critical Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `DOMAIN` | Domain staff navigate to (e.g., `playbook.test.local` or `playbook.bigoutsource.com`). |
| `POSTGRES_PASSWORD` | Strong database password for Postgres and service roles. |
| `JWT_SECRET` | Secret key used to sign Auth JWT session tokens. |
| `ANON_KEY` | Public API key (used safely by browser). |
| `SERVICE_ROLE_KEY` | Administrative service role key (**never exposed to browser**). |
| `SECRET_KEY_BASE` | Session encryption key for Next.js cookies and realtime tokens. |
| `BACKUP_DIR` | Path where backups are written (mount secondary disk/NFS here). |
| `BACKUP_RETENTION_DAILY` | Number of daily backups to keep (default: `7`). |
| `BACKUP_RETENTION_WEEKLY` | Number of weekly backups to keep (default: `4`). |

---

## 11. Troubleshooting Common Problems

| Symptom | Probable Cause | Resolution |
|---|---|---|
| **502 Bad Gateway on Login** | Next.js chunked auth cookies exceed default Nginx buffer size | Verify `proxy_buffer_size 128k; proxy_buffers 4 256k;` in `docker/nginx/default.conf`. |
| **Login loop / Stuck on "Signing in..."** | Browser accessing `localhost` instead of canonical `playbook.test.local` | Access via `https://playbook.test.local` (ensure hosts file or internal DNS resolves to server IP). |
| **`401 PGRST301 None of the keys was able to decode JWT`** | `JWT_SECRET` and `ANON_KEY`/`SERVICE_ROLE_KEY` have drifted | Run `./scripts/generate-secrets.sh --refresh-keys` and `docker compose restart storage studio realtime`. |
| **MFA codes rejected repeatedly** | Server clock drift (>30 seconds difference with staff phones) | Run `sudo timedatectl set-ntp true` or configure `chrony` on the server. |
| **Disk Full / Build failure (`ENOSPC`)** | Old Docker build cache layers accumulated | Run `docker builder prune -f` and check free space with `df -h`. |
| **Storage container fails to start** | Missing permissions or BYPASSRLS on `supabase_storage_admin` | Restored via `restore.sh` or run `ALTER ROLE supabase_storage_admin LOGIN PASSWORD '...' BYPASSRLS;`. |

---

## 12. Makefile Reference

| Command | Action |
|---|---|
| `make up` / `make down` | Start or stop the complete Docker Compose stack. |
| `make status` / `make ps` | Check health status of all 11 microservice containers. |
| `make logs` | Follow aggregate logs from all containers. |
| `make backup` | Execute full system backup (database, storage, config) with retention. |
| `make backups` | List available backup archives in `BACKUP_DIR`. |
| `make restore ARCHIVE=...` | Restore entire system from a backup archive with safety snapshot. |
| `make test-backup` | Run Section 14 automated backup, retention, and restore acceptance suite. |
| `make test-coverage` | Run Section 13 Accounts & Coverage Matrix acceptance suite. |
| `make test-search` | Run Section 12 Search & Filter acceptance suite. |
| `make migrate` | Apply all pending SQL migrations idempotently. |
| `make seed-real` | Load the 26 real client accounts and 8 real users. |

---

## 13. Acceptance Verification

Run the complete Section 14 test suite:
```powershell
make test-backup
# Or directly:
powershell -ExecutionPolicy Bypass -File scripts\test-backup.ps1
```
