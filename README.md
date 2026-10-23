# Node API Probe

A browser-facing Node.js API starter with email/password authentication, PostgreSQL-backed sessions, a user-owned CRUD resource, and OpenAPI documentation.

## Stack

- Node.js 22 or newer
- Fastify with TypeScript
- PostgreSQL
- OpenAPI 3.0 generated from Fastify route schemas
- Swagger UI at `/docs` in development

## Run locally

Requirements: Node.js and Docker Compose.

```sh
cp .env.example .env
openssl rand -hex 32
```

Copy the generated value into `SESSION_SECRET` in `.env`, then start PostgreSQL and the API:

```sh
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

The API listens on `http://localhost:3000`. Open `http://localhost:3000/docs` for interactive documentation. Swagger UI is disabled when `NODE_ENV=production`.

For a web app on another local origin, set `WEB_ORIGIN` in `.env` to that exact origin, such as `http://localhost:5173`. Browser requests must use `credentials: 'include'`. Same-origin deployment is simpler; this starter does not support cross-site cookies.

## Routes

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Check API availability |
| `GET` | `/api/v1/auth/csrf` | Public | Get a token for a browser state-changing request |
| `POST` | `/api/v1/auth/register` | Public + CSRF token | Create an account and start a session |
| `POST` | `/api/v1/auth/login` | Public + CSRF token | Sign in and start a session |
| `POST` | `/api/v1/auth/logout` | Signed in + CSRF token | End the session |
| `GET` | `/api/v1/me` | Signed in | Get the current user |
| `GET` | `/api/v1/items` | Signed in | List the current user's items |
| `POST` | `/api/v1/items` | Signed in + CSRF token | Create an item |
| `GET` | `/api/v1/items/:id` | Signed in | Get one of the current user's items |
| `PATCH` | `/api/v1/items/:id` | Signed in + CSRF token | Update one of the current user's items |
| `DELETE` | `/api/v1/items/:id` | Signed in + CSRF token | Delete one of the current user's items |

`items` is an example resource. Replace it with the web app's real domain model when that is known.

## Browser authentication

Sessions use an opaque cookie with `HttpOnly`, `Secure` in production, and `SameSite=Lax` attributes. Session data is stored in PostgreSQL. Passwords are hashed with Argon2id; passwords must be 15–128 characters. Login and registration are rate-limited.

Get a CSRF token before registration or login, then use the token returned by those endpoints for later writes:

```js
const csrfResponse = await fetch('http://localhost:3000/api/v1/auth/csrf', {
  credentials: 'include',
});
const { csrfToken } = await csrfResponse.json();

const response = await fetch('http://localhost:3000/api/v1/auth/register', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'content-type': 'application/json',
    'x-csrf-token': csrfToken,
  },
  body: JSON.stringify({ email: 'you@example.com', password: 'a-long-passphrase' }),
});
const { user, csrfToken: nextCsrfToken } = await response.json();
```

Use `nextCsrfToken` in the `x-csrf-token` header for `POST`, `PATCH`, and `DELETE` requests. Fetch a new token after login or logout. Authenticated responses use `Cache-Control: no-store`.

## Production notes

- Set `NODE_ENV=production`, use HTTPS, and supply a strong `SESSION_SECRET` through a secret manager.
- The production session cookie is named `__Host-session` and has no `Domain` attribute.
- `WEB_ORIGIN` is an exact CORS allowlist entry. Leave it unset for same-origin deployments.
- Only set `TRUST_PROXY=true` when requests can reach the API only through a trusted reverse proxy.
- The built-in rate limiter uses in-memory state; use a shared store before running multiple API instances.
- This starter does not include email verification, password reset, or multi-factor authentication.

## Build and start

```sh
npm run build
npm start
```

## References

- [Fastify](https://fastify.dev/docs/latest/)
- [OpenAPI Specification](https://spec.openapis.org/oas/)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
