.DEFAULT_GOAL := help

# Default to the developer's `pytone-tv` named device (registered with
# ares-setup-device); override with `make install DEVICE=mytv`.
DEVICE ?= pytone-tv

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dist: ## Build the IPK
	@mkdir -p dist
	ares-package . -o dist

install: dist ## Install on a registered TV (DEVICE=pytone-tv)
	ares-install -d $(DEVICE) dist/tv.pytone.app_*.ipk

launch: ## Launch the installed app on the TV
	ares-launch -d $(DEVICE) tv.pytone.app

launch-staging: ## Launch pointing at staging
	ares-launch -d $(DEVICE) tv.pytone.app -p '{"target":"staging"}'

inspect: ## Open Chrome devtools attached to the TV
	ares-inspect -d $(DEVICE) -a tv.pytone.app

logs: ## Tail the TV's WebAppMgr logs
	ares-shell -d $(DEVICE) -r 'journalctl -f -t WebAppMgr'

uninstall: ## Uninstall the app from the TV
	ares-install -d $(DEVICE) -r tv.pytone.app

preview: ## Serve the launcher locally for a browser preview
	npx --yes serve -l 5050 .

clean:
	rm -rf dist

.PHONY: help dist install launch launch-staging inspect logs uninstall preview clean
