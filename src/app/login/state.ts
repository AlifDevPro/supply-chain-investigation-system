export type LoginState = { status: "idle" } | { status: "error"; message: string };

export const LOGIN_IDLE: LoginState = { status: "idle" };
