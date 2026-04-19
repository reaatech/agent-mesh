/**
 * Firestore singleton client for session storage
 * Lazy initialization with configurable database ID
 */

import { Firestore } from '@google-cloud/firestore';
import { env } from '../config/env.js';

/**
 * Firestore client singleton
 * Lazy initialized on first access
 */
let _firestore: Firestore | null = null;

/**
 * Get the Firestore client instance
 * Creates the instance on first call
 */
export function getFirestore(): Firestore {
  if (!_firestore) {
    _firestore = new Firestore({
      projectId: env.GOOGLE_CLOUD_PROJECT,
      databaseId: env.FIRESTORE_DATABASE,
    });
  }
  return _firestore;
}

/**
 * Reset the Firestore client (for testing)
 */
export function resetFirestore(): void {
  _firestore = null;
}
