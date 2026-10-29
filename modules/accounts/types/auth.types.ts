/** Who the access panel serves; it is the only source of the post-auth destination. */
export type AccessAudience = "staff" | "runner";

/** Closed set of post-auth destinations. Never read from the URL. */
export type AuthDestination = "/crm" | "/cuenta";

/** Closed set of post-sign-out destinations. Never read from the URL. */
export type SignOutDestination = "/crm/acceso" | "/cuenta";
