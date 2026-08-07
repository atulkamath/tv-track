import { Show } from "@clerk/nextjs";
import { Hero } from "@/components/Hero/Hero";
import { Home } from "@/components/Home/Home";

/**
 * Signed-out visitors get the one-screen hero (docs/design.md); a signed-in
 * visit goes straight to Home and never back to the hero. `<Show/>` renders
 * nothing while Clerk is still resolving the session, so there's no flash of
 * the wrong surface either way.
 */
export default function Page() {
  return (
    <Show when="signed-in" fallback={<Hero />}>
      <Home />
    </Show>
  );
}
