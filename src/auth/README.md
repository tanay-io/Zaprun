# Auth Module Structure

This folder is intentionally scaffolded for all supported auth types.

## Layout

- `services/connectionAuth.ts`:
  - Central entrypoint that routes a `Connection` to the right resolver.
- `resolvers/oauth2.ts`:
  - OAuth2-specific auth resolution and refresh handling.
- `resolvers/apiKey.ts`:
  - API key auth resolution.
- `resolvers/basic.ts`:
  - Basic auth resolution.
- `resolvers/none.ts`:
  - No-auth resolver.
- `types.ts`:
  - Shared auth result and resolver contracts.

Implementation is intentionally deferred.
