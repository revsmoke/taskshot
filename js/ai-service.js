import { CONFIG } from './config.js';
import { errorService } from './error-service.js';
import { aiProviderService } from './ai-provider-service.js';
import { dbService } from './db-service.js';

class AIService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        try {
            await aiProviderService.initialize();
            // Only mark as initialized if the provider service is fully initialized
            this.initialized = aiProviderService.isInitialized;
            if (this.initialized) {
                errorService.info('AI Service initialized successfully');
            } else {
                errorService.warn('AI Service partially initialized - waiting for configuration');
            }
        } catch (error) {
            if (error.message && error.message.includes('API key required')) {
                errorService.warn('AI Service requires configuration');
                return;
            }
            errorService.error('Failed to initialize AI Service', error);
            throw error;
        }
    }

    async analyzeScreenshot(base64Image) {
        try {
            if (!this.initialized) {
                throw new Error('AI Service not initialized - please configure settings first');
            }

            errorService.debug('Preparing Vision API request');
            const description = await aiProviderService.callVisionAPI(base64Image);
            
            errorService.debug('Vision API response received', {
                descriptionLength: description.length
            });

            return description;
        } catch (error) {
            errorService.error('Failed to analyze screenshot', error);
            throw error;
        }
    }

    async classifyTask(description) {
        try {
            if (!this.initialized) {
                throw new Error('AI Service not initialized - please configure settings first');
            }

            errorService.debug('Preparing task classification request');

            // Get available projects and their recent tasks
            const projects = JSON.parse(localStorage.getItem('projects')) || [];
            const tasks = await dbService.getRecentTasks(50); // Get last 50 tasks for context

            // Create rich project context
            const projectInfo = projects.map(p => {
                const projectTasks = tasks.filter(t => t.project === p.id);
                const recentTaskNames = projectTasks.slice(0, 5).map(t => t.name);
                const taskCategories = [...new Set(projectTasks.map(t => t.category))];
                
                return `Project: ${p.name} (ID: ${p.id})
                Description: ${p.description || 'No description provided'}
                Type: ${p.defaultBillable ? 'Billable Work' : 'Non-billable Work'}
                Rate: ${p.billableRate > 0 ? `$${p.billableRate}/hour` : 'Non-billable'}
                Supported Categories: ${p.categories ? p.categories.join(', ') : 'All Categories'}
                Common Task Categories: ${taskCategories.join(', ') || 'None'}
                Recent Tasks: ${recentTaskNames.join(', ') || 'None'}
                Task Count: ${projectTasks.length} tasks in the last 50 entries`;
            }).join('\n\n');

            // Create task history context
            const taskHistory = tasks.slice(0, 5).map(t => 
                `${new Date(t.timestamp).toLocaleString()}: ${t.name} (Project: ${t.project}, Category: ${t.category})`
            ).join('\n');

            const prompt = `Analyze this task description and provide the following:
1. Classify it into one of these categories: ${CONFIG.TASK_CATEGORIES.join(', ')}
2. Suggest which project it belongs to based on the following project information:

${projectInfo}

Recent Task History:
${taskHistory}

Consider:
- Project descriptions and their relevance to the task
- Supported and commonly used categories
- Similar tasks from project history
- Project type (billable vs non-billable)
- Project names and their relevance to the task
- Historical task volume and patterns
- Recent task patterns and context

Return only a JSON object in this format: {
    "task": "category",
    "project": "project_id",
    "confidence": 0.XX,
    "description": "brief explanation of why this project was chosen, including which factors were most influential"
}

Note: Use the project ID from the parentheses, not the project name.
If unsure about the project, use "default". Description: ${description}`;
            
            const result = await aiProviderService.callTextAPI(prompt);

            // Validate result format
            if (!result.task || !result.confidence || !result.description || !result.project) {
                errorService.warn('Invalid classification response format', {
                    response: result
                });
                // Find the default project ID
                const defaultProject = projects.find(p => p.isDefaultProject);
                result.project = defaultProject ? defaultProject.id : projects[0]?.id;
            } else {
                // If AI returns "default" or "Default", find the actual default project ID
                if (typeof result.project === 'string' && result.project.toLowerCase() === 'default') {
                    const defaultProject = projects.find(p => p.isDefaultProject);
                    if (defaultProject) {
                        result.project = defaultProject.id;
                    } else {
                        // If no default project exists, use the first project
                        result.project = projects[0]?.id;
                    }
                } else {
                    // Verify the project ID exists
                    const projectExists = projects.some(p => p.id === result.project);
                    if (!projectExists) {
                        errorService.warn('Invalid project ID returned by AI', {
                            projectId: result.project
                        });
                        const defaultProject = projects.find(p => p.isDefaultProject);
                        result.project = defaultProject ? defaultProject.id : projects[0]?.id;
                    }
                }
            }

            // Add the prompt and context to the result
            result.prompt = prompt;
            result.context = {
                projectInfo,
                taskHistory,
                timestamp: new Date().toISOString()
            };

            return result;
        } catch (error) {
            errorService.error('Failed to classify task', error);
            throw error;
        }
    }
}

export const aiService = new AIService(); 