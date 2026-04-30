import { logger } from '@reaatech/agent-mesh-observability';
import { reloadRegistry } from './registry.loader.js';

const DEFAULT_DEBOUNCE_MS = 5000;

let pendingReload = false;
let reloadScheduled = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let sighupHandler: ((...args: unknown[]) => void) | null = null;

export function setupSighupHandler(debounceMs: number = DEFAULT_DEBOUNCE_MS): void {
  const handleSighup = async (): Promise<void> => {
    pendingReload = true;

    if (reloadScheduled) {
      logger.info('SIGHUP reload already scheduled, coalescing');
      return;
    }

    reloadScheduled = true;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      if (!pendingReload) {
        reloadScheduled = false;
        return;
      }

      pendingReload = false;
      reloadScheduled = false;

      logger.info('SIGHUP reloading agent registry');
      const result = await reloadRegistry();

      if (result.success) {
        logger.info('SIGHUP registry reloaded', { agentCount: result.agentCount });
      } else {
        logger.error('SIGHUP registry reload failed', { errors: result.errors });
      }

      debounceTimer = null;
    }, debounceMs);
  };

  sighupHandler = handleSighup;
  process.on('SIGHUP', handleSighup);

  logger.info('SIGHUP handler registered', { debounceMs });
}

export async function triggerReload(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  pendingReload = false;
  reloadScheduled = false;

  logger.info('Triggering immediate registry reload');
  const result = await reloadRegistry();

  if (result.success) {
    logger.info('Immediate registry reload succeeded', { agentCount: result.agentCount });
  } else {
    logger.error('Immediate registry reload failed', { errors: result.errors });
  }
}

export function isReloadPending(): boolean {
  return pendingReload;
}

export function cleanupSighupHandler(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (sighupHandler) {
    process.off('SIGHUP', sighupHandler);
    sighupHandler = null;
  }
  pendingReload = false;
  reloadScheduled = false;
}
