export type ReviewActionState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

export const REVIEW_IDLE: ReviewActionState = { status: "idle" };
