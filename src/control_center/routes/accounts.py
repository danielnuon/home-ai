"""Accounts, security and money: Connections, Voice, Security actions, data export and impact."""

from typing import Annotated

from fastapi import APIRouter, Query

from control_center.contract.accounts import (
    AuditExport,
    AuditExportRequest,
    ConnectionResult,
    ExportRequest,
    ExportStarted,
    NewPasskey,
    NewVoiceProfile,
    Passkey,
    RecoveryCodes,
    SecretEntry,
    SecurityResult,
    SettingImpact,
    SettingOutcomes,
    TotpReset,
    VoicePreview,
    VoiceProfile,
    Workspace,
)
from control_center.routes import BackendsDep, StepUp

router = APIRouter()


@router.post("/connections/{connection_id}/connect")
def connect(connection_id: str, backends: BackendsDep, step_up: StepUp = None) -> ConnectionResult:
    """Connect an account or platform link. Needs a step-up."""
    return backends.gate.connect(connection_id, step_up)


@router.post("/connections/{connection_id}/disconnect")
def disconnect(connection_id: str, backends: BackendsDep) -> ConnectionResult:
    """Disconnect at once."""
    return backends.gate.disconnect(connection_id)


@router.put("/connections/{connection_id}/secret")
def set_secret(
    connection_id: str, body: SecretEntry, backends: BackendsDep, step_up: StepUp = None
) -> ConnectionResult:
    """Enter or rotate a secret. Needs a step-up; the secret is never sent back."""
    return backends.gate.set_secret(connection_id, body.value, step_up)


@router.post("/connections/{connection_id}/secret/remove")
def remove_secret(connection_id: str, backends: BackendsDep) -> ConnectionResult:
    """Remove a stored secret at once."""
    return backends.gate.remove_secret(connection_id)


@router.post("/connections/{connection_id}/permission")
def ask_permission(connection_id: str, backends: BackendsDep) -> ConnectionResult:
    """Show a macOS permission prompt again."""
    return backends.gate.ask_permission(connection_id)


@router.post("/connections/{connection_id}/test")
def test_connection(connection_id: str, backends: BackendsDep) -> ConnectionResult:
    """Check that a connection answers."""
    return backends.gate.test_connection(connection_id)


@router.post("/voice/profiles")
def add_voice_profile(
    body: NewVoiceProfile, backends: BackendsDep, step_up: StepUp = None
) -> VoiceProfile:
    """Add a stock voice, or a clone behind a step-up."""
    return backends.gate.add_voice_profile(body, step_up)


@router.post("/voice/profiles/{profile_id}/render")
def render_voice_profile(profile_id: str, backends: BackendsDep) -> VoiceProfile:
    """Render a profile's clips again."""
    return backends.gate.render_voice_profile(profile_id)


@router.post("/voice/profiles/{profile_id}/preview")
def preview_voice_profile(profile_id: str, backends: BackendsDep) -> VoicePreview:
    """Play a profile's clips in Brain."""
    return backends.gate.preview_voice_profile(profile_id)


@router.post("/voice/profiles/{profile_id}/delete", status_code=204)
def delete_voice_profile(profile_id: str, backends: BackendsDep) -> None:
    """Delete a profile with its sample, clips and Twilio assets."""
    backends.gate.delete_voice_profile(profile_id)


@router.post("/security/workspaces/{workspace_id}/stop")
def stop_workspace(workspace_id: str, backends: BackendsDep) -> Workspace:
    """Stop one workspace at once."""
    return backends.gate.stop_workspace(workspace_id)


@router.post("/security/workspaces/{workspace_id}/resume")
def resume_workspace(workspace_id: str, backends: BackendsDep, step_up: StepUp = None) -> Workspace:
    """Resume a stopped workspace. Needs a step-up."""
    return backends.gate.resume_workspace(workspace_id, step_up)


@router.post("/security/devices/{device_id}/sign-out")
def sign_out_device(device_id: str, backends: BackendsDep) -> SecurityResult:
    """End a device's session at once."""
    return backends.gate.sign_out_device(device_id)


@router.post("/security/passkeys")
def add_passkey(body: NewPasskey, backends: BackendsDep, step_up: StepUp = None) -> Passkey:
    """Register a passkey. Needs a step-up."""
    return backends.gate.add_passkey(body.name, step_up)


@router.post("/security/passkeys/{passkey_id}/remove")
def remove_passkey(
    passkey_id: str, backends: BackendsDep, step_up: StepUp = None
) -> SecurityResult:
    """Remove a passkey. Needs a step-up."""
    return backends.gate.remove_passkey(passkey_id, step_up)


@router.post("/security/totp/reset")
def reset_totp(backends: BackendsDep, step_up: StepUp = None) -> TotpReset:
    """Replace the Discord authenticator secret. Needs a step-up."""
    return backends.gate.reset_totp(step_up)


@router.post("/security/recovery-codes")
def regenerate_recovery_codes(backends: BackendsDep, step_up: StepUp = None) -> RecoveryCodes:
    """Issue new recovery codes. Needs a step-up."""
    return backends.gate.regenerate_recovery_codes(step_up)


@router.post("/security/audit/export")
def export_audit(body: AuditExportRequest, backends: BackendsDep) -> AuditExport:
    """A filtered range of the masked audit log."""
    return backends.gate.export_audit(body.range, body.filter)


@router.post("/exports")
def export_data(
    body: ExportRequest, backends: BackendsDep, step_up: StepUp = None
) -> ExportStarted:
    """Export all data or one principal's. Needs a step-up."""
    return backends.gate.export_data(body.scope, step_up)


@router.get("/settings/{key}/impact")
def setting_impact(
    key: str, backends: BackendsDep, value: Annotated[str, Query(max_length=200)]
) -> SettingImpact:
    """The impact card for a proposed setting change."""
    return backends.engine.setting_impact(key, value)


@router.get("/settings/{key}/outcomes")
def setting_outcomes(key: str, backends: BackendsDep) -> SettingOutcomes:
    """Predicted versus actual for a setting's latest change."""
    return backends.engine.setting_outcomes(key)
