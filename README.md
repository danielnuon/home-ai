# home-ai

Brain, the Control Center for the home AI platform: one dashboard for the Owner to see what the
AI team is doing, approve what leaves the house, and change any setting safely. It runs on the Mac
mini behind Tailscale and is built to the build spec (sections 7.1 to 7.18).

Until the hardware and the rest of the platform exist, Brain runs on **mock backends**: an
in-memory world with the same data as the design mockup, a simulated team that keeps working, and
the real safety rules (step-up for loosening, hard limits, undo windows). Swapping in the real
services means writing four classes; nothing in the routes or the front end changes.

## Run it

```sh
make install   # Python (uv) and front-end (pnpm) dependencies
make dev       # server on 127.0.0.1:8406 and the app on http://localhost:5173
make ci        # every check CI runs: lint, types, tests, build, bundle budget
```

You need Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 22 and pnpm 10.

## Where to go next

- [ARCHITECTURE.md](ARCHITECTURE.md): how the pieces fit, and where the real backends plug in.
- [docs/engineering/onboarding.md](docs/engineering/onboarding.md): your first hour in the code.
- [docs/architecture/adr/](docs/architecture/adr/): the decisions behind the stack.
