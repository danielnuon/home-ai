"""The mock gate's accounts and security controls: Connections, Voice, Security and data export.

Every rule follows spec 7.16 rule 3. Connecting, entering a secret, adding a clone or a passkey,
resuming a workspace, resetting the authenticator, new recovery codes and exporting data loosen
something or reveal it, so they need a step-up. Disconnecting, removing a secret, stopping a
workspace and signing out a device tighten, so they take one tap. The checks that need no passkey
run first, so a request that would be refused anyway never spends one.
"""

import re
import secrets

from control_center.backends.errors import ConflictError, NotFoundError
from control_center.backends.mock.fixtures import accounts as fixtures
from control_center.backends.mock.fixtures import ops
from control_center.backends.mock.gate_step_up import StepUpDesk
from control_center.contract.accounts import (
    AuditExport,
    AuditRange,
    Connection,
    ConnectionResult,
    ExportScope,
    ExportStarted,
    NewVoiceProfile,
    Passkey,
    RecoveryCodes,
    SecurityResult,
    TotpReset,
    VoicePreview,
    VoiceProfile,
    Workspace,
)
from control_center.contract.gate import SettingChange

CONNECTION_PAGES = ("connections", "today")
VOICE_PAGES = ("voice", "settings")
SECURITY_PAGES = ("security",)

VOICE_SETTING = "voice.profile"
DEFAULT_VOICE = "twilio_default"
EXPORT_SCOPES = {"all": "all data", "owner": "your data", "mom": "Mom's data", "dad": "Dad's data"}
RECOVERY_CODE_COUNT = 8


def voice_id(name: str, taken: set[str]) -> str:
    """A profile id from its name, as the Call voice setting lists it: "Grandma" → "grandma"."""
    base = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "voice"
    found, number = base, 2
    while found in taken:
        found, number = f"{base}_{number}", number + 1
    return found


class AccountsControls(StepUpDesk):
    """The Connections, Voice, Security and export part of `ApprovalGate`."""

    # Connections ---------------------------------------------------------------------------

    def _connection(self, connection_id: str) -> Connection:
        found = self._world.accounts.connections.get(connection_id)
        if found is None:
            raise NotFoundError("That connection doesn't exist.")
        return found

    def _changed(
        self, connection: Connection, message: str, *, ok: bool = True
    ) -> ConnectionResult:
        connection.status = fixtures.connection_status(connection)
        self._world.bus.changed(*CONNECTION_PAGES)
        return ConnectionResult(connection=connection, message=message, ok=ok)

    def connect(self, connection_id: str, step_up: str | None) -> ConnectionResult:
        """Connect an account or platform link. Loosening, so it needs a step-up.

        Args:
            connection_id: The connection.
            step_up: A proof from `verify_step_up`.

        Returns:
            The connection and the toast.

        Raises:
            ConflictError: It is a macOS app or a paid provider, which connect another way, or it
                is already connected.
        """  # noqa: DOC503 NotFoundError and StepUpRequiredError come from the helpers
        connection = self._connection(connection_id)
        if connection.kind == "mac_app":
            raise ConflictError(f"macOS asks for {connection.title}. Ask again from its menu.")
        if connection.kind == "provider":
            raise ConflictError(f"{connection.title} connects when you enter its key.")
        if connection.connected:
            raise ConflictError(f"{connection.title} is already connected.")
        self._require_step_up(step_up, f"Connecting {connection.title} needs your passkey.")
        connection.connected, connection.last_error = True, None
        return self._changed(connection, f"{connection.title} is connected")

    def disconnect(self, connection_id: str) -> ConnectionResult:
        """Disconnect at once. Tightening, so one tap; a provider's key is removed with it.

        Args:
            connection_id: The connection.

        Returns:
            The connection and the toast.

        Raises:
            ConflictError: It is a macOS app, which is turned off in System Settings, or it is
                not connected.
        """  # noqa: DOC503 NotFoundError comes from self._connection()
        connection = self._connection(connection_id)
        if connection.kind == "mac_app":
            raise ConflictError(
                f"Turn {connection.title} off in System Settings → Privacy on the Mac."
            )
        if not connection.connected:
            raise ConflictError(f"{connection.title} isn't connected.")
        connection.connected, connection.last_error = False, None
        if connection.kind == "provider":
            connection.secret, connection.secret_note = "none", None
        return self._changed(connection, f"{connection.title} is disconnected")

    def set_secret(self, connection_id: str, value: str, step_up: str | None) -> ConnectionResult:
        """Enter or rotate a secret. The broker keeps it and Brain never shows it again.

        Args:
            connection_id: The connection.
            value: The secret, as typed.
            step_up: A proof from `verify_step_up`; always needed.

        Returns:
            The connection and the toast. The secret is not in it.

        Raises:
            ConflictError: The connection takes no secret, or the value is blank.
        """  # noqa: DOC503 NotFoundError and StepUpRequiredError come from the helpers
        connection = self._connection(connection_id)
        if connection.secret is None:
            raise ConflictError(f"{connection.title} doesn't use a key.")
        if not value.strip():
            raise ConflictError("Paste the key first.")
        rotating = connection.secret == "stored"
        self._require_step_up(step_up, f"Storing a key for {connection.title} needs your passkey.")
        connection.secret = "stored"
        connection.secret_note = "Stored just now · never shown again"
        connection.connected, connection.last_error = True, None
        said = "Key replaced" if rotating else "Key stored"
        return self._changed(connection, f"{said} for {connection.title}")

    def remove_secret(self, connection_id: str) -> ConnectionResult:
        """Remove a stored secret at once. Tightening, so one tap; the connection stops.

        Args:
            connection_id: The connection.

        Returns:
            The connection and the toast.

        Raises:
            ConflictError: No secret is stored.
        """  # noqa: DOC503 NotFoundError comes from self._connection()
        connection = self._connection(connection_id)
        if connection.secret != "stored":
            raise ConflictError(f"No key is stored for {connection.title}.")
        connection.secret, connection.secret_note = "none", None
        connection.connected = False
        return self._changed(connection, f"Key removed for {connection.title}")

    def ask_permission(self, connection_id: str) -> ConnectionResult:
        """Show a macOS permission prompt again (spec 20.16). The Owner answers it on the Mac.

        Args:
            connection_id: A macOS app.

        Returns:
            The connection, now waiting, and the toast.

        Raises:
            ConflictError: It is not a macOS app, or the app is already allowed.
        """  # noqa: DOC503 NotFoundError comes from self._connection()
        connection = self._connection(connection_id)
        if connection.kind != "mac_app":
            raise ConflictError(f"{connection.title} has no macOS prompt.")
        if connection.permission == "allowed":
            raise ConflictError(f"{connection.title} is already allowed.")
        connection.permission = "waiting"
        return self._changed(connection, f"macOS is asking about {connection.title} on the Mac")

    def test_connection(self, connection_id: str) -> ConnectionResult:
        """Check that a connection answers. Read-only, so it never needs a passkey.

        Args:
            connection_id: The connection.

        Returns:
            Whether it answered, and what to do if not.

        Raises:
            ConflictError: It is not connected, so there is nothing to test.
        """  # noqa: DOC503 NotFoundError comes from self._connection()
        connection = self._connection(connection_id)
        if not connection.connected:
            raise ConflictError(f"Connect {connection.title} first.")
        if connection.last_error:
            failed = f"{connection.title} still fails: {connection.last_error}."
            return ConnectionResult(
                connection=connection,
                message=f"{failed} Replace its key.",
                ok=False,
            )
        connection.last_sync = "just now"
        return self._changed(connection, f"{connection.title} answered in 0.2 s")

    # Voice ---------------------------------------------------------------------------------

    def _voice(self, profile_id: str) -> VoiceProfile:
        found = self._world.accounts.voices.get(profile_id)
        if found is None:
            raise NotFoundError("That voice doesn't exist.")
        return found

    def _locked(self, profile: VoiceProfile) -> bool:
        return profile.kind == "celebrity_clone" and not self._world.is_on(
            "voice.profiles.celebrity_clones"
        )

    def _rendered(self, profile: VoiceProfile) -> None:
        profile.clips, profile.rendered_at = len(fixtures.CALL_LINES), self._world.clock()

    def add_voice_profile(self, new: NewVoiceProfile, step_up: str | None) -> VoiceProfile:
        """Add a stock voice (one tap) or a clone (step-up, with its consent or risk record).

        Args:
            new: What to add.
            step_up: A proof from `verify_step_up`; needed for a clone.

        Returns:
            The new profile, rendered.
        """
        voices = self._world.accounts.voices
        if new.kind == "stock":
            profile = self._stock_profile(new.stock_id)
        else:
            profile = self._clone_profile(new, step_up)
        self._rendered(profile)
        voices[profile.id] = profile
        self._world.settings[VOICE_SETTING].choices.append(profile.id)
        self._world.bus.changed(*VOICE_PAGES)
        return profile

    def _stock_profile(self, stock_id: str | None) -> VoiceProfile:
        stock = next((v for v in fixtures.STOCK_VOICES if v.id == stock_id), None)
        if stock is None:
            raise NotFoundError("That stock voice doesn't exist.")
        if stock.id in self._world.accounts.voices:
            raise ConflictError(f"{stock.name} is already a profile.")
        return self._new_profile(
            stock.id,
            name=stock.name,
            kind="stock",
            engine=fixtures.KOKORO,
            record=None,
            sample=None,
        )

    def _clone_profile(self, new: NewVoiceProfile, step_up: str | None) -> VoiceProfile:
        name, sample = (new.name or "").strip(), (new.sample or "").strip()
        if not name:
            raise ConflictError("Name the voice first.")
        if not sample:
            raise ConflictError("Record or upload a sample first.")
        if new.kind == "consented_clone":
            consent = (new.consent or "").strip()
            if not consent:
                raise ConflictError(f"Say how {name} agreed to have their voice cloned.")
            record = f"Consent recorded · {consent}"
        else:
            if not self._world.is_on("voice.profiles.celebrity_clones"):
                raise ConflictError("Turn on Private celebrity clones first.")
            if not new.risk_acknowledged:
                raise ConflictError("Acknowledge the risk notice first.")
            record = "Risk notice acknowledged just now"
        self._require_step_up(step_up, "Adding a cloned voice needs your passkey.")
        profile_id = voice_id(name, set(self._world.accounts.voices))
        return self._new_profile(
            profile_id,
            name=name,
            kind=new.kind,
            engine=fixtures.CHATTERBOX,
            record=record,
            sample=sample,
        )

    @staticmethod
    def _new_profile(  # noqa: PLR0913 -- one argument per field a new profile sets
        profile_id: str,
        *,
        name: str,
        kind: str,
        engine: str,
        record: str | None,
        sample: str | None,
    ) -> VoiceProfile:
        return VoiceProfile.model_validate(
            {
                "id": profile_id,
                "name": name,
                "kind": kind,
                "meta": fixtures.voice_meta(kind, engine),
                "engine": engine,
                "record": record,
                "sample": sample,
                "clips": 0,
                "rendered_at": None,
                "selected": False,
                "locked": False,
            }
        )

    def render_voice_profile(self, profile_id: str) -> VoiceProfile:
        """Render the script lines again in this voice (spec 11.5.1, "Rendering").

        Args:
            profile_id: The profile.

        Returns:
            The profile with fresh clips.

        Raises:
            ConflictError: Twilio's own voice has no local clips, or the profile is locked.
        """  # noqa: DOC503 NotFoundError comes from self._voice()
        profile = self._voice(profile_id)
        if profile.kind == "default":
            raise ConflictError("Twilio's own voice has no clips to render.")
        if self._locked(profile):
            raise ConflictError("Turn on Private celebrity clones to use this voice.")
        self._rendered(profile)
        self._world.bus.changed(*VOICE_PAGES)
        return profile

    def preview_voice_profile(self, profile_id: str) -> VoicePreview:
        """Play the script in this voice, in Brain only, from the clips on the Mac (guardrail 2).

        Args:
            profile_id: The profile.

        Returns:
            The lines that play.

        Raises:
            ConflictError: Twilio's voice is heard only on a call, or the profile is locked.
        """  # noqa: DOC503 NotFoundError comes from self._voice()
        profile = self._voice(profile_id)
        if profile.kind == "default":
            raise ConflictError("Twilio's own voice is heard only on a call.")
        if self._locked(profile):
            raise ConflictError("Turn on Private celebrity clones to use this voice.")
        return VoicePreview(
            profile_id=profile.id,
            lines=fixtures.CALL_LINES,
            message=f"Playing {profile.name} on this device. The clips stay on the Mac.",
        )

    def delete_voice_profile(self, profile_id: str) -> None:
        """Delete a profile with its sample, clips and Twilio assets (guardrail 5). Logged.

        It can't be undone, because the sample is destroyed with it. If it was the call voice,
        calls go back to Twilio's own voice.

        Args:
            profile_id: The profile.

        Raises:
            ConflictError: Twilio's own voice is the fallback and stays.
        """  # noqa: DOC503 NotFoundError comes from self._voice()
        profile = self._voice(profile_id)
        if profile.kind == "default":
            raise ConflictError("Twilio's own voice is the fallback and can't be deleted.")
        del self._world.accounts.voices[profile_id]
        setting = self._world.settings[VOICE_SETTING]
        if setting.value == profile_id:
            setting.history.insert(
                0,
                SettingChange(
                    at=self._world.clock(), old=profile_id, new=DEFAULT_VOICE, via="brain"
                ),
            )
            setting.value = DEFAULT_VOICE
        setting.choices = [c for c in setting.choices if c != profile_id]
        self._world.bus.changed(*VOICE_PAGES)

    # Security ------------------------------------------------------------------------------

    def _workspace(self, workspace_id: str) -> Workspace:
        found = self._world.accounts.workspaces.get(workspace_id)
        if found is None:
            raise NotFoundError("That workspace doesn't exist.")
        return found

    def stop_workspace(self, workspace_id: str) -> Workspace:
        """Stop one workspace: the tool server denies every call in it. Tightening, one tap.

        Args:
            workspace_id: The workspace.

        Returns:
            The workspace, stopped.
        """  # noqa: DOC503 NotFoundError comes from self._workspace()
        workspace = self._workspace(workspace_id)
        workspace.stopped = True
        self._world.bus.changed(*SECURITY_PAGES)
        return workspace

    def resume_workspace(self, workspace_id: str, step_up: str | None) -> Workspace:
        """Resume a stopped workspace, behind a step-up.

        Args:
            workspace_id: The workspace.
            step_up: A proof from `verify_step_up`.

        Returns:
            The workspace, running.

        Raises:
            ConflictError: It isn't stopped.
        """  # noqa: DOC503 NotFoundError and StepUpRequiredError come from the helpers
        workspace = self._workspace(workspace_id)
        if not workspace.stopped:
            raise ConflictError(f"{workspace.name} is already running.")
        self._require_step_up(step_up, f"Resuming {workspace.name} needs your passkey.")
        workspace.stopped = False
        self._world.bus.changed(*SECURITY_PAGES)
        return workspace

    def sign_out_device(self, device_id: str) -> SecurityResult:
        """End a device's Brain session at once. Tightening, so one tap.

        Args:
            device_id: The device.

        Returns:
            The toast.

        Raises:
            NotFoundError: No such device.
            ConflictError: It is the device in use.
        """
        device = self._world.accounts.devices.get(device_id)
        if device is None:
            raise NotFoundError("That device is already signed out.")
        if device.current:
            raise ConflictError("That's the device you're using. Close Brain here instead.")
        del self._world.accounts.devices[device_id]
        self._world.bus.changed(*SECURITY_PAGES)
        return SecurityResult(message=f"{device.name} is signed out")

    def add_passkey(self, name: str, step_up: str | None) -> Passkey:
        """Register a new passkey. It needs an existing one, so it needs a step-up.

        Args:
            name: The device's name.
            step_up: A proof from `verify_step_up`.

        Returns:
            The new passkey.

        Raises:
            ConflictError: The name is blank.
        """  # noqa: DOC503 StepUpRequiredError comes from self._require_step_up()
        if not name.strip():
            raise ConflictError("Name the device first.")
        self._require_step_up(step_up, "Adding a passkey needs one you already have.")
        passkey = Passkey(
            id=f"pk-{secrets.token_hex(2)}", name=name.strip(), meta="Added just now · not used yet"
        )
        self._world.accounts.passkeys[passkey.id] = passkey
        self._world.bus.changed(*SECURITY_PAGES)
        return passkey

    def remove_passkey(self, passkey_id: str, step_up: str | None) -> SecurityResult:
        """Remove a passkey, behind a step-up. The last one can only go at the desk.

        Args:
            passkey_id: The passkey.
            step_up: A proof from `verify_step_up`.

        Returns:
            The toast.

        Raises:
            NotFoundError: No such passkey.
            ConflictError: It is the last one.
        """  # noqa: DOC503 StepUpRequiredError comes from self._require_step_up()
        passkeys = self._world.accounts.passkeys
        passkey = passkeys.get(passkey_id)
        if passkey is None:
            raise NotFoundError("That passkey is already removed.")
        if len(passkeys) == 1:
            raise ConflictError(
                "That's your last passkey. Remove it at the desk with aigate step-up."
            )
        self._require_step_up(step_up, f"Removing the {passkey.name} passkey needs your passkey.")
        del passkeys[passkey_id]
        self._world.bus.changed(*SECURITY_PAGES)
        return SecurityResult(message=f"The {passkey.name} passkey is removed")

    def reset_totp(self, step_up: str | None) -> TotpReset:
        """Replace the Discord authenticator secret. The old codes stop working at once.

        Args:
            step_up: A proof from `verify_step_up`.

        Returns:
            The new setup key, shown once.
        """  # noqa: DOC503 StepUpRequiredError comes from self._require_step_up()
        self._require_step_up(step_up, "Resetting the Discord authenticator needs your passkey.")
        self._world.accounts.totp = "Reset just now · scan the new key"
        self._world.bus.changed(*SECURITY_PAGES)
        return TotpReset(
            setup_key=secrets.token_hex(10).upper(),
            message="Add this key to your authenticator now. It won't be shown again.",
        )

    def regenerate_recovery_codes(self, step_up: str | None) -> RecoveryCodes:
        """Issue new recovery codes; the old ones stop working at once.

        Args:
            step_up: A proof from `verify_step_up`.

        Returns:
            The new codes, shown once.
        """  # noqa: DOC503 StepUpRequiredError comes from self._require_step_up()
        self._require_step_up(step_up, "New recovery codes need your passkey.")
        codes = [secrets.token_hex(4) for _ in range(RECOVERY_CODE_COUNT)]
        self._world.accounts.recovery = f"{RECOVERY_CODE_COUNT} new codes made just now"
        self._world.bus.changed(*SECURITY_PAGES)
        return RecoveryCodes(
            codes=codes, message="Print or save these now. The old codes no longer work."
        )

    def export_audit(self, audit_range: AuditRange, words: str) -> AuditExport:
        """A filtered range of the masked audit log, as the file the browser saves. Read-only.

        Args:
            audit_range: How far back.
            words: Only lines containing these words, ignoring case; blank keeps every line.

        Returns:
            The lines and the file name.
        """
        needle = words.strip().lower()
        lines = [line for line in ops.AUDIT_LINES if needle in line.lower()]
        count = "1 line" if len(lines) == 1 else f"{len(lines)} lines"
        return AuditExport(
            filename=f"audit-{audit_range}.txt", lines=lines, message=f"Exported {count}"
        )

    # Data export ---------------------------------------------------------------------------

    def export_data(self, scope: ExportScope, step_up: str | None) -> ExportStarted:
        """Export all data or one principal's to Exports on the working drive (spec 7.2).

        Voice samples and clips are left out (11.5.1, guardrail 2).

        Args:
            scope: Everything, or one principal.
            step_up: A proof from `verify_step_up`; always needed.

        Returns:
            What the toast says.
        """  # noqa: DOC503 StepUpRequiredError comes from self._require_step_up()
        what = EXPORT_SCOPES[scope]
        self._require_step_up(step_up, f"Exporting {what} needs your passkey.")
        return ExportStarted(
            message=(
                f"Exporting {what} to Exports on the working drive. Voice samples and clips "
                "are left out. You'll get a notice when it's ready."
            )
        )
