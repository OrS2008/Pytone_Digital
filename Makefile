.DEFAULT_GOAL := help

SERVICES := gateway auth user playlist-ingestion metadata epg search recommendation \
            playback streaming transcoding recording dvr ai-playback analytics \
            notification sports sync

# ---------------------------------------------------------------------------
help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# --- local stack -----------------------------------------------------------
up: ## Bring up the full local stack
	docker compose up -d --build

up-data: ## Bring up only data stores
	docker compose up -d postgres redis kafka typesense minio

down: ## Tear down the local stack
	docker compose down

logs: ## tail logs for a single service (make logs s=playback)
	docker compose logs -f $${s:-gateway}

# --- builds ----------------------------------------------------------------
build: ## Build every Go service
	@for s in $(SERVICES); do echo "=== $$s ==="; (cd services/$$s && go build ./...); done

test: ## Test every Go module
	@for s in $(SERVICES); do echo "=== $$s ==="; (cd services/$$s && go test ./... -race -count=1); done
	(cd libs/go/pkg && go test ./... -race -count=1)

vet: ## Vet every Go module
	@for s in $(SERVICES); do echo "=== $$s ==="; (cd services/$$s && go vet ./...); done

proto: ## Regenerate proto code
	cd libs/proto && buf generate

# --- clients ---------------------------------------------------------------
tv: ## Run the TV app
	cd apps/tv && flutter run -d linux

mobile: ## Run the mobile app
	cd apps/mobile && flutter run

web: ## Run the web app (also serves /tv for the LG IPK)
	cd apps/web && npm run dev

# --- LG webOS --------------------------------------------------------------
lg-ipk: ## Build the LG webOS IPK
	cd apps/lg-webos && npm install && make dist

lg-install: ## Install the IPK on a registered TV (DEVICE=novastream-tv)
	cd apps/lg-webos && make install DEVICE=$${DEVICE:-novastream-tv}

lg-launch: ## Launch the app on the TV
	cd apps/lg-webos && make launch DEVICE=$${DEVICE:-novastream-tv}

lg-launch-local: ## Launch pointing the TV at this laptop's web dev server
	cd apps/lg-webos && ares-launch -d $${DEVICE:-novastream-tv} tv.novastream.app \
	  -p '{"appUrl":"http://$(shell hostname -I | awk '{print $$1}'):3000/tv"}'

# --- migrations ------------------------------------------------------------
migrate: ## Apply all migrations against the local Postgres
	@for s in playlist-ingestion epg recording dvr auth user; do \
	  if [ -d "services/$$s/migrations" ]; then \
	    echo "=== $$s ==="; \
	    PGURI=postgres://novastream:novastream@localhost:5432/$${s//-/_}; \
	    for f in services/$$s/migrations/*.sql; do \
	      psql "$$PGURI" -f "$$f"; \
	    done; \
	  fi; \
	done

.PHONY: help up up-data down logs build test vet proto tv mobile web migrate
