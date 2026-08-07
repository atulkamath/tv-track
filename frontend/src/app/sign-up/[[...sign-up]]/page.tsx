import { SignUp } from "@clerk/nextjs";
import { Wordmark } from "@/components/Wordmark/Wordmark";
import styles from "./page.module.css";

/**
 * Clerk's prebuilt `<SignUp/>` (docs/design.md — "no custom auth forms").
 * Themed globally via `clerkAppearance` on `<ClerkProvider>` (root layout);
 * `fallbackRedirectUrl` sends a successful sign-up into the app, where the
 * first authenticated call lazily creates the user (#2).
 */
export default function SignUpPage() {
  return (
    <main className={styles.screen}>
      <Wordmark className={styles.wordmark} />
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/" />
    </main>
  );
}
