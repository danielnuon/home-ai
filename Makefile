# One entry point for every routine task (spec 17.18). `make ci` is exactly what CI runs.

WEB := src/control_center/web
export UV_SYSTEM_CERTS := 1

.PHONY: install dev server web types lint test build ci

install:  ## Install Python and front-end dependencies.
	uv sync
	cd $(WEB) && pnpm install --frozen-lockfile

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

ci: lint test build  ## Everything CI checks, and also that the generated types are current.
	mkdir -p build
	uv run python scripts/export_openapi.py build/openapi.json
	cd $(WEB) && pnpm types
	git diff --exit-code -- $(WEB)/src/api/schema.d.ts
