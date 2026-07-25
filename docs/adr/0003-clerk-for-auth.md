# Clerk for auth instead of hand-rolled sessions

This project exists to showcase AI-driven, spec-driven development and backend depth, targeting product/design-engineer roles. We're using Clerk for authentication instead of building our own `users`/`sessions` schema and password hashing. A hand-rolled auth flow was the more obvious "backend practice" choice, but auth is a well-worn recipe with near-zero differentiation for the roles being targeted — the NLP-driven entry flow and TMDB-backed data model (see ADR 0002) are the parts worth spending build time and portfolio attention on.

## Considered Options

- **Hand-rolled auth** (own `users`/`sessions` tables, a trusted library only for password hashing): rejected. Real backend practice, but it's the same shape every tutorial project has — it doesn't demonstrate anything distinctive, and the time is better spent on the AI-powered features that are actually novel for this project.
- **Clerk (chosen)**: near-zero auth code to write; time saved goes toward the NLP parsing, disambiguation, and TMDB sync pipeline instead.

## Consequences

- Introduces a vendor dependency for auth (lock-in if Clerk needs to be swapped later).
- Backend learning for this project comes from the data model, sync jobs, and NLP pipeline, not from auth.
