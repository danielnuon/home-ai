/**
 * @file The refusals a mock backend raises, with the HTTP status and code the server answers with
 * (`backends/errors.py` and `ERROR_STATUS` in `app.py`).
 */

/** A refusal carrying the reason the Owner reads. */
export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly reason: string,
  ) {
    super(reason);
  }
}

/** The object does not exist, or no longer does. */
export const notFound = (reason: string) => new MockError(404, "not_found", reason);

/** A loosening action came without a valid passkey proof. */
export const stepUpRequired = (reason: string) => new MockError(403, "step_up_required", reason);

/** The object is not in a state that allows the action. */
export const conflict = (reason: string) => new MockError(409, "conflict", reason);

/** The action is beyond a hard limit. */
export const refused = (reason: string) => new MockError(422, "refused", reason);
