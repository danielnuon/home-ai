"""HTTP routes, one module per area, and the dependencies they share.

Routes translate HTTP to backend calls and nothing more: no rule about who may do what lives
here. That is the gate's job (spec 7.1, principle 3), and keeping it out of the routes is what
lets Discord and Brain behave identically.
"""

from typing import Annotated

from fastapi import Depends, Header, Request

from control_center.wiring import Backends

STEP_UP_HEADER = "X-Step-Up"


def get_backends(request: Request) -> Backends:
    """The backends built at start-up."""
    backends: Backends = request.app.state.backends
    return backends


BackendsDep = Annotated[Backends, Depends(get_backends)]
StepUp = Annotated[str | None, Header(alias=STEP_UP_HEADER)]
"""A step-up proof from `POST /api/step-up/verify`, passed through to the gate untouched."""
