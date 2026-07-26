import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

/**
 * AuthKit session refresh + gating. `/api/v1/*` is excluded from the matcher
 * entirely — it authenticates with Atlas service keys (Authorization header),
 * never the session cookie.
 */
export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/sign-in",
      "/sign-up",
      "/auth/:path*",
      "/api/trpc/:path*",
    ],
  },
});

export const config = {
  matcher: [
    "/",
    "/sign-in",
    "/sign-up",
    "/auth/:path*",
    "/api/trpc/:path*",
    "/app/:path*",
    "/new",
    "/device",
  ],
};
