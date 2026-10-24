export const ROLES = ["reviewer", "procurement", "manager"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  reviewer: "Reviewer",
  procurement: "Procurement",
  manager: "Manager",
};

/** Every signed-in role may record a review decision. */
export function canReview(role: Role): boolean {
  return ROLES.includes(role);
}

/**
 * Whether `role` may approve an action that requires `required`.
 * reviewer ⊂ procurement ⊂ manager.
 */
export function canApprove(role: Role, required: Role): boolean {
  if (role === "manager") return true;
  if (role === "procurement") return required === "procurement" || required === "reviewer";
  return required === "reviewer";
}

/** Only a manager may record `outcome.verified`. */
export function canVerifyOutcome(role: Role): boolean {
  return role === "manager";
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
