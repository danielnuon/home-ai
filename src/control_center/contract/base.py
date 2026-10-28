"""The base class for every contract model."""

from pydantic import BaseModel, ConfigDict


class ContractModel(BaseModel):
    """A Pydantic model whose fields with defaults are still required in responses.

    Without this, OpenAPI marks every defaulted field optional, and the generated TypeScript type
    says `tier?: ...` for a field the server always sends. Requests still accept the field missing.
    """

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
