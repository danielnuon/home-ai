"""A conversation as a tree of messages, as the engine stores it (spec 15.9.8, 23.7).

Each message names its parent. Editing a message or regenerating a reply adds a sibling, which
starts a new branch; the head is the newest message of the branch on show, and the next turn
continues it. Brain shows only the path from the root to the head, with ‹ 2 / 3 › wherever a
message on it has siblings.
"""

from control_center.contract.today import ChatMessage


def children(messages: list[ChatMessage], parent_id: str | None) -> list[ChatMessage]:
    """The replies to `parent_id` (None for the first messages), oldest first."""
    return [m for m in messages if m.parent_id == parent_id]


def leaf(messages: list[ChatMessage], message_id: str) -> str:
    """The newest message down the newest branch under `message_id`: where its branch ends."""
    current = message_id
    while below := children(messages, current):
        current = below[-1].id
    return current


def path(messages: list[ChatMessage], head: str | None) -> list[ChatMessage]:
    """The messages from the first one to `head`, in order."""
    by_id = {m.id: m for m in messages}
    shown: list[ChatMessage] = []
    current = by_id.get(head or "")
    while current is not None:
        shown.append(current)
        current = by_id.get(current.parent_id or "")
    return shown[::-1]


def with_branches(messages: list[ChatMessage], message: ChatMessage) -> ChatMessage:
    """The message with where it sits among its siblings, for the ‹ 2 / 3 › switcher."""
    siblings = [m.id for m in children(messages, message.parent_id)]
    return message.model_copy(
        update={
            "sibling_ids": siblings if len(siblings) > 1 else [],
            "branch": siblings.index(message.id) + 1,
        }
    )


def shown(messages: list[ChatMessage], head: str | None) -> list[ChatMessage]:
    """The branch on show, each message with its place among its siblings."""
    return [with_branches(messages, m) for m in path(messages, head)]
