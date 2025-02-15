import { aiService } from './ai-service.js';
import { dbService } from './db-service.js';
import { errorService } from './error-service.js';
import { aiProviderService } from './ai-provider-service.js';
import { addTaskToUI } from './ui.js';

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
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    async initialize() {
        try {
            // Load saved capture interval
            const savedInterval = localStorage.getItem('capture_interval');
            if (savedInterval) {
                const interval = parseInt(savedInterval, 10);
                if (interval > 0) {
                    this.captureInterval = interval;
                }
            }

            await Promise.all([
                aiService.initialize(),
                dbService.initialize()
            ]);
            this.initialized = true;
            
            // Load recent tasks
            const recentTasks = await dbService.getRecentTasks();
            recentTasks.forEach(task => addTaskToUI(task));
            
            errorService.info('Background service initialized successfully');
        } catch (error) {
            // Don't treat missing API key as a fatal error
            if (error.message && error.message.includes('API key required')) {
                errorService.warn('AI services not configured, some features will be limited');
                // Still initialize the database for manual task entry
                await dbService.initialize();
                this.initialized = true;
                return;
            }
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

        // Check if AI services are ready
        if (!aiProviderService.isInitialized) {
            const provider = aiProviderService.currentProvider;
            if (provider && provider.requiresKey) {
                errorService.warn('Cannot start tracking: API key not configured');
                alert('Please configure your API key in the settings before starting automatic tracking.');
            } else {
                errorService.warn('Cannot start tracking: AI provider not configured');
                alert('Please configure AI provider settings before starting automatic tracking.');
            }
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

            // Convert to base64, explicitly using JPEG format
            const screenshot = canvas.toDataURL('image/jpeg', 0.8);
            // Remove the data URL prefix to get just the base64 data
            const base64Image = screenshot.replace(/^data:image\/jpeg;base64,/, '');
            console.log('Frame captured successfully');
            
            // Process the screenshot
            await this.processScreenshot(base64Image);

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
            
            // Create thumbnail
            const thumbnailImage = await this.createThumbnail(screenshot);
            
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
                project: classification.project || 'Default', // Use AI-suggested project
                billable: true, // Default value, can be customized
                timestamp: now.toISOString(),
                screenshot: thumbnailImage // Add screenshot thumbnail
            };

            // Store in database
            await dbService.addTask(task);
            console.log('Task stored in database');

            // Update UI using the UI module's function
            addTaskToUI(task);

            // If confidence is low, show confirmation modal
            if (classification.confidence < 0.7) {
                console.log('Low confidence detection, showing confirmation modal');
                this.showTaskConfirmation(task);
            }
        } catch (error) {
            console.error('Error processing screenshot:', error);
            // Add a failed task entry with current timestamp
            const now = new Date();
            
            // Try to create thumbnail from the screenshot, fall back to default if that fails
            let thumbnailImage;
            try {
                thumbnailImage = await this.createThumbnail(screenshot);
            } catch (thumbnailError) {
                console.error('Failed to create thumbnail, using default:', thumbnailError);
                thumbnailImage = dbService.defaultScreenshot;
            }
            
            const failedTask = {
                uuid: this.generateUUID(),
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
                timestamp: now.toISOString(),
                screenshot: thumbnailImage
            };
            
            try {
                await dbService.addTask(failedTask);
                addTaskToUI(failedTask);
            } catch (saveError) {
                errorService.error('Failed to save error task', saveError);
            }
            
            this.handleError(error);
        }
    }

    async createThumbnail(base64Image) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Set thumbnail size (100x100 pixels)
                const size = 300;
                canvas.width = size;
                canvas.height = size;

                // Calculate aspect ratio
                const scale = Math.min(size / img.width, size / img.height);
                const x = (size - img.width * scale) / 2;
                const y = (size - img.height * scale) / 2;

                // Draw image with white background
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, size, size);
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

                // Convert to base64
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = () => {
                reject(new Error('Failed to create thumbnail'));
            };
            img.src = 'data:image/jpeg;base64,' + base64Image;
        });
    }

    showTaskConfirmation(task) {
        const modal = document.getElementById('taskModal');
        const overlay = document.getElementById('modalOverlay');
        const suggestion = document.getElementById('taskSuggestion');
        const input = document.getElementById('taskInput');
        const projectSelect = document.getElementById('taskProjectSelect');
        const confirmBtn = document.getElementById('confirmTask');
        const cancelBtn = document.getElementById('cancelTask');

        // Load projects into select
        const projects = JSON.parse(localStorage.getItem('projects')) || [];
        projectSelect.innerHTML = projects.map(p => 
            `<option value="${p.id}" ${p.id === task.project ? 'selected' : ''}>${p.name}</option>`
        ).join('');

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
                project: projectSelect.value,
                confidence: input.value === task.name ? task.confidence : 1.0 // Only set to 1.0 if user modified the task
            };
            await dbService.addTask(updatedTask);
            addTaskToUI(updatedTask);
            cleanup();
        };

        const handleCancel = () => {
            cleanup();
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
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