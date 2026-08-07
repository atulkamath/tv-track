import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Required for `<ClerkProvider>`/`useAuth`/`<Show>` to resolve session state
 * on every request (App Router). No routes are force-protected here: `/`
 * renders the hero or Home itself via `<Show when="signed-in">` (see
 * `app/page.tsx`), so there's nothing left to gate.
 *
 * Named `proxy.ts`, not `middleware.ts`: Next 16 renamed the file convention
 * (the old name is deprecated — see node_modules/next/dist/docs/.../proxy.md).
 * `clerkMiddleware()`'s return value is the same request-handler shape either
 * way, so only the file name and export changed, not the behavior.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
