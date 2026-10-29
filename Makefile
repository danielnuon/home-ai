# One entry point for every routine task (spec 17.18). `make ci` is exactly what CI runs.

WEB := src/control_center/web
export UV_SYSTEM_CERTS := 1

.PHONY: install dev server web types lint test build a11y ci

install:  ## Install Python and front-end dependencies, and the browser `make a11y` drives.
	uv sync
	cd $(WEB) && pnpm install --frozen-lockfile
	cd $(WEB) && pnpm exec playwright install chromium

dev:  ## Run the server on mock backends and the front end with live reload.
	$(MAKE) -j2 server web

server:
	BRAIN_DEV_IDENTITY=1 uv run python -m control_center

web:
	cd $(WEB) && pnpm dev

types:  ## Regenerate the front end's API types from the server's models.
	mkdir -p build
	uv run python scripts/export_openapi.py build/openapi.json
	cd $(WEB) && pnpm types

lint:  ## Every style, type, docstring, dead-code and duplication check.
	uv run ruff format --check .
	uv run ruff check .
	uv run mypy
	uv run pydoclint src
	uv run vulture
	cd $(WEB) && pnpm lint && pnpm exec tsc -b

test:  ## Server and front-end tests.
	uv run pytest
	cd $(WEB) && pnpm test

build:  ## Build the front end and check the initial JavaScript budget.
	cd $(WEB) && pnpm build && pnpm size

A11Y_PORT := 8499

a11y: build  ## axe on every page in a real browser, Day and Night, phone and desktop (spec 17.16).
	@# Refuse a taken port: otherwise the check would scan whatever server is already there.
	@! curl -sf http://127.0.0.1:$(A11Y_PORT)/health >/dev/null || \
		{ echo "a11y: port $(A11Y_PORT) is already in use; stop that server first." >&2; exit 1; }
	BRAIN_DEV_IDENTITY=1 BRAIN_PORT=$(A11Y_PORT) uv run python -m control_center & server=$$!; \
	trap 'kill $$server 2>/dev/null' EXIT; \
	for _ in $$(seq 50); do \
		kill -0 $$server 2>/dev/null || { echo "a11y: Brain exited during start-up." >&2; exit 1; }; \
		curl -sf http://127.0.0.1:$(A11Y_PORT)/health >/dev/null && break; sleep 0.2; \
	done; \
	curl -sf http://127.0.0.1:$(A11Y_PORT)/health >/dev/null || \
		{ echo "a11y: Brain did not answer /health within 10 s." >&2; exit 1; }; \
	cd $(WEB) && BRAIN_URL=http://127.0.0.1:$(A11Y_PORT) pnpm a11y

ci: lint test build a11y  ## Everything CI checks, and also that the generated types are current.
	mkdir -p build
	uv run python scripts/export_openapi.py build/openapi.json
	cd $(WEB) && pnpm types
	git diff --exit-code -- $(WEB)/src/api/schema.d.ts
