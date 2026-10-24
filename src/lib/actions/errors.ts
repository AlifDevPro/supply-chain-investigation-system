export class AuthorizationDeniedError extends Error {
  readonly code = "authorization_denied" as const;
  constructor(message = "This role cannot perform that action.") {
    super(message);
    this.name = "AuthorizationDeniedError";
  }
}

export class StaleApprovalError extends Error {
  constructor(message = "The proposed action has changed. Approve the current version.") {
    super(message);
    this.name = "StaleApprovalError";
  }
}

export class ActionNotFoundError extends Error {
  constructor(id: string) {
    super(`Action ${id} was not found.`);
    this.name = "ActionNotFoundError";
  }
}
