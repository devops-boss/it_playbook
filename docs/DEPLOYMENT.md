# BOS Playbook — deployment runbook

Everything runs on one server inside the company network. This document
covers what to install, how to install it, how to keep it running, how to
back it up, and how to undo an upgrade that went wrong.

---

## 1. The shape of the deployment

```
                       LAN (only these two ports are open)
                          │
                    ┌─────┴─────┐
                    │   nginx   │  TLS, static caching, HSTS
                    └─────┬─────┘
                          │  (inside the Docker network)
       ┌──────────────────┼───────────────────┬──────────────────┐
       │                  │                   │                  │
  ┌────┴────┐      ┌──────┴──────┐     ┌──────┴──────┐    ┌──────┴──────┐
  │ frontend │      │    kong     │     │   studio    │    │    db       │
  │ Next.js  │      │  (routing)  │     │ (loopback)  │    │  Postgres   │
  └──────────┘      └──────┬──────┘     └──────┬──────┘    └──────┬──────┘
                            │                   │                  │
                  ┌─────────┼─────────┐         │                  │
                  │         │         │         │                  │
              ┌───┴──┐  ┌───┴──┐  ┌───┴───┐    │                  │
              │ rest │  │ auth │  │storage │◄───┼──────────────────┘
              └───┬──┘  └───┬──┘  └───┬───┘    │
                  │         │         │        │
              ┌───┴─────────┴─────────┴────────┴───┐
              │          db  (Postgres 15)          │
              └──────────────────────────────────────┘
```

**Only nginx publishes a port to the LAN**, on 80 and 443. The database,
the API and Studio are reachable only from inside the Docker network, or
through an SSH tunnel for Studio. The service-role key is never in the
frontend image and never in the browser.

### 1.1 The server

Recommended:

| | Minimum | Recommended |
| --- | --- | --- |
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disk | 100 GB SSD | 250 GB SSD (2 TB if attachments are stored) |
| Network | 1 Gbps LAN | 1 Gbps LAN |

The memory figure is set by the containers, not by the application: the
database is capped at 2 GB, Kong at 512 MB, Studio at 768 MB, realtime at
768 MB, the frontend at 1 GB, and the rest between 128 MB and 512 MB.
Allow 8 GB for the containers and 8 GB for the host. The database is
the part that grows with the content.

**Operating system.** Ubuntu Server 24.04 LTS is the tested choice: a
current kernel, a long support window, and a Docker Engine package from
the distribution's own repository. Debian 12 works the same way. Rocky
Linux 9 is fine as well.

Docker Engine 26 or later, with the Compose plugin (version 2). The
build of the frontend image needs about 2 GB of memory available to the
builder.

```bash
# On Ubuntu 24.04
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git openssl make
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"      # log out and back in
```

The `docker` group grants root-equivalent rights on the machine. Give it
to the two or three people who administer the application, and to nobody
else.

### 1.2 What to have ready before starting

- A host name that resolves inside the LAN, e.g. `playbook.example.com`.
  A DNS record is better than `/etc/hosts` on every machine.
- The certificate authority's certificate and key, if the company has an
  internal authority (see §4). If not, the script writes a self-signed
  certificate as a stopgap.
- A decision about where the backups go. A backup on the same disk is
  not a backup; `BACKUP_DIR` should point at a second disk or a file
  share.

---

## 2. Installing

### 2.1 The normal case (the server can reach the internet)

```bash
sudo mkdir -p /opt/bos-playbook && sudo chown "$USER" /opt/bos-playbook
cd /opt/bos-playbook

# 1. The application itself
git clone <your-repository> .
#    ... or copy the tree across and unpack it here.

# 2. The secrets. This writes .env with a strong JWT secret, a strong
#    database password and the matching anon and service keys.
make secrets

# 3. Set the name people will type in the address bar.
vi .env            # DOMAIN, SUPABASE_PUBLIC_URL, API_EXTERNAL_URL, SITE_URL

# 4. The TLS certificate (see section 4).
make certificates

# 5. Start the stack and create the schema.
make up
make migrate

# 6. Optional: the demo content.
make seed
```

The application is then on `https://playbook.example.com`.

`make up` builds the frontend image on the machine, which takes a few
minutes the first time and is cached afterwards.

### 2.2 The air-gapped case (the server cannot reach the internet)

The stack is made of **pinned** image versions, so it can be installed
with no route to the internet. The images are fetched elsewhere, carried
across, and loaded.

On a machine that *does* have a route:

```bash
git clone <your-repository> .
make secrets                     # a throwaway .env, to work the build
docker compose build frontend    # build the frontend image here
make save-images                 # writes images/bos-playbook-images.tar.gz
```

Carry the repository and `images/bos-playbook-images.tar.gz` across (USB
drive, or an internal file share). On the server:

```bash
cd /opt/bos-playbook
make load-images                 # loads the tarball into the local image cache
make images                      # shows what is loaded and what is missing

make secrets                     # the real .env, on the server
make certificates
make up
make migrate
```

Two rules for an air-gapped install:

- **Nothing is fetched at run time.** The frontend bundles its fonts and
  icons, and the images are pinned. A container never reaches out.
- **The image versions do not change between installations.** They are
  written in `docker-compose.yml` and in `scripts/images.sh`, and both
  files are in version control. A server that was installed in March
  and one installed in August run the same code, which is what makes an
  air-gapped install auditable.

### 2.3 Firewall

Open exactly two ports to the LAN:

| Port | Purpose |
| --- | --- |
| 443/tcp | The application |
| 80/tcp | Redirect to HTTPS, and the ACME challenge if one is ever used |

Nothing else. The database is not published by the compose file at all,
so it is not reachable even from the server's own LAN address. Studio is
bound to `127.0.0.1` and is reached through a tunnel:

```bash
ssh -L 8000:127.0.0.1:8000 user@server
# then open http://127.0.0.1:8000
```

To publish Studio to an administrator-only subnet instead, set
`STUDIO_BIND` in `.env` to that subnet's address, and allow the port in
the firewall for that subnet only.

---

## 3. The configuration file

`.env` holds the secrets and the addresses. It is gitignored, it is never
in an image, and it is never served to the browser. `.env.example`
documents every variable and is the file to read for what a variable
does.

The variables that are decided once, at installation:

| Variable | What it is |
| --- | --- |
| `DOMAIN` | The host name people type. |
| `SUPABASE_PUBLIC_URL` | The public base URL of the API, e.g. `https://playbook.example.com`. |
| `API_EXTERNAL_URL` | The public base URL of the auth service, e.g. `https://playbook.example.com/auth/v1`. |
| `SITE_URL` | The application URL, used in the e-mail links GoTrue sends. |
| `POSTGRES_PASSWORD` | The database password. |
| `JWT_SECRET` | The secret the tokens are signed with. |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | The two keys the browser and the server use. |
| `SECRET_KEY_BASE` | The secret the realtime service signs its own tokens with. |
| `REALTIME_DB_ENC_KEY` | Exactly 16 bytes, hexadecimal. |
| `HTTPS_CERT` / `HTTPS_KEY` | The certificate and key nginx serves. |
| `CA_CERT` / `CA_KEY` | The internal authority, if there is one. |
| `BACKUP_DIR` | Where the backups are written. |
| `NEXT_PUBLIC_ACCENT_COLOR` | The accent colour of the interface. |

**If the secret and the keys ever drift apart** — which happens when
`.env` is edited by hand — the API answers every request with
`401 PGRST301 "None of the keys was able to decode the JWT"`. The
repair re-signs the keys with the secret that is already there and
changes nothing else:

```bash
./scripts/generate-secrets.sh --refresh-keys
docker compose up -d --force-recreate storage studio realtime
```

`make check-env` verifies that the required values are present and
non-empty.

---

## 4. TLS

The application is served over HTTPS only. Port 80 exists to redirect.

**The internal authority is the target.** The company certificate
authority signs the certificate for `playbook.example.com`, and every
machine in the company already trusts the root, so nobody is asked to
click through a warning.

```bash
# In .env:
CA_CERT=/etc/ssl/internal/ca.crt
CA_KEY=/etc/ssl/private/ca.key

make certificates
```

The script writes `docker/nginx/certs/fullchain.pem` (the certificate
followed by the authority, so a client can build the path) and
`docker/nginx/certs/privkey.pem`.

**Without an authority** the script writes a self-signed certificate.
It works, but every browser shows a warning until the certificate is
trusted. To install and trust the root or self-signed certificate (`ca.crt` or `fullchain.pem`) on staff PCs:

### 4.1 Trusting the Certificate on Staff Workstations

- **Windows:**
  Run in an elevated PowerShell prompt on the staff workstation:
  ```powershell
  Import-Certificate -FilePath "path\to\ca.crt" -CertStoreLocation Cert:\LocalMachine\Root
  ```
  Or press `Win + R`, run `certmgr.msc`, navigate to **Trusted Root Certification Authorities** &rarr; **Certificates**, right-click &rarr; **All Tasks** &rarr; **Import**, and select `ca.crt`.

- **macOS:**
  ```bash
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca.crt
  ```

- **Linux (Ubuntu / Debian):**
  ```bash
  sudo cp ca.crt /usr/local/share/ca-certificates/playbook.crt
  sudo update-ca-certificates
  ```

### 4.2 Server Clock Synchronization (MFA Time Drift Prevention)

Time-based One-Time Passwords (TOTP) rely on precise time alignment (within 30 seconds). Keep the server clock synchronized using `chrony` or `systemd-timesyncd`:

```bash
# Enable systemd-timesyncd (built into Ubuntu 22.04/24.04)
sudo timedatectl set-ntp true
timedatectl status

# Or install chrony for higher precision NTP synchronization
sudo apt-get install -y chrony
sudo systemctl enable --now chrony
chronyc tracking
```

**Renewal.** The certificate is valid for 825 days. To replace it:

```bash
make certificates --force      # or: ./scripts/make-certificates.sh --force
docker compose restart nginx
```

If the certificate is signed by the internal authority, the private key
of the *leaf* stays on the server and never leaves it; only the
authority's key is needed at signing time, and it can be a throwaway
copy on an offline machine.

---

## 5. Day-to-day operation

```bash
make ps           # what is running, and whether it is healthy
make logs         # follow the logs
make restart      # restart the application and the API after a change
make migrate-status
```

Every container has a health check and a `restart: unless-stopped`
policy, so a container that dies is started again, and `make up` waits
for the dependencies to be healthy before it starts the next one.

Log files are rotated by Docker itself: each container keeps five files
of ten megabytes. The application logs to stdout and the database logs
to its own volume.

### 5.1 Users

There is **no public sign-up**. The first administrator is created from
the database on the server:

```bash
make psql
```

```sql
-- The password is the one from DEMO_USER_PASSWORD in .env, or one of
-- your own. The account is confirmed, so it can sign in immediately.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(), 'authenticated', 'authenticated',
  'admin@example.com', crypt('the-password', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}'
);
```

Afterwards, **Admin → Users** creates the other people, assigns them a
role, and gives them access to the accounts they need. The account
screens and the search results then follow their access.

The default roles are Super Admin, IT Ops Editor, Reviewer and IT Agent.
The matrix of permissions is editable in **Admin → Users → Roles**.

### 5.2 Mail

The application sends an invitation e-mail and a password-reset e-mail.
For a first installation on a server with no mail path, leave `SMTP_HOST`
empty: the invitation link is then shown in the application instead of
being mailed, and the administrator copies it to the person.

With an internal relay, set:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_ADMIN_EMAIL=it-ops@example.com
```

---

## 6. Backups

```bash
make backup                  # writes backups/backup-YYYYMMDD-HHMMSS.tar.gz
make backups                 # what is there
```

Each archive contains:

- a `pg_dump` of the whole database in custom format — the scenarios,
  the configuration, the users, the roles, the audit log, everything;
- the Storage volume — the attachments and the images in the rich text;
- the configuration as readable JSON, so a configuration can be moved
  between installations without touching the database.

The retention is `BACKUP_RETENTION_DAILY` daily copies (7 by default)
and `BACKUP_RETENTION_WEEKLY` weekly copies (4 by default); older
archives are removed.

**Schedule it.**

Option A: Root crontab:
```bash
crontab -e
# 02:17 every day - a minute past the hour, so it does not collide with midnight jobs
17 2 * * * cd /opt/bos-playbook && ./scripts/backup.sh >> /var/log/bos-backup.log 2>&1
```

Option B: Systemd timer (systemd service + timer units):
Create `/etc/systemd/system/bos-backup.service`:
```ini
[Unit]
Description=BOS Playbook Automated Backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=root
WorkingDirectory=/opt/bos-playbook
ExecStart=/opt/bos-playbook/scripts/backup.sh
StandardOutput=append:/var/log/bos-backup.log
StandardError=append:/var/log/bos-backup.log
```

Create `/etc/systemd/system/bos-backup.timer`:
```ini
[Unit]
Description=Run BOS Playbook backup daily at 2:17 AM

[Timer]
OnCalendar=*-*-* 02:17:00
Persistent=true

[Install]
WantedBy=timers.target
```
Enable and start the timer:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bos-backup.timer
sudo systemctl list-timers bos-backup.timer
```

**Mounting secondary or network storage.** A backup on the same disk does not
survive a physical disk failure. Set `BACKUP_DIR` in `.env` to point to a mounted
secondary disk, NFS export, or network share:
```bash
# In .env:
BACKUP_DIR=/mnt/backup-storage/bos-playbook
```
Or rsync the local archives off-site:
```bash
rsync -avz /opt/bos-playbook/backups/ backup-user@remote-storage:/nas/bos-playbook/
```

### 6.1 Restoring

```bash
make restore ARCHIVE=backups/backup-20250119-020000.tar.gz
```

The restore takes a safety dump of the current state first, so a restore
can itself be undone. It replaces the database and the storage
contents. `--db-only` restores the database and leaves the attachments
alone.

**A restore onto a fresh server** is the normal way to move the
installation to new hardware:

```bash
# on the new server
make secrets && make certificates && make up
./scripts/restore.sh /media/usb/backup-20250119-020000.tar.gz
make migrate                    # in case the archive predates a migration
```

If the secret in `.env` is different from the one the archive was made
with, the restored users cannot sign in, because their tokens are signed
with the old secret. Use the **same `JWT_SECRET`** on the new server, or
have the users sign in again after resetting their passwords. The
restore script prints a warning when it can detect this.

---

## 7. Upgrading

The application is upgraded in two parts: the images, and the SQL
migrations. They are separate on purpose — the migrations are written to
be applied to a running installation, one at a time, each recorded in
`pb_migrations`.

```bash
cd /opt/bos-playbook
git pull                        # the new code

# 1. Take a backup first. Always.
make backup

# 2. Rebuild the frontend image from the new code.
docker compose build frontend

# 3. Apply the migrations.
make migrate-status             # what is applied
make migrate                    # apply what is new

# 4. Restart the containers that changed.
docker compose up -d
```

`make migrate` is idempotent: it applies only the files that have not
been applied, in order, and records each one. A migration that fails
stops the run, and the ones already applied stay applied — so the run
can be repeated after the problem is fixed.

### 7.1 Rolling back

If the new code is the problem:

```bash
git checkout <the previous tag>   # or: git revert <the commit>
docker compose build frontend
docker compose up -d
```

The database is **not** rolled back by this, and normally does not need
to be: the migrations are written to be backward compatible, so the
previous version of the code works against the newer schema. If it does
not — because a migration dropped a column the old code reads — then
restore the database from the backup taken in step 1:

```bash
make restore ARCHIVE=backups/backup-<the one taken before the upgrade>.tar.gz
```

### 7.2 Upgrading the images

The image versions are written in `docker-compose.yml` and in
`scripts/images.sh`. To move to a newer Supabase image:

1. Read the release notes of the image and check the list of migrations
   it brings. The Supabase Postgres image applies its own migrations
   when the volume is initialised, and it does **not** re-apply them to
   an existing volume — so an upgrade of the database image needs the
   upgrade procedure of the Supabase project for that release.
2. Update the tag in `docker-compose.yml` and in `scripts/images.sh`.
3. `make backup`, then `docker compose pull db` and `docker compose up -d db`.
4. Check that the application still works, and keep the backup until it
   does.

Pinned versions are deliberate. An unpinned image is a change nobody
planned, on a server that may not be able to reach the internet.

---

## 8. Monitoring and health

```bash
curl -fsS https://playbook.example.com/health
```

The application answers with a small JSON document. The check behind it
verifies that the database answers and that the schema is present, so a
`503` means the application is up but the database is not.

From outside, monitor:

- the TCP port 443 on the server;
- the `/health` URL through nginx;
- the free space on the disk that holds the database volume and the
  backups.

Docker restarts a container that exits, so a service that stays down
means the container is failing its health check repeatedly, and the
reason is in `make logs`.

---

## 9. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Every API call answers `401 PGRST301` | The keys and the JWT secret in `.env` have drifted apart | `./scripts/generate-secrets.sh --refresh-keys` and restart `storage studio realtime` |
| The API answers `401 Unauthorized` with a `request_id` | The request never reached a service — Kong refused it | `docker logs bos-kong` |
| The page loads but shows an empty list | The `authenticated` role has no account access | Check **Admin → Users** |
| Sign-in fails, everything else works | The mail configuration, or a missing `SITE_URL` | Check `GOTRUE_SITE_URL` and the logs of `bos-auth` |
| The realtime container restarts in a loop | `REALTIME_DB_ENC_KEY` is not exactly 16 bytes | Regenerate it: `openssl rand -hex 8` |
| Kong is killed with `signal 9` | It ran out of memory | Raise the limit in `docker-compose.yml` (512 MB is the minimum) |
| The database will not start | The password in `.env` does not match the one the volume was initialised with | Restore the password, or re-initialise the volume and restore a backup |
| The build fails with `ENOSPC` | The disk is full | `docker system prune` and check the space |

---

## 10. A note on what is not in the repository

- No secret. `.env` is gitignored; `.env.example` holds placeholders and
  documents every variable.
- No certificate. `docker/nginx/certs/` is gitignored.
- No data. The database lives in a named volume, and the backups in
  `BACKUP_DIR`.
- No external service at run time. The fonts and the icons are bundled;
  the images are pinned; nothing in the container reaches the internet.
