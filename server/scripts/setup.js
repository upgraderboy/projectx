import { connect, dbClient } from '../db.js';
import { config } from '../config.js';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureCollection(database, name) {
  const exists = await database.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) {
    await database.createCollection(name);
    console.log(`Created collection: ${name}`);
  } else console.log(`Collection exists: ${name}`);
}

export async function ensureVectorIndex(collection, waitQueryable = true) {
  let indexes = await collection.listSearchIndexes().toArray();
  let index = indexes.find(({ name }) => name === 'memory_vector');
  if (!index) {
    console.log(`Creating Atlas Vector Search index (dimensions: ${config.embeddingDims})...`);
    await collection.createSearchIndex({
      name: 'memory_vector',
      type: 'vectorSearch',
      definition: { fields: [
        { type: 'vector', path: 'embedding', numDimensions: config.embeddingDims, similarity: 'cosine' },
        { type: 'filter', path: 'userId' },
        { type: 'filter', path: 'projectId' },
        { type: 'filter', path: 'status' },
        { type: 'filter', path: 'type' }
      ] }
    });
  } else console.log('Vector index exists: memory_vector');

  if (!waitQueryable) return;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    indexes = await collection.listSearchIndexes().toArray();
    index = indexes.find(({ name }) => name === 'memory_vector');
    const status = index?.status ?? 'not found';
    const queryable = index?.queryable === true || status === 'READY';
    console.log(`Vector index status: ${status}${index?.queryable === undefined ? '' : `; queryable: ${index.queryable}`}`);
    if (queryable) return;
    await pause(5000);
  }
  throw new Error('Timed out waiting for Atlas Vector Search index "memory_vector" to become queryable.');
}

export async function ensureDatabaseSetup(database, waitQueryable = false) {
  for (const name of ['users', 'projects', 'memberships', 'invites', 'memories', 'messages', 'memory_events']) await ensureCollection(database, name);

  await database.collection('users').createIndex({ email: 1 }, { unique: true, name: 'users_email_unique' });
  console.log('Unique users email index is ready.');

  const membershipCollection = database.collection('memberships');
  await membershipCollection.createIndex({ projectId: 1, userId: 1 }, { unique: true, name: 'memberships_project_user_unique' });
  await membershipCollection.createIndex({ userId: 1 }, { name: 'memberships_user' });
  const inviteCollection = database.collection('invites');
  await inviteCollection.createIndex({ tokenHash: 1 }, { unique: true, name: 'invites_tokenHash_unique' });
  await inviteCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'invites_expiresAt_ttl' });
  console.log('Membership and invite indexes are ready.');

  const memoryCollection = database.collection('memories');
  await memoryCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'memories_expiresAt_ttl' });
  await memoryCollection.createIndex({ userId: 1, projectId: 1, status: 1, createdAt: -1 }, { name: 'memories_owner_status_createdAt' });
  await database.collection('messages').createIndex({ sessionId: 1, createdAt: 1 }, { name: 'messages_session_createdAt' });
  console.log('TTL and normal indexes are ready.');

  await ensureVectorIndex(memoryCollection, waitQueryable);
  console.log('Setup complete: memory_vector index configured.');
}

if (process.argv[1]?.endsWith('setup.js')) {
  try {
    const database = await connect();
    await ensureDatabaseSetup(database, true);
  } catch (error) {
    console.error(`Setup failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await dbClient.close().catch(() => {});
  }
}
