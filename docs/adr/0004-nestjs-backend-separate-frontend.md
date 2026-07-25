# NestJS backend, separate from the frontend

This project's primary purpose is building genuine backend credibility and depth (the user's stated main goal), on top of the AI-driven/spec-driven workflow and data model already decided (ADR 0002). We're using a standalone NestJS backend (controllers/services/modules/dependency injection) rather than folding backend logic into Next.js API routes, with the frontend as a separate app calling it.

A single full-stack framework (e.g. Next.js API routes) was the simpler default, and is the better call when minimizing moving parts is the priority — as it was for auth (ADR 0003). Here it isn't: Next.js API routes don't force any structure on backend code, so they don't teach the thing being optimized for. NestJS's imposed shape (controller / service / module / DI) is a deliberate, resume-legible pattern shared with backends like Spring, which is exactly the credibility being sought.

## Considered Options

- **Next.js API routes, one codebase (rejected)**: simplest to build and deploy, but structure is optional — nothing about it demonstrates or teaches backend architecture beyond "handle this request."
- **NestJS backend + separate frontend (chosen)**: two codebases, two deployments, and cross-origin requests (CORS) between them; Clerk auth has to be verified on both sides instead of one. Real added operational complexity, accepted deliberately because that complexity — wiring a frontend to an independent backend service — is itself part of the backend learning being pursued, not incidental cost.

## Consequences

- Requires CORS configuration and passing Clerk's auth token from frontend to backend on every request, rather than Clerk handling it in one place.
- Two separate deployments to manage instead of one.
