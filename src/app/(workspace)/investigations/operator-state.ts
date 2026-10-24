/** Serializable result of an operator action. Safe to render: written by the server, never copied from errors. */
export type OperatorState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; outcome: "created" | "updated" | "held" | "skipped" | "failed"; caseId: string | null; message: string };

export const OPERATOR_IDLE: OperatorState = { status: "idle" };
