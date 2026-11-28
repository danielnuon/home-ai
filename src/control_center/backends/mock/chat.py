"""Mock lead chat: each lead's threads, their messages, and a canned reply streamed word by word."""

import asyncio
import secrets

from control_center.backends.errors import NotFoundError
from control_center.backends.mock.engine_work import THREAD_PAGES, WorkDesk
from control_center.backends.mock.fixtures import chat as chat_fixtures
from control_center.backends.mock.fixtures import threads as thread_fixtures
from control_center.backends.mock.threads import ThreadRecord
from control_center.backends.mock.world import MockWorld
from control_center.contract.today import ChatLead, ChatMessage, ChatThread
from control_center.contract.work import Thread

WORD_DELAY_SECONDS = 0.06
"""Pause between streamed words, close to a local model's speed on this hardware (8.1)."""

TITLE_WORDS = 6
"""A new conversation is titled with the first words the Owner wrote, until the lead renames it."""


def title_from(text: str) -> str:
    """A new conversation's title: its first few words, with an ellipsis when cut."""
    words = text.split()
    title = " ".join(words[:TITLE_WORDS])
    return f"{title}…" if len(words) > TITLE_WORDS else title


class MockLeadChat:
    """In-memory stand-in for the engine's chat endpoints (spec 6.2). Implements `LeadChat`.

    Every chat is a thread (spec 15.8.1): picking one of a lead's threads continues it, and a
    message with no thread starts a new `conversation` thread. `send` must be called from inside
    the server's event loop, because it schedules the streamed reply on that loop.
    """

    def __init__(self, world: MockWorld) -> None:
        """Keep messages in `world`, read threads through the work desk, publish on its bus."""
        self._world = world
        self._desk = WorkDesk(world)
        self._replies: set[asyncio.Task[None]] = set()

    def _lead(self, lead_id: str) -> ChatLead:
        lead = next((lead for lead in chat_fixtures.LEADS if lead.id == lead_id), None)
        if lead is None:
            raise NotFoundError("Brain can chat only with the five leads.")
        return lead

    def _with_status(self, lead: ChatLead) -> ChatLead:
        """The lead with its live state from the Directory, for its contact circle."""
        employee = next((e for e in self._world.employees.values() if e.name == lead.name), None)
        if employee is None:
            return lead
        return lead.model_copy(update={"state": employee.state, "now": employee.now})

    def _threads(self, lead_id: str) -> list[Thread]:
        """The lead's threads: open ones in state order, then the recently resolved."""
        overview = self._desk.threads()
        return [t for t in [*overview.open, *overview.recently_resolved] if t.lead_id == lead_id]

    def thread(self, lead_id: str, thread_id: str | None = None) -> ChatThread:
        """Chat with a lead: its threads, and the messages of the one picked.

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads, or None for a new chat.

        Returns:
            The lead, its threads, the picked thread and its messages.

        Raises:
            NotFoundError: `lead_id` is not one of the five leads, or the thread is not theirs.
        """  # noqa: DOC502 the lead is checked by self._lead()
        lead = self._with_status(self._lead(lead_id))
        threads = self._threads(lead_id)
        picked = next((t for t in threads if t.id == thread_id), None)
        if thread_id is not None and picked is None:
            raise NotFoundError(f"{lead.name} has no thread {thread_id}.")
        return ChatThread(
            lead=lead,
            leads=[self._with_status(item) for item in chat_fixtures.LEADS],
            threads=threads,
            thread=picked,
            messages=self._world.chats.get(thread_id, []) if thread_id else [],
        )

    def _new_thread(self, lead_id: str, text: str) -> str:
        """Open a `conversation` thread for a new chat (spec 15.8.1) and return its id."""
        name, department, pipeline = thread_fixtures.LEADS[lead_id]
        thread_id = f"TH-{secrets.token_hex(2).upper()}"
        self._world.threads[thread_id] = ThreadRecord(
            id=thread_id,
            title=title_from(text),
            kind="conversation",
            unit_id=None,
            lead_id=lead_id,
            lead_name=name,
            lead_department=department,
            pipeline=pipeline,
            principal="owner",
            since="today",
        )
        self._world.bus.changed(*THREAD_PAGES)
        return thread_id

    def send(self, lead_id: str, text: str, thread_id: str | None = None) -> ChatThread:
        """Store the Owner's message, in a new thread if none is given, and stream the reply.

        Args:
            lead_id: One of the five leads.
            text: What the Owner wrote.
            thread_id: The thread it continues, or None to start a new one.

        Returns:
            The chat, now open on the thread the message went to.

        Raises:
            NotFoundError: `lead_id` is not one of the five leads, or the thread is not theirs.
        """  # noqa: DOC502 raised by self._lead() and self.thread()
        lead = self._lead(lead_id)
        if thread_id is None:
            thread_id = self._new_thread(lead_id, text)
        else:
            self.thread(lead_id, thread_id)
        self._world.chats.setdefault(thread_id, []).append(
            ChatMessage(
                id=f"M-{secrets.token_hex(4)}",
                lead_id=lead_id,
                thread_id=thread_id,
                author="owner",
                text=text,
                at=self._world.clock(),
            )
        )
        reply = chat_fixtures.MOCK_REPLY.format(name=lead.name)
        task = asyncio.get_running_loop().create_task(self._stream_reply(lead_id, thread_id, reply))
        # Keep a reference until the task ends; the event loop holds only a weak one.
        self._replies.add(task)
        task.add_done_callback(self._replies.discard)
        return self.thread(lead_id, thread_id)

    async def _stream_reply(self, lead_id: str, thread_id: str, reply: str) -> None:
        message = ChatMessage(
            id=f"M-{secrets.token_hex(4)}",
            lead_id=lead_id,
            thread_id=thread_id,
            author="lead",
            text="",
            at=self._world.clock(),
            note="Mock chat · nothing sent anywhere",
            streaming=True,
        )
        self._world.chats[thread_id].append(message)
        for word in reply.split(" "):
            await asyncio.sleep(WORD_DELAY_SECONDS)
            message.text = f"{message.text} {word}".strip()
            self._world.bus.publish("chat.message", message.model_dump(mode="json"))
        message.streaming = False
        self._world.bus.publish("chat.message", message.model_dump(mode="json"))
