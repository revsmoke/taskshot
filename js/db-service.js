import { CONFIG } from './config.js';

class DBService {
    constructor() {
        this.db = null;
        // Default thumbnail for tasks without screenshots
        this.defaultScreenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABmJLR0QA/wD/AP+gvaeTAAAD8UlEQVR4nO3cW4hVVRzH8d+ZnDKxvJSXyjJF0TDNhKjGSgvRoKKkKKKXegl6CXp5K3qJHoJuYlIUFFH0UEQXK4sKKsXxkqZhKZaGlmQXx8uMM6cH1jgdZ87MOXvtv85ea/y+MG/Df63/+s3ec/Zea28QERERERERERERERERERERERERERERERERERERERERkWEYn7sBM2gBLgGWAYuBhcB8YC7QBMwGWoHJwDhgCBgEjgL9wABwCNgH7AX2A38AXcCfuF9kEjUDS4HlwErgWmAFMA+3A7MaBvqAn4FdwHZgK/AL0FvAuEVpBm4EngFeB7qBEZyZjwNvAQ8C1wNzyhx/LnAT8BTwJvA7cCLH+MPADuBZ4BZgTpnjR2cOcB/wEe5TVe2OKMcQ8DXwOHBRGfNpBG4HXgUOVGH8E8AXwCO4z0/tawRWA28DB0m7I8p1FPgYuBtoKCCfeuAu4H3gWAXjHwbeA+4EGgsYPzoLgOeAPUTYEeXqBp4HLs2YUwtwP/BVxvH3Ac8ClxQ0RyuagQdwG3oU+x1RrkHgDeD2lLk1A2uAzSnHHwLeAe7ATazmNQEP4U7GYtgR5RoGvgQeyJDbPcDGlOOfBN4CLs8wvlmNwMPAH8S5I8p1AvgWd/1QjQbgUdyVQNrxjwBvAldmHN+UBmAtbn2n1h0BbgU2kXBB0ASsA35KOeYI7u7CzZRxAVKkeuBR3JpNrXfEFNuBtcBEEiwG1gO9KccaAb4D7gUmFTRHE+qAx4AjpN8Rk3E7dSr/7JQR3HXKI8CsIidqQR3wBO5hTNodMQn3KLwRd/YzgntM8jRwQdGTtKQeeJL0O2I87qx7A+7SZAT3eP054KKiJ2lNPfAU6XfEeNzp7Ue4p4wjuO8Rz+MuIWpWPfAM6XfEONwDqI+Bv3Cf/KPAS8ClRU/SmnrgWdLviDqgA/gE6MP9Bw8ArwBXFD1Ja+qB50i/I2bjPvVf4G4JHMc9XXwVuKroSVpTD7xA+h0xC3cWtRn3hc5x3KXHG8DVRU/SmgbgRdLviJm4L3S24C5HB4F/gLeBa4qepDUNwEuk3xHTcU8Xt+LufQ3iLlc3ANcVPUlrGoGXSb8jpuEuPbYBf+F2yD+4kLWFT9KYRuA10u+IqbizrO3AQdwOOYa7RV7Tl74NwOuk3xFTcE8Vd+DufR3DfQ/ZCNxQ9CStaQTeIP2OmIz7jvBH3JPFAdwl7ybgxqInaU0j8Cbpd8Qk3KXHT7gvdI7i7nN9ANxU9CStaQLeIv2OmIi79NiFe7rYj7v0+BC4uehJWtMEvE/6HTEBd+mxG3cDtA93ZrUZWFX0JEVERERERERERERERERERERERERERERERERERERETy+Rd7hFaMQWQqhwAAAABJRU5ErkJggg==';
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION + 1); // Increment version for schema update

            request.onerror = () => {
                reject(new Error('Failed to open database'));
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create or update tasks store
                if (!db.objectStoreNames.contains(CONFIG.TASK_STORE_NAME)) {
                    const store = db.createObjectStore(CONFIG.TASK_STORE_NAME, {
                        keyPath: 'uuid'
                    });
                    
                    // Create indexes for querying
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('task', 'task', { unique: false });
                } else {
                    const store = event.target.transaction.objectStore(CONFIG.TASK_STORE_NAME);
                    // Add screenshot field if it doesn't exist
                    if (!store.indexNames.contains('screenshot')) {
                        store.createIndex('screenshot', 'screenshot', { unique: false });
                    }
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

    async deleteTask(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.TASK_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.TASK_STORE_NAME);
            const request = store.delete(taskId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

export const dbService = new DBService(); 