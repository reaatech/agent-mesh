# @reaatech/agent-mesh-postgres

Postgres-backed `SessionStore` and `BreakerStore` adapters for
[agent-mesh](https://github.com/reaatech/agent-mesh) — a drop-in alternative to
the default Firestore backend.

```bash
pnpm add @reaatech/agent-mesh-postgres pg
```

## Usage

```ts
import { Pool } from 'pg';
import {
  PostgresSessionStore,
  PostgresBreakerStore,
  ensureSchema,
} from '@reaatech/agent-mesh-postgres';
import { setSessionStore } from '@reaatech/agent-mesh-session';
import { setBreakerStore } from '@reaatech/agent-mesh-utils';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await ensureSchema(pool); // idempotent DDL — run once on boot (or use SCHEMA_SQL in a migration)

setSessionStore(new PostgresSessionStore(pool));
setBreakerStore(new PostgresBreakerStore(pool));
```

Tables (created by `ensureSchema` / `SCHEMA_SQL`): `agent_mesh_sessions`,
`agent_mesh_circuit_breakers`, and `agent_mesh_leader` (a single-row lease used for
leader election via `SELECT … FOR UPDATE`). `pg` is a peer dependency.

> **Note:** unit-tested against a mock pool (SQL issuance + row mapping). Run a smoke
> test against a live Postgres (jsonb, `FOR UPDATE`, timestamptz, multi-instance
> leader election) before production use.
