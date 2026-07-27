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
      "/docs/:path*",
      "/ping/:path*",
      /*
       * Unauthenticated so the page itself can handle a signed-out visitor:
       * it needs to build the `?next=` that carries the invite token through
       * sign-in, which a middleware bounce would drop.
       */
      "/invite",
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
    "/docs/:path*",
    "/ping/:path*",
    // withAuth() throws unless the middleware ran for the path, so any page
    // calling getSessionUser() must be matched — signed-out ones included.
    "/invite",
    "/app/:path*",
    "/new",
    "/device",
  ],
};
