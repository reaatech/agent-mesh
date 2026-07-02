# @reaatech/agent-mesh-redis

Redis-backed `SessionStore` and `BreakerStore` adapters for
[agent-mesh](https://github.com/reaatech/agent-mesh) — a drop-in alternative to
the default Firestore backend.

```bash
pnpm add @reaatech/agent-mesh-redis ioredis
```

## Usage

```ts
import Redis from 'ioredis';
import { RedisSessionStore, RedisBreakerStore } from '@reaatech/agent-mesh-redis';
import { setSessionStore } from '@reaatech/agent-mesh-session';
import { setBreakerStore } from '@reaatech/agent-mesh-utils';

const redis = new Redis(process.env.REDIS_URL);

setSessionStore(new RedisSessionStore(redis));   // { keyPrefix? } — default 'am:'
setBreakerStore(new RedisBreakerStore(redis));
```

- **Sessions** are stored as JSON at `am:session:<id>` with a millisecond TTL; an
  `am:user:<userId>:active` pointer backs `getActiveByUser`.
- **Circuit breakers** are stored at `am:breaker:<agentId>`; leader election uses a
  single `SET NX PX` lease at `am:leader` (a new instance can take over only after
  the lease expires).

`ioredis` is a peer dependency (bring your own client/pool).

> **Note:** unit-tested against an in-memory fake. Run a smoke test against a live
> Redis (esp. multi-instance leader election) before production use.
