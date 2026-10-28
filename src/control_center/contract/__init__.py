"""The JSON contract between Brain's server and its front end.

Every type here is a Pydantic model that FastAPI publishes in its OpenAPI schema. The front end's
TypeScript types are generated from that schema (`make types`), so a change here is a change to the
API and shows up as a type error in the front end rather than as a runtime surprise.

These models describe what Brain *shows*. They are not the storage schemas of the services behind
it (spec 23); each backend adapter maps its own records into them.
"""
