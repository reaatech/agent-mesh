export { circuitBreaker } from './circuitBreaker.js';
export {
  isLeader,
  getLeaderId,
  persistCircuitBreakerState,
  loadCircuitBreakerState,
  loadAllCircuitBreakerStates,
  restoreCircuitBreakerStates,
  startCircuitBreakerPersistence,
  stopCircuitBreakerPersistence,
  updateCircuitBreakerState,
  getLocalCircuitBreakerState,
  setLocalCircuitBreakerState,
  clearLocalState,
  resetLeaderState,
} from './circuitBreaker.persistence.js';
