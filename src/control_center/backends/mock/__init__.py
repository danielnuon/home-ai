"""Mock implementations of the four backend protocols, sharing one in-memory world.

The mocks stand in for services that do not exist until their build phase (spec 24.5: "every
outside dependency has a stub"). They keep the real services' rules where Brain's behavior depends
on them: which actions need a step-up, what counts as tightening or loosening, what a hard limit
refuses, and which events a change publishes. They do not persist anything; restarting the server
restores the fixtures.

Fixture content comes from the Brain design canvas, so the app and the mockup show the same day.
"""
