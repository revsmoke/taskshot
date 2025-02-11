import { CONFIG } from './config.js';

class DBService {
    constructor() {
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

            request.onerror = () => {
                reject(new Error('Failed to open database'));
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(CONFIG.TASK_STORE_NAME)) {
                    const store = db.createObjectStore(CONFIG.TASK_STORE_NAME, {
                        keyPath: 'uuid'
                    });
                    
                    // Create indexes for querying
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('task', 'task', { unique: false });
                }
            };
        });
    }

    async addTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.TASK_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.TASK_STORE_NAME);

            const request = store.add(task);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getTasks(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.TASK_STORE_NAME], 'readonly');
            const store = transaction.objectStore(CONFIG.TASK_STORE_NAME);
            const index = store.index('timestamp');

            const range = IDBKeyRange.bound(
                startDate.toISOString(),
                endDate.toISOString()
            );

            const request = index.getAll(range);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getRecentTasks(limit = 10) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.TASK_STORE_NAME], 'readonly');
            const store = transaction.objectStore(CONFIG.TASK_STORE_NAME);
            const index = store.index('timestamp');

            const request = index.openCursor(null, 'prev');
            const tasks = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && tasks.length < limit) {
                    tasks.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(tasks);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    async clearTasks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.TASK_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.TASK_STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

export const dbService = new DBService(); 