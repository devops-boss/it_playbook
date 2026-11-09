# ---------------------------------------------------------------------------
# BOS Playbook
#
#   make up          start the whole stack
#   make down        stop it
#   make logs        follow the logs
#   make migrate     apply the SQL migrations
#   make seed        load the demo data
#   make backup      take a backup
#   make restore     restore from a backup
#
# Run `make help` for the full list.
# ---------------------------------------------------------------------------

SHELL := /bin/bash
COMPOSE := docker compose
ENV_FILE := .env

.DEFAULT_GOAL := help

# --- Help -------------------------------------------------------------------
.PHONY: help
help: ## Show this help
	@echo ""
	@echo "  BOS Playbook"
	@echo "  ------------"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  First run:"
	@echo "    make secrets      # generate .env with fresh secrets"
	@echo "    make certificates # write the TLS certificate"
	@echo "    make up           # start the stack"
	@echo "    make migrate      # create the schema"
	@echo "    make seed         # load the demo data"
	@echo ""

# --- Setup ------------------------------------------------------------------
.PHONY: secrets
secrets: ## Generate .env with fresh secure secrets
	@if [ -f $(ENV_FILE) ]; then \
	  echo ".env already exists - refusing to overwrite it."; \
	  echo "Move it aside first:  mv .env .env.bak"; \
	  exit 1; \
	fi
	@./scripts/generate-secrets.sh
	@chmod +x scripts/*.sh 2>/dev/null || true

.PHONY: certificates
certificates: ## Write the TLS certificate (internal CA if one is configured)
	@./scripts/make-certificates.sh

.PHONY: check-env
check-env: ## Verify .env exists and has the required values
	@if [ ! -f $(ENV_FILE) ]; then \
	  echo "ERROR: $(ENV_FILE) not found. Run: make secrets"; exit 1; \
	fi
	@for var in JWT_SECRET POSTGRES_PASSWORD ANON_KEY SERVICE_ROLE_KEY SECRET_KEY_BASE; do \
	  if ! grep -qE "^$$var=.+" $(ENV_FILE); then \
	    echo "ERROR: $$var is missing or empty in $(ENV_FILE)"; exit 1; \
	  fi; \
	done
	@if ! grep -qE "^DOMAIN=.+" $(ENV_FILE); then \
	  echo "ERROR: DOMAIN is missing in $(ENV_FILE)"; exit 1; \
	fi
	@echo ".env looks good."

.PHONY: check-certs
check-certs: ## Verify the TLS certificate and the authority are in place
	@if [ ! -f docker/nginx/certs/fullchain.pem ] || [ ! -f docker/nginx/certs/privkey.pem ]; then \
	  echo "ERROR: the TLS certificate is missing."; \
	  echo "       Run: make certificates"; exit 1; \
	fi
	@if [ ! -f docker/nginx/certs/ca.crt ]; then \
	  echo "ERROR: docker/nginx/certs/ca.crt is missing."; \
	  echo "       The application container needs the certificate authority"; \
	  echo "       to talk to the API over HTTPS. Run: make certificates"; exit 1; \
	fi
	@echo "The certificate is in place."

# --- Lifecycle --------------------------------------------------------------
.PHONY: up
up: check-env check-certs ## Start the whole stack
	@$(COMPOSE) up -d --build
	@echo ""
	@echo "BOS Playbook is starting. The first build takes a few minutes."
	@echo "  App:    https://$$(grep -E '^DOMAIN=' $(ENV_FILE) | cut -d= -f2)"
	@echo "  Studio: http://127.0.0.1:8000 (SSH tunnel from an admin workstation)"
	@echo ""
	@echo "Then run:  make migrate && make seed"

.PHONY: down
down: ## Stop the stack (data is kept in the named volumes)
	@$(COMPOSE) down

.PHONY: restart
restart: ## Restart the app and the API services
	@$(COMPOSE) restart frontend rest auth storage realtime kong

.PHONY: logs
logs: ## Follow the logs
	@$(COMPOSE) logs -f --tail=100

.PHONY: ps
ps: ## Show what is running
	@$(COMPOSE) ps

.PHONY: status
status: ps ## Show what is running (alias for ps)


.PHONY: studio
studio: ## Print how to reach Studio, which is not on the LAN
	@echo "Studio is bound to 127.0.0.1:8000 on the server, so it is not"
	@echo "reachable from the LAN. From your workstation, run:"
	@echo ""
	@echo "    ssh -L 8000:127.0.0.1:8000 <user>@<server>"
	@echo ""
	@echo "and then open http://127.0.0.1:8000 in the browser."

.PHONY: pull
pull: ## Pull the pinned images (for an air-gapped install, use load-images)
	@./scripts/images.sh pull

# --- Database ---------------------------------------------------------------
.PHONY: migrate
migrate: ## Apply the SQL migrations
	@./scripts/migrate.sh

.PHONY: migrate-status
migrate-status: ## Show which migrations have been applied
	@./scripts/migrate.sh --status

.PHONY: seed
seed: ## Load the demo data
	@./scripts/seed.sh

.PHONY: psql
psql: ## Open a psql shell on the database
	@$(COMPOSE) exec db psql -U postgres -d $${POSTGRES_DB:-postgres}

.PHONY: test
test: ## Run the backend test suite
	@./scripts/test.sh

.PHONY: test-foundation
test-foundation: ## Run Section 4 foundation acceptance tests
	@powershell -Command "Get-Content backend\tests\section4_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-iam
test-iam: ## Run Section 5 IAM and MFA acceptance tests
	@powershell -Command "Get-Content backend\tests\section5_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: seed-real
seed-real: ## Load the 26 real Big Outsource client accounts and 8 real IT users
	@powershell -Command "Get-Content backend\seed\real_data.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-real
test-real: ## Run Section 6 acceptance tests for real accounts and users
	@powershell -Command "Get-Content backend\tests\section6_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-manage
test-manage: ## Run Section 8 acceptance tests for Manage screens and operations
	@powershell -Command "Get-Content backend\tests\section8_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-scenario
test-scenario: ## Run Section 9 acceptance tests for scenarios, HESK tracking tickets, and triggers
	@powershell -Command "Get-Content backend\tests\section9_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-editor
test-editor: ## Run Section 10 acceptance tests for Scenario Editor & Publishing
	@powershell -Command "Get-Content backend\tests\section10_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-flowchart
test-flowchart: ## Run Section 11 acceptance tests for Flowcharts & Validation
	@powershell -Command "Get-Content backend\tests\section11_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-search
test-search: ## Run Section 12 acceptance tests for Search & Filters
	@powershell -Command "Get-Content backend\tests\section12_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-coverage
test-coverage: ## Run Section 13 acceptance tests for Accounts & Coverage Matrix
	@powershell -Command "Get-Content backend\tests\section13_test.sql | docker compose exec -T db psql -U supabase_admin -d postgres"

.PHONY: test-backup
test-backup: ## Run Section 14 backup, retention, and restore acceptance tests
	@powershell -ExecutionPolicy Bypass -File scripts\test-backup.ps1

# --- Backups ----------------------------------------------------------------
.PHONY: backup
backup: ## Take a backup (database + storage + configuration)
	@./scripts/backup.sh

.PHONY: restore
restore: ## Restore from a backup: make restore ARCHIVE=path/to/backup.tar.gz
	@if [ -z "$(ARCHIVE)" ]; then \
	  echo "Usage: make restore ARCHIVE=backups/backup-YYYYMMDD-HHMMSS.tar.gz"; \
	  echo "       make backup --list   to see what is available"; \
	  exit 1; \
	fi
	@./scripts/restore.sh "$(ARCHIVE)"

.PHONY: backups
backups: ## List the available backups
	@./scripts/backup.sh --list

# --- Air-gapped installs -----------------------------------------------------
.PHONY: images
images: ## Show the images the stack is made of, and whether they are here
	@./scripts/images.sh list

.PHONY: save-images
save-images: ## Save the pinned images to a tarball for an air-gapped install
	@./scripts/images.sh save

.PHONY: load-images
load-images: ## Load the saved images on an air-gapped host
	@./scripts/images.sh load

# --- Frontend ---------------------------------------------------------------
.PHONY: build-frontend
build-frontend: ## Build the frontend image only
	@$(COMPOSE) build frontend

.PHONY: typecheck
typecheck: ## Typecheck the frontend
	@cd frontend && npm ci --no-audit --no-fund && npx tsc --noEmit

# --- Housekeeping -----------------------------------------------------------
.PHONY: clean
clean: ## Remove the build artefacts (does not touch the database)
	@rm -rf frontend/.next frontend/node_modules
	@docker builder prune -f >/dev/null 2>&1 || true

.PHONY: nuke
nuke: ## Stop everything AND delete the database and storage volumes
	@read -p "This deletes ALL data. Type 'yes' to continue: " answer; \
	if [ "$$answer" = "yes" ]; then \
	  $(COMPOSE) down -v; \
	  echo "Volumes deleted."; \
	else \
	  echo "Cancelled."; \
	fi
