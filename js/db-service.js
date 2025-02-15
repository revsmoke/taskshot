import { CONFIG } from './config.js';

class DBService {
    constructor() {
        this.db = null;
        // Default thumbnail for tasks without screenshots
        this.defaultScreenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABmJLR0QA/wD/AP+gvaeTAAAD8UlEQVR4nO3cW4hVVRzH8d+ZnDKxvJSXyjJF0TDNhKjGSgvRoKKkKKKXegl6CXp5K3qJHoJuYlIUFFH0UEQXK4sKKsXxkqZhKZaGlmQXx8uMM6cH1jgdZ87MOXvtv85ea/y+MG/Df63/+s3ec/Zea28QERERERERERERERERERERERERERERERERERERERERkWEYn7sBM2gBLgGWAYuBhcB8YC7QBMwGWoHJwDhgCBgEjgL9wABwCNgH7AX2A38AXcCfuF9kEjUDS4HlwErgWmAFMA+3A7MaBvqAn4FdwHZgK/AL0FvAuEVpBm4EngFeB7qBEZyZjwNvAQ8C1wNzyhx/LnAT8BTwJvA7cCLH+MPADuBZ4BZgTpnjR2cOcB/wEe5TVe2OKMcQ8DXwOHBRGfNpBG4HXgUOVGH8E8AXwCO4z0/tawRWA28DB0m7I8p1FPgYuBtoKCCfeuAu4H3gWAXjHwbeA+4EGgsYPzoLgOeAPUTYEeXqBp4HLs2YUwtwP/BVxvH3Ac8ClxQ0RyuagQdwG3oU+x1RrkHgDeD2lLk1A2uAzSnHHwLeAe7ATazmNQEP4U7GYtgR5RoGvgQeyJDbPcDGlOOfBN4CLs8wvlmNwMPAH8S5I8p1AvgWd/1QjQbgUdyVQNrxjwBvAldmHN+UBmAtbn2n1h0BbgU2kXBB0ASsA35KOeYI7u7CzZRxAVKkeuBR3JpNrXfEFNuBtcBEEiwG1gO9KccaAb4D7gUmFTRHE+qAx4AjpN8Rk3E7dSr/7JQR3HXKI8CsIidqQR3wBO5hTNodMQn3KLwRd/YzgntM8jRwQdGTtKQeeJL0O2I87qx7A+7SZAT3eP054KKiJ2lNPfAU6XfEeNzp7Ue4p4wjuO8Rz+MuIWpWPfAM6XfEONwDqI+Bv3Cf/KPAS8ClRU/SmnrgWdLviDqgA/gE6MP9Bw8ArwBXFD1Ja+qB50i/I2bjPvVf4G4JHMc9XXwVuKroSVpTD7xA+h0xC3cWtRn3hc5x3KXHG8DVRU/SmgbgRdLviJm4L3S24C5HB4F/gLeBa4qepDUNwEuk3xHTcU8Xt+LufQ3iLlc3ANcVPUlrGoGXSb8jpuEuPbYBf+F2yD+4kLWFT9KYRuA10u+IqbizrO3AQdwOOYa7RV7Tl74NwOuk3xFTcE8Vd+DufR3DfQ/ZCNxQ9CStaQTeIP2OmIz7jvBH3JPFAdwl7ybgxqInaU0j8Cbpd8Qk3KXHT7gvdI7i7nN9ANxU9CStaQLeIv2OmIi79NiFe7rYj7v0+BC4uehJWtMEvE/6HTEBd+mxG3cDtA93ZrUZWFX0JEVERERERERERERERERERERERERERERERERERERETy+Rd7hFaMQWQqhwAAAABJRU5ErkJggg==';
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            // Check if IndexedDB is available
            if (!window.indexedDB) {
                const error = new Error('IndexedDB is not supported in this browser');
                error.code = 'DB_NOT_SUPPORTED';
                reject(error);
                return;
            }

            // First try to open the database
            this._createNewDatabase(resolve, reject, true);
        });
    }

    _createNewDatabase(resolve, reject, isInitialAttempt = false) {
        try {
            const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

            request.onerror = (event) => {
                const error = event.target.error;
                console.error('Database error:', {
                    name: error.name,
                    message: error.message,
                    code: error.code
                });

                // If this is our first attempt and we got an error, try deleting and recreating
                if (isInitialAttempt) {
                    console.log('Initial database open failed, attempting to delete and recreate...');
                    const deleteRequest = indexedDB.deleteDatabase(CONFIG.DB_NAME);
                    
                    deleteRequest.onsuccess = () => {
                        console.log('Successfully deleted database, recreating...');
                        this._createNewDatabase(resolve, reject, false);
                    };

                    deleteRequest.onerror = () => {
                        console.error('Failed to delete database:', deleteRequest.error);
                        reject(new Error('Failed to initialize database: Could not delete existing database'));
                    };

                    deleteRequest.onblocked = () => {
                        console.warn('Database deletion blocked. Please close other tabs with this site open.');
                        // Try to proceed with creation anyway
                        this._createNewDatabase(resolve, reject, false);
                    };
                } else {
                    reject(new Error('Failed to open database: ' + error.message));
                }
            };

            request.onblocked = (event) => {
                console.warn('Database opening blocked. Please close other tabs with this site open.');
                // Continue anyway as the operation might still succeed
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                
                this.db.onerror = (event) => {
                    console.error('Database error:', event.target.error);
                };

                // Verify that all required stores exist
                const storeNames = Array.from(this.db.objectStoreNames);
                const requiredStores = [CONFIG.TASK_STORE_NAME, CONFIG.PROJECT_STORE_NAME];
                
                const missingStores = requiredStores.filter(store => !storeNames.includes(store));
                
                if (missingStores.length > 0) {
                    console.log('Missing stores:', missingStores);
                    // If stores are missing, we need to close and reopen with a new version
                    const currentVersion = this.db.version;
                    this.db.close();
                    
                    const newVersion = currentVersion + 1;
                    console.log('Upgrading database to version:', newVersion);
                    const reopenRequest = indexedDB.open(CONFIG.DB_NAME, newVersion);
                    
                    reopenRequest.onupgradeneeded = (event) => this._handleUpgrade(event);
                    reopenRequest.onsuccess = (event) => {
                        this.db = event.target.result;
                        console.log('Database upgraded successfully');
                        resolve();
                    };
                    reopenRequest.onerror = (event) => {
                        const error = new Error('Failed to upgrade database: ' + event.target.error.message);
                        error.originalError = event.target.error;
                        reject(error);
                    };
                } else {
                    console.log('All required stores exist');
                    resolve();
                }
            };

            request.onupgradeneeded = (event) => {
                console.log('Database upgrade needed');
                this._handleUpgrade(event);
            };
        } catch (error) {
            console.error('Unexpected error during database creation:', error);
            reject(error);
        }
    }

    _handleUpgrade(event) {
        try {
            console.log('Handling database upgrade');
            const db = event.target.result;
            
            // Create tasks store if it doesn't exist
            if (!db.objectStoreNames.contains(CONFIG.TASK_STORE_NAME)) {
                console.log('Creating tasks store');
                const taskStore = db.createObjectStore(CONFIG.TASK_STORE_NAME, {
                    keyPath: 'uuid'
                });
                taskStore.createIndex('timestamp', 'timestamp', { unique: false });
                taskStore.createIndex('task', 'task', { unique: false });
                taskStore.createIndex('screenshot', 'screenshot', { unique: false });
            }

            // Create projects store if it doesn't exist
            if (!db.objectStoreNames.contains(CONFIG.PROJECT_STORE_NAME)) {
                console.log('Creating projects store');
                const projectStore = db.createObjectStore(CONFIG.PROJECT_STORE_NAME, {
                    keyPath: 'id'
                });
                projectStore.createIndex('name', 'name', { unique: false });
                
                // Add default project
                const defaultProject = {
                    id: crypto.randomUUID(),
                    name: 'Default',
                    color: '#3498db',
                    billableRate: 0,
                    defaultBillable: true,
                    description: 'Default project for unclassified tasks',
                    categories: ['Development', 'Research', 'Meeting', 'Planning'],
                    isDefaultProject: true
                };

                // Use the transaction from the upgrade event
                projectStore.add(defaultProject);
                console.log('Added default project');
            }
            console.log('Database upgrade completed');
        } catch (error) {
            console.error('Error during database upgrade:', error);
            throw error;
        }
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

    async getAllProjects() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.PROJECT_STORE_NAME], 'readonly');
            const store = transaction.objectStore(CONFIG.PROJECT_STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async addProject(project) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.PROJECT_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.PROJECT_STORE_NAME);
            const request = store.add(project);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateProject(project) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.PROJECT_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.PROJECT_STORE_NAME);
            const request = store.put(project);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteProject(projectId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.PROJECT_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.PROJECT_STORE_NAME);
            const request = store.delete(projectId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getDefaultProject() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([CONFIG.PROJECT_STORE_NAME], 'readonly');
            const store = transaction.objectStore(CONFIG.PROJECT_STORE_NAME);
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.isDefaultProject) {
                        resolve(cursor.value);
                        return;
                    }
                    cursor.continue();
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
}

export const dbService = new DBService(); 