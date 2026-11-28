"""Mock lead chat: each lead's threads, their message trees, and a canned streamed reply.

The reply controls of spec 15.9.8 are here too: stop, edit, regenerate, switch and branch.
"""

import asyncio
import secrets
from datetime import timedelta

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock import chat_tree
from control_center.backends.mock.engine_work import THREAD_PAGES, WorkDesk
from control_center.backends.mock.fixtures import chat as chat_fixtures
from control_center.backends.mock.fixtures import threads as thread_fixtures
from control_center.backends.mock.threads import ThreadRecord
from control_center.backends.mock.world import MockWorld
from control_center.contract.today import ChatLead, ChatMessage, ChatThread
from control_center.contract.work import Thread

WORD_DELAY_SECONDS = 0.06
"""Pause between streamed words, close to a local model's speed on this hardware (8.1)."""

TEMPORARY_RETAIN_HOURS = 24
"""How long a temporary chat's transcript is kept (`chat_memory.temporary_retain_hours`, 15.9.6)."""

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
    message with no thread starts a new `conversation` thread. Each thread's messages are a tree
    (15.9.8); the head marks the branch on show. Methods that start a reply must be called from
    inside the server's event loop, because they schedule the streamed reply on that loop.
    """

    def __init__(self, world: MockWorld) -> None:
        """Keep messages in `world`, read threads through the work desk, publish on its bus."""
        self._world = world
        self._desk = WorkDesk(world)
        self._streams: dict[str, tuple[asyncio.Task[None], ChatMessage]] = {}

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
        overview = self._desk.threads(include_temporary=True)
        return [t for t in [*overview.open, *overview.recently_resolved] if t.lead_id == lead_id]

    def thread(self, lead_id: str, thread_id: str | None = None) -> ChatThread:
        """Chat with a lead: its threads, and the branch on show of the one picked.

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads, or None for a new chat.

        Returns:
            The lead, its threads, the picked thread and the messages on its branch.

        Raises:
            NotFoundError: `lead_id` is not one of the five leads, or the thread is not theirs.
        """  # noqa: DOC502 the lead is checked by self._lead()
        lead = self._with_status(self._lead(lead_id))
        threads = self._threads(lead_id)
        picked = next((t for t in threads if t.id == thread_id), None)
        if thread_id is not None and picked is None:
            raise NotFoundError(f"{lead.name} has no thread {thread_id}.")
        messages = self._world.chats.get(thread_id or "", [])
        return ChatThread(
            lead=lead,
            leads=[self._with_status(item) for item in chat_fixtures.LEADS],
            threads=threads,
            thread=picked,
            messages=chat_tree.shown(messages, self._world.chat_heads.get(thread_id or "")),
        )

    def _new_thread(
        self,
        lead_id: str,
        title: str,
        branched_from: str | None = None,
        temporary: bool = False,
    ) -> str:
        """Open a `conversation` thread (spec 15.8.1), temporary if asked, and return its id."""
        until = self._world.clock() + timedelta(hours=TEMPORARY_RETAIN_HOURS)
        name, department, pipeline = thread_fixtures.LEADS[lead_id]
        thread_id = f"TH-{secrets.token_hex(2).upper()}"
        self._world.threads[thread_id] = ThreadRecord(
            id=thread_id,
            title=title,
            kind="conversation",
            unit_id=None,
            lead_id=lead_id,
            lead_name=name,
            lead_department=department,
            pipeline=pipeline,
            principal="owner",
            since="today",
            branched_from=branched_from,
            temporary_until=until if temporary else None,
            learning=not temporary,
        )
        self._world.bus.changed(*THREAD_PAGES)
        return thread_id

    def _shown_message(self, lead_id: str, thread_id: str, message_id: str) -> ChatMessage:
        """A message on the branch on show, or NotFoundError."""
        shown = self.thread(lead_id, thread_id).messages
        found = next((m for m in shown if m.id == message_id), None)
        if found is None:
            raise NotFoundError("That message isn't on the branch you're looking at.")
        return found

    def _add_owner_message(
        self, lead_id: str, thread_id: str, text: str, parent: str | None
    ) -> str:
        message = ChatMessage(
            id=f"M-{secrets.token_hex(4)}",
            lead_id=lead_id,
            thread_id=thread_id,
            parent_id=parent,
            author="owner",
            text=text,
            at=self._world.clock(),
        )
        self._world.chats.setdefault(thread_id, []).append(message)
        self._world.chat_heads[thread_id] = message.id
        return message.id

    def send(
        self, lead_id: str, text: str, thread_id: str | None = None, temporary: bool = False
    ) -> ChatThread:
        """Store the Owner's message at the end of the branch on show, and stream the reply.

        Args:
            lead_id: One of the five leads.
            text: What the Owner wrote.
            thread_id: The thread it continues, or None to start a new one.
            temporary: Whether the new thread is a temporary chat (15.9.6); ignored otherwise.

        Returns:
            The chat, now open on the thread the message went to.

        Raises:
            NotFoundError: `lead_id` is not one of the five leads, or the thread is not theirs.
        """  # noqa: DOC502 raised by self._lead() and self.thread()
        self._lead(lead_id)
        if thread_id is None:
            thread_id = self._new_thread(lead_id, title_from(text), temporary=temporary)
        else:
            self.thread(lead_id, thread_id)
        self._halt(thread_id)
        parent = self._world.chat_heads.get(thread_id)
        owner = self._add_owner_message(lead_id, thread_id, text, parent)
        self._start_reply(lead_id, thread_id, owner, chat_fixtures.MOCK_REPLY)
        return self.thread(lead_id, thread_id)

    def edit(self, lead_id: str, thread_id: str, message_id: str, text: str) -> ChatThread:
        """Re-run the turn from an edited Owner message, as a new branch beside the original.

        Nothing the old branch did is undone. In the mock no branch takes an action, so there is
        nothing for the edit card to list.

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads.
            message_id: A message on the branch on show.
            text: The message as the Owner rewrote it.

        Returns:
            The chat, showing the new branch.

        Raises:
            NotFoundError: No such lead, thread or message on the branch on show.
            ConflictError: The message is the lead's, or the new text is empty.
        """  # noqa: DOC503 NotFoundError is raised by the helpers
        original = self._shown_message(lead_id, thread_id, message_id)
        if original.author != "owner":
            raise ConflictError("Only your own messages can be edited. Regenerate a reply instead.")
        if not text.strip():
            raise ConflictError("Write the new message first.")
        self._halt(thread_id)
        owner = self._add_owner_message(lead_id, thread_id, text.strip(), original.parent_id)
        self._start_reply(lead_id, thread_id, owner, chat_fixtures.MOCK_REPLY)
        return self.thread(lead_id, thread_id)

    def regenerate(self, lead_id: str, thread_id: str, message_id: str) -> ChatThread:
        """Write the lead's reply again, as a new branch beside the one it replaces.

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads.
            message_id: A message on the branch on show.

        Returns:
            The chat, showing the new branch.

        Raises:
            NotFoundError: No such lead, thread or message on the branch on show.
            ConflictError: The message is the Owner's.
        """  # noqa: DOC503 NotFoundError is raised by the helpers
        reply = self._shown_message(lead_id, thread_id, message_id)
        if reply.author != "lead" or reply.parent_id is None:
            raise ConflictError(
                "Only a lead's reply can be regenerated. Edit your message instead."
            )
        self._halt(thread_id)
        self._start_reply(lead_id, thread_id, reply.parent_id, chat_fixtures.MOCK_RETRY)
        return self.thread(lead_id, thread_id)

    def switch(self, lead_id: str, thread_id: str, message_id: str) -> ChatThread:
        """Show the branch that runs through `message_id`, down to its newest message.

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads.
            message_id: Any message in the thread.

        Returns:
            The chat, showing that branch.

        Raises:
            NotFoundError: No such lead, thread or message in the thread.
        """
        self.thread(lead_id, thread_id)
        messages = self._world.chats.get(thread_id, [])
        if not any(m.id == message_id for m in messages):
            raise NotFoundError("That message isn't in this conversation.")
        self._world.chat_heads[thread_id] = chat_tree.leaf(messages, message_id)
        return self.thread(lead_id, thread_id)

    def branch(self, lead_id: str, thread_id: str, message_id: str) -> ChatThread:
        """Start a new conversation thread from the branch on show, up to `message_id`.

        The new thread links back to the one it came from. In the real engine it starts from a
        summary plus the last few messages (15.8.7); the mock copies the messages themselves.

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads.
            message_id: A message on the branch on show.

        Returns:
            The chat, open on the new thread.

        Raises:
            NotFoundError: No such lead, thread or message on the branch on show.
        """  # noqa: DOC502 raised by self._shown_message()
        self._shown_message(lead_id, thread_id, message_id)
        source = self._world.threads[thread_id]
        new_id = self._new_thread(lead_id, f"{source.title} (branch)", branched_from=thread_id)
        messages = self._world.chats.get(thread_id, [])
        upto = chat_tree.path(messages, message_id)
        ids = {m.id: f"M-{secrets.token_hex(4)}" for m in upto}
        self._world.chats[new_id] = [
            m.model_copy(
                update={
                    "id": ids[m.id],
                    "thread_id": new_id,
                    "parent_id": ids.get(m.parent_id or ""),
                }
            )
            for m in upto
        ]
        self._world.chat_heads[new_id] = ids[message_id]
        return self.thread(lead_id, new_id)

    def keep(self, lead_id: str, thread_id: str) -> ChatThread:
        """Turn a temporary chat into a normal thread: "Keep this chat" (spec 15.9.6).

        Learning stays off, because the Owner started it as a private chat; they can turn it on.

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads.

        Returns:
            The chat, now an ordinary thread.

        Raises:
            NotFoundError: No such lead or thread.
            ConflictError: The thread is not a temporary chat.
        """  # noqa: DOC503 NotFoundError is raised by self.thread()
        self.thread(lead_id, thread_id)
        record = self._world.threads[thread_id]
        if record.temporary_until is None:
            raise ConflictError("This chat is already kept.")
        record.temporary_until = None
        self._world.bus.changed(*THREAD_PAGES)
        return self.thread(lead_id, thread_id)

    def set_learning(self, lead_id: str, thread_id: str, learning: bool) -> ChatThread:
        """Turn "Don't learn from this chat" off or on (spec 15.9.6).

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads.
            learning: Whether the lead may learn memory items from it.

        Returns:
            The chat, with the setting changed.

        Raises:
            NotFoundError: No such lead or thread.
            ConflictError: The thread is a temporary chat, which never learns.
        """  # noqa: DOC503 NotFoundError is raised by self.thread()
        self.thread(lead_id, thread_id)
        record = self._world.threads[thread_id]
        if record.temporary_until is not None:
            raise ConflictError("A temporary chat never learns. Keep it first.")
        record.learning = learning
        self._world.bus.changed(*THREAD_PAGES)
        return self.thread(lead_id, thread_id)

    def stop(self, lead_id: str, thread_id: str) -> ChatThread:
        """End the reply being written in `thread_id` at once, keeping what it wrote so far.

        Args:
            lead_id: One of the five leads.
            thread_id: One of that lead's threads.

        Returns:
            The chat, with the reply marked stopped.

        Raises:
            NotFoundError: No such lead or thread.
            ConflictError: No reply is being written.
        """  # noqa: DOC503 NotFoundError is raised by self.thread()
        self.thread(lead_id, thread_id)
        if not self._halt(thread_id):
            raise ConflictError("Nothing is being written right now.")
        return self.thread(lead_id, thread_id)

    def _halt(self, thread_id: str) -> bool:
        """Stop the reply streaming in `thread_id`, if any. Returns whether one was stopped."""
        stream = self._streams.pop(thread_id, None)
        if stream is None:
            return False
        task, message = stream
        task.cancel()
        message.streaming = False
        message.stopped = True
        self._publish(message)
        return True

    def _publish(self, message: ChatMessage) -> None:
        tree = self._world.chats.get(message.thread_id or "", [])
        shown = chat_tree.with_branches(tree, message)
        self._world.bus.publish("chat.message", shown.model_dump(mode="json"))

    def _start_reply(self, lead_id: str, thread_id: str, parent: str, template: str) -> None:
        """Add the lead's reply, empty, at the end of the branch, and stream its words in."""
        message = ChatMessage(
            id=f"M-{secrets.token_hex(4)}",
            lead_id=lead_id,
            thread_id=thread_id,
            parent_id=parent,
            author="lead",
            text="",
            at=self._world.clock(),
            note="Mock chat · nothing sent anywhere",
            streaming=True,
        )
        self._world.chats.setdefault(thread_id, []).append(message)
        self._world.chat_heads[thread_id] = message.id
        reply = template.format(name=self._lead(lead_id).name)
        task = asyncio.get_running_loop().create_task(self._stream(thread_id, message, reply))
        self._streams[thread_id] = (task, message)

    async def _stream(self, thread_id: str, message: ChatMessage, reply: str) -> None:
        for word in reply.split(" "):
            await asyncio.sleep(WORD_DELAY_SECONDS)
            message.text = f"{message.text} {word}".strip()
            self._publish(message)
        message.streaming = False
        self._streams.pop(thread_id, None)
        self._publish(message)
