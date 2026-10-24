export type SignupState = { status: "idle" } | { status: "error"; message: string };

export const SIGNUP_IDLE: SignupState = { status: "idle" };
