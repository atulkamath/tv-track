import { SignIn } from "@clerk/nextjs";
import { Wordmark } from "@/components/Wordmark/Wordmark";
import styles from "./page.module.css";

/**
 * Clerk's prebuilt `<SignIn/>` (docs/design.md — "no custom auth forms").
 * Themed globally via `clerkAppearance` on `<ClerkProvider>` (root layout);
 * `fallbackRedirectUrl` sends a successful sign-in into the app, where the
 * first authenticated call lazily creates the user (#2).
 */
export default function SignInPage() {
  return (
    <main className={styles.screen}>
      <Wordmark className={styles.wordmark} />
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
    </main>
  );
}
