import Link from "next/link";
import { Wordmark } from "@/components/Wordmark/Wordmark";
import { PosterGrid } from "@/components/PosterGrid/PosterGrid";
import styles from "./Hero.module.css";

/**
 * Signed-out landing (docs/design.md → "Entry, auth, empty, and error
 * surfaces"): a one-screen hero, not a multi-section marketing page. The
 * poster grid beneath is the same placeholder `PosterGrid` used on Home —
 * it's already just seeded tiles, which is exactly the "mock poster grid"
 * the design calls for.
 */
export function Hero() {
  return (
    <section className={styles.hero}>
      <Wordmark className={styles.wordmark} />
      <p className={styles.tagline}>Log what you watch. Outwatch your friends.</p>
      <div className={styles.actions}>
        <Link href="/sign-in" className={`${styles.button} ${styles.signIn}`}>
          Sign in
        </Link>
        <Link href="/sign-up" className={`${styles.button} ${styles.signUp}`}>
          Sign up
        </Link>
      </div>
      <div className={styles.posters}>
        <PosterGrid count={12} />
      </div>
    </section>
  );
}
