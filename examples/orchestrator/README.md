# agent-mesh orchestrator

Reference deployment example for the agent-mesh monorepo.

## Usage

```bash
npm run build && node dist/index.js
```

## Extending

agent-mesh's provider seams let you swap backends and models without forking. Wire
these **before** starting the server (e.g. at the top of `main()`).

### Bring your own classifier (instead of Gemini)

```ts
import { setClassifier } from './wherever-you-hold-it'; // see @reaatech/agent-mesh-classifier
import { classifierService, createClassifier, type ClassifierProvider } from '@reaatech/agent-mesh-classifier';

const myClassifier: ClassifierProvider = {
  classify: async (userInput, registry) => {
    // call your own model; return a ClassifierOutput
  },
};
const classifier = createClassifier(myClassifier); // default (no arg) = Gemini + mock fallback
```

### Swap the session + breaker persistence (Postgres/Redis instead of Firestore)

```ts
import { Pool } from 'pg';
import { PostgresSessionStore, PostgresBreakerStore, ensureSchema } from '@reaatech/agent-mesh-postgres';
import { setSessionStore } from '@reaatech/agent-mesh-session';
import { setBreakerStore } from '@reaatech/agent-mesh-utils';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await ensureSchema(pool);
setSessionStore(new PostgresSessionStore(pool));
setBreakerStore(new PostgresBreakerStore(pool));

// …or the in-memory adapters for local/dev:
//   import { InMemorySessionStore } from '@reaatech/agent-mesh-session';
//   setSessionStore(new InMemorySessionStore());
```

### Register an in-process agent (no HTTP hop)

Give the agent `type: 'inprocess'` in its YAML (no `endpoint` needed), then register
a handler:

```ts
import { registerInProcessAgent } from '@reaatech/agent-mesh-router';

registerInProcessAgent('local-agent', async (ctx) => {
  // ctx.metadata carries host context (e.g. a tenant orgId)
  return { content: `handled: ${ctx.raw_input}`, workflow_complete: true };
});
```

## License

MIT
