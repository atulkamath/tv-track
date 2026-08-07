import Link from "next/link";
import { Wordmark } from "@/components/Wordmark/Wordmark";
import { PlaceholderGrid } from "@/components/PosterGrid/PlaceholderGrid";
import styles from "./Hero.module.css";

/**
 * Signed-out landing (docs/design.md → "Entry, auth, empty, and error
 * surfaces"): a one-screen hero, not a multi-section marketing page. The
 * poster grid beneath is `PlaceholderGrid` — seeded empty tiles, no fetch —
 * since there's no signed-in caller yet to fetch real shows for.
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
        <PlaceholderGrid count={12} />
      </div>
    </section>
  );
}
