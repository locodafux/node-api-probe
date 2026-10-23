# Node API Probe

A planned starter API for a browser-based web app. The first version will focus on authentication, a small protected resource API, and interactive OpenAPI documentation.

> **Status:** planning. The API has not been implemented yet.

## Proposed stack

- Node.js on a supported LTS release
- Fastify with TypeScript
- PostgreSQL for persistent users, sessions, and resource data
- OpenAPI generated from route schemas, served through Swagger UI

## API outline

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Check that the API is running |
| `POST` | `/api/v1/auth/register` | Public | Create an account, if public sign-up is enabled |
| `POST` | `/api/v1/auth/login` | Public | Start a user session |
| `POST` | `/api/v1/auth/logout` | Signed in | End the current session |
| `GET` | `/api/v1/me` | Signed in | Return the current user |
| `GET` | `/api/v1/items` | Signed in | List the current user's items |
| `POST` | `/api/v1/items` | Signed in | Create an item for the current user |
| `GET` | `/api/v1/items/:id` | Signed in | Get one of the current user's items |
| `PATCH` | `/api/v1/items/:id` | Signed in | Update one of the current user's items |
| `DELETE` | `/api/v1/items/:id` | Signed in | Delete one of the current user's items |

`items` is a placeholder resource and can be replaced with the web app's real domain model.

## Authentication and security

- Use an opaque session ID in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, with session state stored server-side.
- Rotate the session after login and invalidate it on logout.
- Protect state-changing requests against CSRF; `SameSite` is defense in depth, not the only CSRF control.
- If passwords are stored locally, hash them with Argon2id. Rate-limit sign-in attempts.
- Check ownership and authorization for every protected resource operation.
- Validate request and response shapes. Do not return stack traces or log passwords, cookies, or session IDs.
- Serve the web app and API from the same origin when practical. If cross-origin access is needed, allow only the web app's exact origin.

## API documentation

Use Fastify's `@fastify/swagger` and `@fastify/swagger-ui` plugins. Define validation and response schemas with routes so the API behavior and OpenAPI documentation stay aligned. Keep the interactive docs available in development; restrict or disable them in production if they should not be public.

## Implementation order

1. Create the Fastify and TypeScript app, validate configuration at startup, connect PostgreSQL, and add `/health`.
2. Add account and session handling, login, logout, and `/me`.
3. Add the protected resource routes with per-user ownership checks.
4. Add OpenAPI and Swagger UI, then review the docs against the route schemas.

## References

- [Fastify ecosystem plugins](https://fastify.dev/docs/latest/Guides/Ecosystem/)
- [OpenAPI Specification](https://spec.openapis.org/oas/)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
