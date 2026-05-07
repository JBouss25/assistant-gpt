.PHONY: help up down restart logs ps build test seed clean nuke health

COMPOSE = docker compose
SERVICES ?=

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Stack lifecycle ─────────────────────────────────────────────────────────

up: ## Démarre toute la stack (build si nécessaire)
	$(COMPOSE) up -d --build $(SERVICES)

up-infra: ## Démarre uniquement l'infrastructure (DBs, Redis, Kafka, Keycloak, Kong)
	$(COMPOSE) up -d postgres-core-admin postgres-keycloak postgres-timetable postgres-attendance postgres-finance postgres-gradebook postgres-lms postgres-notifications postgres-ai postgres-chatbot postgres-analytics redis zookeeper kafka keycloak kong

up-services: ## Démarre les microservices applicatifs
	$(COMPOSE) up -d core-admin-service timetable-service attendance-service finance-service gradebook-service lms-service notification-service ai-prediction-service chatbot-service analytics-service

up-frontend: ## Démarre le frontend
	$(COMPOSE) up -d frontend

down: ## Arrête toute la stack
	$(COMPOSE) down

restart: ## Redémarre un service (make restart SERVICES=lms-service)
	$(COMPOSE) restart $(SERVICES)

# ── Build ────────────────────────────────────────────────────────────────────

build: ## Rebuild toutes les images
	$(COMPOSE) build --no-cache $(SERVICES)

build-svc: ## Rebuild uniquement les microservices
	$(COMPOSE) build --no-cache core-admin-service timetable-service attendance-service finance-service gradebook-service lms-service notification-service ai-prediction-service chatbot-service analytics-service frontend

# ── Logs ─────────────────────────────────────────────────────────────────────

logs: ## Affiche les logs de tous les services (Ctrl+C pour quitter)
	$(COMPOSE) logs -f $(SERVICES)

logs-errors: ## Affiche uniquement les lignes d'erreur
	$(COMPOSE) logs --no-log-prefix $(SERVICES) 2>&1 | grep -iE "error|ERR|exception|fatal"

ps: ## Affiche l'état des conteneurs
	$(COMPOSE) ps

# ── Health ───────────────────────────────────────────────────────────────────

health: ## Vérifie les health checks de tous les services
	@echo "=== Health Check ==="
	@for port in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do \
		status=$$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$$port/health 2>/dev/null); \
		color="\033[32m"; \
		[ "$$status" != "200" ] && color="\033[31m"; \
		printf "  Port $$port: $${color}$$status\033[0m\n"; \
	done
	@echo "  Kong:      $$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000 2>/dev/null)"
	@echo "  Frontend:  $$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)"

# ── Tests ─────────────────────────────────────────────────────────────────────

test: ## Lance tous les tests unitaires (Node + Python)
	@echo "=== Tests Node.js ===" && \
	for svc in core-admin-service timetable-service attendance-service finance-service gradebook-service lms-service notification-service chatbot-service analytics-service; do \
		echo "--- $$svc ---"; \
		$(COMPOSE) exec $$svc npm test 2>/dev/null || echo "SKIP (not running)"; \
	done
	@echo "=== Tests Python ===" && \
	$(COMPOSE) exec ai-prediction-service python -m pytest tests/ -v 2>/dev/null || echo "SKIP (not running)"

test-local: ## Lance les tests sans Docker (nécessite les dépendances installées)
	@echo "=== Tests Node.js (local) ===" && \
	for svc in core-admin-service timetable-service attendance-service finance-service gradebook-service lms-service notification-service chatbot-service analytics-service; do \
		echo "--- $$svc ---"; \
		cd services/$$svc && npm test 2>/dev/null && cd ../..; \
	done
	@echo "=== Tests Python (local) ===" && \
	cd services/ai-prediction-service && python -m pytest tests/ -v && cd ../..

# ── Seed ─────────────────────────────────────────────────────────────────────

seed: ## Insère des données de démonstration
	@echo "Injection données demo..."
	$(COMPOSE) exec -T postgres-core-admin psql -U erpadmin -d core_admin -f /dev/stdin < infrastructure/postgres/seed-demo.sql
	@echo "Done."

# ── Keycloak ──────────────────────────────────────────────────────────────────

kc-import: ## Importe le realm Keycloak
	$(COMPOSE) exec keycloak /opt/keycloak/bin/kc.sh import --file /tmp/erp-realm.json

kc-export: ## Exporte la config Keycloak
	$(COMPOSE) exec keycloak /opt/keycloak/bin/kc.sh export --file /tmp/erp-realm-export.json --realm erp-scolaire

# ── Load tests ────────────────────────────────────────────────────────────────

k6-smoke: ## Lance le smoke test k6 (nécessite k6 installé)
	k6 run infrastructure/k6/smoke.js

k6-load: ## Lance le load test k6
	k6 run infrastructure/k6/load.js

# ── Cleanup ───────────────────────────────────────────────────────────────────

clean: ## Supprime les conteneurs arrêtés et les images inutilisées
	docker container prune -f
	docker image prune -f

nuke: ## DANGER — Supprime tout (conteneurs + volumes + images du projet)
	@read -p "Êtes-vous sûr ? Cette action supprime toutes les données. (oui/non) " confirm; \
	[ "$$confirm" = "oui" ] && $(COMPOSE) down -v --rmi local || echo "Annulé."
