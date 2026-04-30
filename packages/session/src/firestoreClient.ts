import { Firestore } from '@google-cloud/firestore';
import { env } from '@reaatech/agent-mesh';

let _firestore: Firestore | null = null;

export function getFirestore(): Firestore {
  if (!_firestore) {
    _firestore = new Firestore({
      projectId: env.GOOGLE_CLOUD_PROJECT,
      databaseId: env.FIRESTORE_DATABASE,
    });
  }
  return _firestore;
}

export function resetFirestore(): void {
  _firestore = null;
}
