"""Personal records, finance sources and uploads, and Setup's secret form and interview."""

from fastapi import APIRouter

from control_center.contract.common import Principal
from control_center.contract.personal import Case, DomainDetail, SetupStep, StatementImport
from control_center.contract.records import (
    AccountMapping,
    CaseCreate,
    CaseNoteCreate,
    CaseReassign,
    CategoryFix,
    CategoryFixed,
    ChecklistChange,
    ChecklistItem,
    DocumentUpload,
    DomainRecord,
    FigureSources,
    FinanceRequest,
    InterviewAnswer,
    Obligation,
    ObligationCreate,
    RecordCreate,
    RecordEdit,
    Rule,
    RuleEdit,
    SecretEntry,
    StatementUpload,
    WorkRequested,
)
from control_center.contract.shell import TrashItem
from control_center.routes import BackendsDep, StepUp

router = APIRouter()


@router.post("/cases")
def create_case(body: CaseCreate, backends: BackendsDep) -> Case:
    """Add a case."""
    return backends.engine.create_case(body)


@router.post("/cases/{case_id}/reassign")
def reassign_case(case_id: str, body: CaseReassign, backends: BackendsDep) -> Case:
    """Hand a case to someone else."""
    return backends.engine.reassign_case(case_id, body.employee_name)


@router.post("/cases/{case_id}/notes")
def add_case_note(case_id: str, body: CaseNoteCreate, backends: BackendsDep) -> Case:
    """Add a note to a case."""
    return backends.engine.add_case_note(case_id, body.text)


@router.post("/obligations")
def create_obligation(body: ObligationCreate, backends: BackendsDep) -> Obligation:
    """Add a date obligation."""
    return backends.engine.create_obligation(body)


@router.put("/checklist/{item_id}")
def set_checklist(item_id: str, body: ChecklistChange, backends: BackendsDep) -> ChecklistItem:
    """Tick or untick an onboarding checklist step."""
    return backends.engine.set_checklist(item_id, body.done)


@router.get("/domains/{domain_id}")
def domain_detail(domain_id: str, backends: BackendsDep) -> DomainDetail:
    """One domain's records and documents."""
    return backends.engine.domain_detail(domain_id)


@router.post("/domains/{domain_id}/records")
def add_record(domain_id: str, body: RecordCreate, backends: BackendsDep) -> DomainRecord:
    """Add a register entry."""
    return backends.engine.add_record(domain_id, body)


@router.post("/domains/{domain_id}/documents")
def upload_document(domain_id: str, body: DocumentUpload, backends: BackendsDep) -> DomainRecord:
    """File a document."""
    return backends.engine.upload_document(domain_id, body)


@router.put("/records/{record_id}")
def edit_record(record_id: str, body: RecordEdit, backends: BackendsDep) -> DomainRecord:
    """Change a record or document."""
    return backends.engine.edit_record(record_id, body)


@router.delete("/records/{record_id}")
def delete_record(record_id: str, backends: BackendsDep) -> TrashItem:
    """Move a record or document to the trash."""
    return backends.engine.delete_record(record_id)


@router.put("/rules/{rule_id}")
def edit_rule(rule_id: str, body: RuleEdit, backends: BackendsDep) -> Rule:
    """Change a rule."""
    return backends.engine.edit_rule(rule_id, body)


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, backends: BackendsDep) -> TrashItem:
    """Move a rule to the trash."""
    return backends.engine.delete_rule(rule_id)


@router.get("/finance/{principal}/sources/{figure_id}")
def figure_sources(principal: Principal, figure_id: str, backends: BackendsDep) -> FigureSources:
    """The rows behind one figure."""
    return backends.engine.figure_sources(principal, figure_id)


@router.post("/finance/{principal}/transactions/{transaction_id}/category")
def fix_category(
    principal: Principal, transaction_id: str, body: CategoryFix, backends: BackendsDep
) -> CategoryFixed:
    """Fix a transaction's category; it adds a rule."""
    return backends.engine.fix_category(principal, transaction_id, body.category)


@router.post("/finance/{principal}/imports/{import_id}/upload")
def upload_statement(
    principal: Principal, import_id: str, body: StatementUpload, backends: BackendsDep
) -> StatementImport:
    """Import a statement export."""
    return backends.engine.upload_statement(principal, import_id, body)


@router.post("/finance/accounts/{account_id}/map")
def map_account(account_id: str, body: AccountMapping, backends: BackendsDep) -> StatementImport:
    """Give a found account to a principal."""
    return backends.engine.map_account(account_id, body)


@router.post("/finance/{principal}/requests")
def finance_request(
    principal: Principal, body: FinanceRequest, backends: BackendsDep
) -> WorkRequested:
    """Ask for an import check or the monthly close."""
    return backends.engine.finance_request(principal, body)


@router.post("/setup/{step_id}/secrets/{field_id}")
def save_secret(
    step_id: str, field_id: str, body: SecretEntry, backends: BackendsDep, step_up: StepUp = None
) -> SetupStep:
    """Save a secret from the secret form. Needs a step-up."""
    return backends.gate.save_setup_secret(step_id, field_id, body.value, step_up)


@router.post("/setup/{step_id}/interview/answer")
def interview_answer(step_id: str, body: InterviewAnswer, backends: BackendsDep) -> SetupStep:
    """Answer Atlas's current question."""
    return backends.engine.interview_answer(step_id, body.text)


@router.post("/setup/{step_id}/interview/confirm")
def interview_confirm(step_id: str, backends: BackendsDep) -> SetupStep:
    """Save what the interview found."""
    return backends.engine.interview_confirm(step_id)


@router.post("/setup/{step_id}/interview/restart")
def interview_restart(step_id: str, backends: BackendsDep) -> SetupStep:
    """Start the interview over."""
    return backends.engine.interview_restart(step_id)
