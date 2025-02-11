import { aiService } from './ai-service.js';
import { dbService } from './db-service.js';
import { errorService } from './error-service.js';

class BackgroundService {
    constructor() {
        this.isTracking = false;
        this.captureInterval = 5; // Default 5 minutes
        this.intervalId = null;
        this.lastCapture = null;
        this.nextCapture = null;
        this.countdownInterval = null;
        this.initialized = false;
        this.errorCount = 0;
        this.maxErrors = 3; // Maximum consecutive errors before pausing
        this.mediaStream = null;
        this.videoElement = null;
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async initialize() {
        try {
            await Promise.all([
                aiService.initialize(),
                dbService.initialize()
            ]);
            this.initialized = true;
            
            // Load recent tasks
            const recentTasks = await dbService.getRecentTasks();
            recentTasks.forEach(task => this.addTaskToUI(task));
            
            errorService.info('Background service initialized successfully');
        } catch (error) {
            errorService.error('Failed to initialize background service', error);
            this.handleError(error);
            throw error;
        }
    }

    async start() {
        if (this.isTracking || !this.initialized) {
            errorService.warn('Cannot start: ' + (!this.initialized ? 'Not initialized' : 'Already tracking'));
            return;
        }

        try {
            // Request screen capture permission and set up persistent stream
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "never"
                },
                audio: false
            });

            // Set up video element for frame capture
            this.videoElement = document.createElement('video');
            this.videoElement.srcObject = stream;
            this.videoElement.onloadedmetadata = async () => {
                this.videoElement.play();
                this.mediaStream = stream;
                
                // Now that we have the stream, start tracking
                this.isTracking = true;
                this.errorCount = 0;
                errorService.info('Starting tracking with persistent stream...');
                await this.captureScreen(); // Immediate first capture
                this.updateStatus();
            };

            // Handle stream end (user stops sharing)
            stream.getVideoTracks()[0].onended = () => {
                errorService.warn('Screen share ended by user');
                this.pause();
            };

        } catch (error) {
            errorService.error('Failed to start screen capture', error);
            this.handleError(error);
        }
    }

    pause() {
        if (!this.isTracking) return;
        
        this.isTracking = false;
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        
        // Clean up media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement = null;
        }

        this.nextCapture = null;
        this.updateCountdown();
        errorService.info('Tracking paused');
        this.updateStatus();
    }

    updateCountdown() {
        const countdownElement = document.getElementById('countdown');
        const progressFill = document.getElementById('progressFill');
        
        if (!this.isTracking || !this.nextCapture) {
            countdownElement.textContent = '--:--';
            progressFill.style.width = '0%';
            return;
        }

        const now = new Date();
        const timeLeft = this.nextCapture - now;
        
        if (timeLeft <= 0) {
            countdownElement.textContent = 'Capturing...';
            progressFill.style.width = '100%';
            return;
        }

        // Calculate minutes and seconds
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        
        // Format countdown
        countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Update progress bar
        const totalDuration = this.captureInterval * 60 * 1000;
        const progress = ((totalDuration - timeLeft) / totalDuration) * 100;
        progressFill.style.width = `${progress}%`;
    }

    startCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        this.nextCapture = new Date(Date.now() + this.captureInterval * 60 * 1000);
        this.updateCountdown();

        this.countdownInterval = setInterval(() => {
            this.updateCountdown();
        }, 1000);
    }

    handleError(error) {
        this.errorCount++;
        console.error(`Error occurred (${this.errorCount}/${this.maxErrors}):`, error);
        
        if (this.errorCount >= this.maxErrors) {
            console.error('Maximum consecutive errors reached. Pausing tracking.');
            this.pause();
            alert('Tracking has been paused due to multiple errors. Please check the console and try again.');
        }
    }

    setCaptureInterval(minutes) {
        this.captureInterval = minutes;
        console.log(`Capture interval set to ${minutes} minutes`);
        if (this.isTracking) {
            // Restart the capture schedule with new interval
            this.pause();
            this.start();
        }
    }

    async captureScreen() {
        try {
            console.log('Capturing frame from stream...');
            
            if (!this.mediaStream || !this.videoElement) {
                throw new Error('No active screen capture stream');
            }

            // Create canvas to capture the video frame
            const canvas = document.createElement('canvas');
            canvas.width = this.videoElement.videoWidth;
            canvas.height = this.videoElement.videoHeight;
            
            // Draw the current frame to canvas
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

            // Convert to base64
            const screenshot = canvas.toDataURL('image/jpeg', 0.8);
            console.log('Frame captured successfully');
            
            // Process the screenshot
            await this.processScreenshot(screenshot);

            this.lastCapture = new Date();
            this.errorCount = 0; // Reset error count on successful capture
            this.updateStatus();
            
            // Schedule next capture
            this.scheduleNextCapture();
        } catch (error) {
            console.error('Error capturing screen:', error);
            this.handleError(error);
            // Still schedule next capture if we haven't hit max errors
            if (this.errorCount < this.maxErrors) {
                this.scheduleNextCapture();
            }
        }
    }

    async processScreenshot(screenshot) {
        try {
            console.log('Processing screenshot...');
            // Get description from Vision AI
            const description = await aiService.analyzeScreenshot(screenshot);
            console.log('Vision AI description:', description);
            
            // Classify task using LLM
            const classification = await aiService.classifyTask(description);
            console.log('Task classification:', classification);
            
            const now = new Date();
            // Create task object with enhanced time tracking
            const task = {
                uuid: this.generateUUID(),
                name: classification.task,
                confidence: classification.confidence,
                description: classification.description,
                startTime: this.lastCapture || now,
                endTime: now,
                duration: this.lastCapture ? 
                    Math.round((now - this.lastCapture) / 1000 / 60) : // Duration in minutes
                    this.captureInterval, // Use interval for first capture
                category: classification.task.split(' - ')[0] || 'Uncategorized', // Extract main category
                project: 'Default', // Can be customized later
                billable: true, // Default value, can be customized
                timestamp: now.toISOString()
            };

            // Store in database
            await dbService.addTask(task);
            console.log('Task stored in database');

            // Update UI
            this.addTaskToUI(task);

            // If confidence is low, show confirmation modal
            if (classification.confidence < 0.7) {
                console.log('Low confidence detection, showing confirmation modal');
                this.showTaskConfirmation(task);
            }
        } catch (error) {
            console.error('Error processing screenshot:', error);
            // Add a failed task entry with current timestamp
            const now = new Date();
            const failedTask = {
                name: 'Task Detection Failed',
                confidence: 0,
                description: error.message,
                startTime: this.lastCapture || now,
                endTime: now,
                duration: this.lastCapture ? 
                    Math.round((now - this.lastCapture) / 1000 / 60) :
                    this.captureInterval,
                category: 'Error',
                project: 'Default',
                billable: false,
                timestamp: now.toISOString()
            };
            this.addTaskToUI(failedTask);
            this.handleError(error);
        }
    }

    showTaskConfirmation(task) {
        const modal = document.getElementById('taskModal');
        const overlay = document.getElementById('modalOverlay');
        const suggestion = document.getElementById('taskSuggestion');
        const input = document.getElementById('taskInput');
        const confirmBtn = document.getElementById('confirmTask');
        const cancelBtn = document.getElementById('cancelTask');

        suggestion.textContent = `Suggested: ${task.name} (${(task.confidence * 100).toFixed(1)}% confident)`;
        input.value = task.name;

        modal.style.display = 'block';
        overlay.style.display = 'block';

        const cleanup = () => {
            modal.style.display = 'none';
            overlay.style.display = 'none';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        const handleConfirm = async () => {
            const updatedTask = {
                ...task,
                name: input.value,
                confidence: 1.0 // User confirmed
            };
            await dbService.addTask(updatedTask);
            this.addTaskToUI(updatedTask);
            cleanup();
        };

        const handleCancel = () => {
            cleanup();
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    }

    addTaskToUI(task) {
        const taskContainer = document.getElementById('taskContainer');
        const taskElement = document.createElement('div');
        taskElement.className = 'task-item';
        taskElement.dataset.taskId = task.uuid;  // Store UUID in dataset
        taskElement.dataset.project = task.project;
        taskElement.dataset.category = task.category;
        taskElement.dataset.billable = task.billable;
        taskElement.dataset.startTime = task.startTime;
        taskElement.dataset.endTime = task.endTime;
        taskElement.dataset.timestamp = task.timestamp;
        taskElement.dataset.duration = task.duration;
        
        // Format times for display
        const startTime = new Date(task.startTime).toLocaleTimeString();
        const endTime = new Date(task.endTime).toLocaleTimeString();
        
        taskElement.innerHTML = `
            <div>
                <strong>${task.name}</strong>
                <div class="task-details">
                    <span>Project: ${task.project}</span> |
                    <span>Category: ${task.category}</span> |
                    <span>Duration: ${task.duration} min</span>
                </div>
                <div class="task-time">
                    ${startTime} - ${endTime}
                </div>
                <div>Confidence: ${(task.confidence * 100).toFixed(1)}%</div>
                ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                <div class="task-uuid">ID: ${task.uuid}</div>
            </div>
            <div class="task-actions">
                <label><input type="checkbox" ${task.billable ? 'checked' : ''} onclick="event.stopPropagation();"> Billable</label>
            </div>
        `;
        
        // Add to beginning of list
        if (taskContainer.firstChild) {
            taskContainer.insertBefore(taskElement, taskContainer.firstChild);
        } else {
            taskContainer.appendChild(taskElement);
        }

        // Keep only last 10 tasks
        while (taskContainer.children.length > 10) {
            taskContainer.removeChild(taskContainer.lastChild);
        }
    }

    scheduleNextCapture() {
        if (!this.isTracking) return;
        
        if (this.intervalId) {
            clearTimeout(this.intervalId);
        }

        this.intervalId = setTimeout(() => {
            this.captureScreen();
        }, this.captureInterval * 60 * 1000); // Convert minutes to milliseconds
        
        this.startCountdown();
        errorService.debug(`Next capture scheduled in ${this.captureInterval} minutes`);
    }

    updateStatus() {
        const statusElement = document.getElementById('tracking-status');
        const lastCaptureElement = document.getElementById('last-capture');
        
        statusElement.textContent = `Status: ${this.isTracking ? 'Active' : 'Inactive'}`;
        lastCaptureElement.textContent = `Last Capture: ${this.lastCapture ? this.lastCapture.toLocaleString() : 'Never'}`;
    }
}

// Create and export instance
const backgroundService = new BackgroundService();

// Initialize services when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await backgroundService.initialize();
    } catch (error) {
        errorService.error('Failed to initialize background service:', error);
        alert('Failed to initialize the application. Please check the console for details.');
    }
});

export { backgroundService }; 