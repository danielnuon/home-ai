"""Mock chat relay: keeps each lead's history and streams a canned reply word by word."""

import asyncio
import secrets

from control_center.backends.errors import NotFoundError
from control_center.backends.mock.fixtures import chat as chat_fixtures
from control_center.backends.mock.world import MockWorld
from control_center.contract.today import ChatLead, ChatMessage, ChatThread

WORD_DELAY_SECONDS = 0.06
"""Pause between streamed words, close to a local model's speed on this hardware (8.1)."""


class MockChatRelay:
    """In-memory stand-in for the chat relay (spec 6.2). Implements `ChatRelay`.

    `send` must be called from inside the server's event loop, because it schedules the streamed
    reply on that loop.
    """

    def __init__(self, world: MockWorld) -> None:
        """Keep histories in `world` and publish streamed text on its bus."""
        self._world = world
        self._replies: set[asyncio.Task[None]] = set()

    def _lead(self, lead_id: str) -> ChatLead:
        lead = next((lead for lead in chat_fixtures.LEADS if lead.id == lead_id), None)
        if lead is None:
            raise NotFoundError("Brain can chat only with the five leads.")
        return lead

    def thread(self, lead_id: str) -> ChatThread:
        """A lead's history.

        Args:
            lead_id: One of the five leads.

        Returns:
            The lead and its messages.

        Raises:
            NotFoundError: `lead_id` is not one of the five leads.
        """
        return ChatThread(
            lead=self._lead(lead_id),
            leads=chat_fixtures.LEADS,
            messages=self._world.chats.setdefault(lead_id, []),
        )

    def send(self, lead_id: str, text: str) -> ChatThread:
        """Store the Owner's message and start streaming the reply."""
        lead = self._lead(lead_id)
        history = self._world.chats.setdefault(lead_id, [])
        history.append(
            ChatMessage(
                id=f"M-{secrets.token_hex(4)}",
                lead_id=lead_id,
                author="owner",
                text=text,
                at=self._world.clock(),
            )
        )
        reply = chat_fixtures.MOCK_REPLY.format(name=lead.name)
        task = asyncio.get_running_loop().create_task(self._stream_reply(lead_id, reply))
        # Keep a reference until the task ends; the event loop holds only a weak one.
        self._replies.add(task)
        task.add_done_callback(self._replies.discard)
        return self.thread(lead_id)

    async def _stream_reply(self, lead_id: str, reply: str) -> None:
        message = ChatMessage(
            id=f"M-{secrets.token_hex(4)}",
            lead_id=lead_id,
            author="lead",
            text="",
            at=self._world.clock(),
            note="Mock relay · nothing sent anywhere",
            streaming=True,
        )
        self._world.chats[lead_id].append(message)
        for word in reply.split(" "):
            await asyncio.sleep(WORD_DELAY_SECONDS)
            message.text = f"{message.text} {word}".strip()
            self._world.bus.publish("chat.message", message.model_dump(mode="json"))
        message.streaming = False
        self._world.bus.publish("chat.message", message.model_dump(mode="json"))
