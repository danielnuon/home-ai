"""The versions of what Brain's server and front end exchange (spec 17.18, design practice 8).

Every API and event carries a version so that either side can change without the other being
rebuilt in the same step. Raise a number only for a change an existing client cannot read: a
field removed or renamed, a type changed, a meaning changed. Adding an optional field is not one.

When a number goes up, the same change keeps the previous version answering until no client uses
it (a second router under ``/api/v<previous>``, or the old event shape for clients that ask for
it) and adds a test that reads the previous version.
"""

API_VERSION = 1
"""The HTTP API's version. It is in every path: ``/api/v1/...``."""

API_PREFIX = f"/api/v{API_VERSION}"
"""Where the API is mounted."""

EVENTS_VERSION = 1
"""The event stream's version: the event kinds in `control_center.events` and their payloads.

The stream's first frame (``hello``) carries it as ``events_version``. A front end built for a
different version stops patching its cache from events and refetches instead.
"""
