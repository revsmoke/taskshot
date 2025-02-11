import { CONFIG, getApiKey } from './config.js';
import { errorService } from './error-service.js';

class AIService {
    constructor() {
        this.apiKey = null;
    }

    async initialize() {
        try {
            this.apiKey = await getApiKey();
            if (!this.apiKey) {
                throw new Error('API key not found. Please set up your OpenAI API key.');
            }
            errorService.info('AI Service initialized successfully');
        } catch (error) {
            errorService.error('Failed to initialize AI Service', error);
            throw error;
        }
    }

    async analyzeScreenshot(base64Image) {
        try {
            // Convert data URL to base64 string
            const base64Data = base64Image.split(',')[1];
            
            errorService.debug('Preparing Vision API request', {
                model: CONFIG.VISION_API.model,
                endpoint: CONFIG.VISION_API.endpoint
            });

            const requestBody = {
                model: CONFIG.VISION_API.model,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "What is in this image? Analyze this screenshot and describe what task the user appears to be working on. Focus on: 1) Open applications 2) Visible content 3) Any indicators of the type of work being performed."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Data}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: CONFIG.VISION_API.max_tokens
            };

            errorService.debug('Sending Vision API request', {
                endpoint: CONFIG.VISION_API.endpoint,
                requestSize: base64Data.length,
                model: CONFIG.VISION_API.model
            });

            const response = await fetch(CONFIG.VISION_API.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json();

            if (!response.ok) {
                errorService.error('Vision API request failed', null, {
                    status: response.status,
                    statusText: response.statusText,
                    error: responseData.error
                });
                throw new Error(`Vision API Error: ${responseData.error?.message || response.statusText}`);
            }

            errorService.debug('Vision API response received', {
                status: response.status,
                responseSize: JSON.stringify(responseData).length
            });

            return responseData.choices[0].message.content;
        } catch (error) {
            if (error.message.includes('API key')) {
                errorService.error('Invalid or missing API key', error, {
                    keyLength: this.apiKey ? this.apiKey.length : 0
                });
                throw new Error('Invalid or missing API key. Please check your OpenAI API key.');
            }
            errorService.error('Failed to analyze screenshot', error);
            throw error;
        }
    }

    async classifyTask(description) {
        try {
            errorService.debug('Preparing LLM API request', {
                model: CONFIG.LLM_API.model,
                endpoint: CONFIG.LLM_API.endpoint
            });

            const requestBody = {
                model: CONFIG.LLM_API.model,
                messages: [
                    {
                        role: "user",
                        content: `Classify this task description into one of these categories: ${CONFIG.TASK_CATEGORIES.join(', ')}. Return only a JSON object in this format: {"task": "category", "confidence": 0.XX, "description": "brief explanation"}. Description: ${description}`
                    }
                ],
                max_tokens: CONFIG.LLM_API.max_tokens,
                response_format: { type: "json_object" }
            };

            errorService.debug('Sending LLM API request', {
                endpoint: CONFIG.LLM_API.endpoint,
                inputLength: description.length,
                categories: CONFIG.TASK_CATEGORIES.length
            });

            const response = await fetch(CONFIG.LLM_API.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json();

            if (!response.ok) {
                errorService.error('LLM API request failed', null, {
                    status: response.status,
                    statusText: response.statusText,
                    error: responseData.error
                });
                throw new Error(`LLM API Error: ${responseData.error?.message || response.statusText}`);
            }

            errorService.debug('LLM API response received', {
                status: response.status,
                responseSize: JSON.stringify(responseData).length
            });

            const result = JSON.parse(responseData.choices[0].message.content);
            
            // Validate result format
            if (!result.task || !result.confidence || !result.description) {
                errorService.warn('Invalid LLM response format', {
                    response: result
                });
            }

            return result;
        } catch (error) {
            if (error.message.includes('API key')) {
                errorService.error('Invalid or missing API key', error, {
                    keyLength: this.apiKey ? this.apiKey.length : 0
                });
                throw new Error('Invalid or missing API key. Please check your OpenAI API key.');
            }
            errorService.error('Failed to classify task', error);
            throw error;
        }
    }
}

export const aiService = new AIService(); 