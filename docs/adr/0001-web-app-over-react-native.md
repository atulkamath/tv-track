# Web app instead of React Native

tv-track is a portfolio project aimed at product/design-engineer roles and at practicing backend and spec-driven, agentic development — not at demonstrating native mobile skills. We're building it as a responsive, PWA-installable web app rather than React Native. A native mobile UI was the more exciting build for a frontend engineer, but the roles being targeted evaluate web interaction craft, and App Store release friction (builds, signing, review) would tax the time meant to go toward backend depth and tightening the spec-driven build loop, without reinforcing either.

## Considered Options

- **React Native**: rejected. Adds a third stack to learn, and native release friction directly fights the fast iteration loop the project exists to practice.
- **Web app (chosen)**: all effort goes toward backend/spec-driven practice; modern web interaction techniques (animation, gestures, view transitions) can still deliver a native-feeling UI.

## Consequences

- Mobile-native isn't ruled out permanently — if the product proves itself, it can be wrapped later (e.g. via Expo) reusing the same backend, once the harder parts (backend, design system, agentic workflow) are already proven.
