# libs/shared-types

Type definitions shared between TypeScript clients (web, admin) and the
generated GraphQL schema.

Most types are auto-generated from `libs/proto/` via `buf generate` and a
`@graphql-codegen` step that consumes the gateway's federated schema. Hand-
written types (eg UI-only types like `HomeRowSpec`) live under `src/`.

See `package.json` for the codegen scripts.
