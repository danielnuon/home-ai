"""The mock's stand-ins for the memory rules of spec 15.9.2 and 15.9.3, as plain text checks.

The engine decides these with a local EXTRACT call, the secrets detector of 9.3 rule 5 and the
restricted-topic patterns in `workspaces.yaml`. The mock uses the patterns below instead, so
Brain can show every outcome: saved, updated, learned and each reason for not saving. The
browser preview repeats them in `preview/memory.ts`; keep the two the same.
"""

import re

ITEM_MAX_CHARS = 300
"""The longest item (`chat_memory.item_max_chars`)."""

MAX_LEARNED_PER_TURN = 2
"""How many items one turn may learn (`chat_memory.max_learned_per_turn`)."""

EXPLICIT = re.compile(r"^(?:please\s+)?(?:remember(?:\s+that)?|from now on)[\s,:]+(.+)$", re.I)
""""Remember that …" or "from now on …": the Owner asks for a note to be saved now."""

STANDING_ORDER = re.compile(
    r"\b(?:always|automatically|auto)[\s-]*(?:approve|send|pay)\w*\b|\bauto-?send\w*\b", re.I
)
"""A note that would act as a permission. Memory changes no permission, so it is refused."""

SECRET = re.compile(
    r"\b(?:password|passcode|pin|code|ssn|social security|account number)\b|\d{6,}", re.I
)
"""Codes, passwords and long numbers. Secrets are never kept (10.9)."""

RESTRICTED = re.compile(
    r"\b(?:health|doctor|pharmacy|insurance|medical|medicine|bank|tax|taxes|money|salary|"
    r"invest\w*|tenant|rent|rental|mom|dad|mother|father)\b",
    re.I,
)
"""Topics that make an item restricted. Restricted items wait for Phase 10 (15.9.9)."""

LEARNABLE = re.compile(r"\b(?:I prefer|I'd rather|I like|call me|my favou?rite)\b[^.!?\n]*", re.I)
"""What the mock learns from: a stated preference or a name."""

STOPWORDS = frozenset(
    [
        "about",
        "after",
        "again",
        "also",
        "been",
        "before",
        "being",
        "could",
        "does",
        "from",
        "have",
        "just",
        "know",
        "like",
        "make",
        "more",
        "much",
        "need",
        "only",
        "please",
        "really",
        "should",
        "some",
        "than",
        "that",
        "their",
        "them",
        "then",
        "there",
        "these",
        "they",
        "this",
        "want",
        "what",
        "when",
        "where",
        "which",
        "will",
        "with",
        "would",
        "your",
    ]
)

STANDING_ORDER_REASON = (
    "Not saved: a note can't approve, send or pay for anything. Set an approval rule in "
    "Settings instead."
)
SECRET_REASON = "Not saved: codes, passwords and account numbers are never kept in memory."
RESTRICTED_REASON = "Not saved: restricted notes arrive with the restricted domains."
TOO_LONG_REASON = f"Not saved: a note holds at most {ITEM_MAX_CHARS} characters."
EMPTY_REASON = "Write the note first."


def tidy(text: str) -> str:
    """The note as it is saved: trimmed, starting with a capital, ending with a full stop."""
    text = " ".join(text.split()).strip()
    if not text:
        return text
    text = text[0].upper() + text[1:]
    return text if text[-1] in ".!?" else f"{text}."


def explicit(text: str) -> str | None:
    """The note the Owner asked to save, or None when the message asks for none."""
    match = EXPLICIT.match(text.strip())
    if match is None:
        return None
    if text.strip().lower().startswith("from now on"):
        return tidy(text)
    return tidy(match.group(1))


def refusal(text: str) -> str | None:
    """Why `text` may not be saved, or None when it may."""
    if not text.strip():
        return EMPTY_REASON
    if STANDING_ORDER.search(text):
        return STANDING_ORDER_REASON
    if SECRET.search(text):
        return SECRET_REASON
    if RESTRICTED.search(text):
        return RESTRICTED_REASON
    if len(text) > ITEM_MAX_CHARS:
        return TOO_LONG_REASON
    return None


def learnable(text: str) -> list[str]:
    """What a lead learns from the Owner's message: stated preferences that may be saved."""
    found = [tidy(match.group(0)) for match in LEARNABLE.finditer(text)]
    return [item for item in found if refusal(item) is None][:MAX_LEARNED_PER_TURN]


def words(text: str) -> set[str]:
    """The words of `text`, lower case, without punctuation."""
    return set(re.findall(r"[a-z0-9']+", text.lower()))


def same(a: str, b: str) -> bool:
    """Whether two notes say the same thing."""
    return words(a) == words(b)


def contradicts(new: str, old: str) -> bool:
    """Whether `new` replaces `old`: about the same thing, but not the same (supersession)."""
    a, b = words(new), words(old)
    union = a | b
    return bool(union) and a != b and len(a & b) / len(union) >= 0.5


def relevant(note: str, message: str) -> bool:
    """Whether a note bears on a message: they share a word of four letters or more."""
    key = {word for word in words(message) if len(word) >= 4 and word not in STOPWORDS}
    return bool(key & words(note))
