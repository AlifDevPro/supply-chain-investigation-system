export type ActionActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

export const ACTION_IDLE: ActionActionState = { status: "idle" };
