import { SignUp } from "@clerk/nextjs";
import { Wordmark } from "@/components/Wordmark/Wordmark";

/**
 * Clerk's prebuilt `<SignUp/>` — no custom auth forms. Themed globally via
 * `clerkAppearance` on `<ClerkProvider>` (root layout); `fallbackRedirectUrl`
 * sends a successful sign-up into the app, where the first authenticated
 * call lazily creates the user (#2).
 */
export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-4 py-6">
      <Wordmark className="text-[22px]" />
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/" />
    </main>
  );
}
