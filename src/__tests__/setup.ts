// Setup fake-indexeddb for all tests
import 'fake-indexeddb/auto';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

// Make them globally available
global.indexedDB = indexedDB;
global.IDBKeyRange = IDBKeyRange;
