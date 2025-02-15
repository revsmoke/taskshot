import { CONFIG, getApiKey, getAISettings } from './config.js';
import { errorService } from './error-service.js';

class AIProviderService {
    constructor() {
        this.settings = null;
        this.currentProvider = null;
        this.isInitialized = false;
    }

    async initialize() {
        try {
            this.settings = getAISettings();
            
            // If no settings exist, just set up the default provider without validation
            if (!this.settings || !this.settings.provider) {
                this.settings = {
                    provider: CONFIG.DEFAULT_AI_PROVIDER,
                    visionModel: CONFIG.DEFAULT_VISION_MODEL,
                    textModel: CONFIG.DEFAULT_TEXT_MODEL
                };
                this.currentProvider = CONFIG.AI_PROVIDERS[CONFIG.DEFAULT_AI_PROVIDER];
                errorService.warn('No AI settings found, using defaults');
                return;
            }

            // Get the provider configuration
            const provider = CONFIG.AI_PROVIDERS[this.settings.provider];
            if (!provider) {
                throw new Error(`Invalid AI provider: ${this.settings.provider}`);
            }
            this.currentProvider = provider;

            // Check API key if required
            if (provider.requiresKey) {
                const apiKey = getApiKey(provider.keyName);
                if (!apiKey) {
                    errorService.warn(`API key not set for ${provider.name}`);
                    return;
                }
                // Verify the API key is properly formatted
                if (apiKey.trim().length === 0) {
                    errorService.warn(`Invalid API key format for ${provider.name}`);
                    return;
                }
                errorService.debug(`API key found for ${provider.name}`);
            }

            // Validate models
            const visionModel = provider.models[this.settings.visionModel];
            const textModel = provider.models[this.settings.textModel];

            if (!visionModel || visionModel.type !== 'vision') {
                throw new Error(`Invalid vision model: ${this.settings.visionModel}`);
            }
            if (!textModel || textModel.type !== 'text') {
                throw new Error(`Invalid text model: ${this.settings.textModel}`);
            }

            // If we get here, everything is valid
            this.isInitialized = true;
            errorService.info('AI Provider Service initialized successfully');
        } catch (error) {
            errorService.error('Failed to initialize AI Provider Service', error);
            throw error;
        }
    }

    async callVisionAPI(base64Image) {
        if (!this.isInitialized) {
            throw new Error('AI Provider Service not fully initialized. Please configure API settings first.');
        }
        const provider = this.currentProvider;
        const model = provider.models[this.settings.visionModel];
        const apiKey = provider.requiresKey ? getApiKey(provider.keyName) : null;

        const headers = {
            'Content-Type': 'application/json',
            ...(apiKey && { 'Authorization': this._getAuthHeader(provider, apiKey) })
        };

        const requestBody = this._createVisionRequestBody(provider, model, base64Image);

        try {
            const response = await fetch(model.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const data = await response.json();
            return this._extractVisionResponse(provider, data);
        } catch (error) {
            errorService.error('Vision API request failed', error);
            throw error;
        }
    }

    async callTextAPI(prompt) {
        if (!this.isInitialized) {
            throw new Error('AI Provider Service not fully initialized. Please configure API settings first.');
        }
        const provider = this.currentProvider;
        const model = provider.models[this.settings.textModel];
        const apiKey = provider.requiresKey ? getApiKey(provider.keyName) : null;

        const headers = {
            'Content-Type': 'application/json',
            ...(apiKey && { 'Authorization': this._getAuthHeader(provider, apiKey) })
        };

        const requestBody = this._createTextRequestBody(provider, model, prompt);

        try {
            const response = await fetch(model.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const data = await response.json();
            return this._extractTextResponse(provider, data);
        } catch (error) {
            errorService.error('Text API request failed', error);
            throw error;
        }
    }

    _getAuthHeader(provider, apiKey) {
        switch (provider.name.toLowerCase()) {
            case 'openai':
                return `Bearer ${apiKey}`;
            case 'anthropic':
                return `x-api-key ${apiKey}`;
            default:
                return `Bearer ${apiKey}`;
        }
    }

    _createVisionRequestBody(provider, model, base64Image) {
        switch (provider.name.toLowerCase()) {
            case 'openai':
                return {
                    model: model.name,
                    messages: [{
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "What is in this image? Analyze this screenshot and describe what task the user appears to be working on. Focus on: 1) Open applications 2) Visible content 3) Any indicators of the type of work being performed."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`
                                }
                            }
                        ]
                    }],
                    max_tokens: model.maxTokens
                };
            case 'local':
                return {
                    image: base64Image,
                    prompt: "Analyze this screenshot and describe the user's current task"
                };
            default:
                throw new Error(`Unsupported provider for vision API: ${provider.name}`);
        }
    }

    _createTextRequestBody(provider, model, prompt) {
        switch (provider.name.toLowerCase()) {
            case 'openai':
                return {
                    model: model.name,
                    messages: [{
                        role: "user",
                        content: `${prompt}\n\nRespond ONLY with a JSON object in this exact format:\n{\n  "task": "category - specific task",\n  "project": "project_id",\n  "confidence": 0.XX,\n  "description": "brief explanation"\n}`
                    }],
                    max_tokens: model.maxTokens
                };
            case 'anthropic':
                return {
                    model: model.name,
                    messages: [{
                        role: "user",
                        content: prompt
                    }],
                    max_tokens: model.maxTokens
                };
            case 'local':
                return {
                    prompt,
                    max_tokens: model.maxTokens
                };
            default:
                throw new Error(`Unsupported provider for text API: ${provider.name}`);
        }
    }

    _extractVisionResponse(provider, data) {
        switch (provider.name.toLowerCase()) {
            case 'openai':
                return data.choices[0].message.content;
            case 'local':
                return data.description;
            default:
                throw new Error(`Unsupported provider for vision API: ${provider.name}`);
        }
    }

    _extractTextResponse(provider, data) {
        try {
            let content;
            switch (provider.name.toLowerCase()) {
                case 'openai':
                    content = data.choices[0].message.content;
                    break;
                case 'anthropic':
                    content = data.content[0].text;
                    break;
                case 'local':
                    content = data.response;
                    break;
                default:
                    throw new Error(`Unsupported provider for text API: ${provider.name}`);
            }

            // Clean up content if it's wrapped in code blocks
            content = content.replace(/```json\s*/, '').replace(/```\s*$/, '');

            // Try to parse JSON, if it fails return a default structure
            try {
                return JSON.parse(content);
            } catch (parseError) {
                errorService.warn('Failed to parse JSON response, using default structure', { content });
                return {
                    task: 'Unknown Task',
                    confidence: 0.5,
                    description: content,
                    project: 'default'
                };
            }
        } catch (error) {
            errorService.error('Error extracting text response', error);
            throw error;
        }
    }

    getAvailableProviders() {
        return Object.entries(CONFIG.AI_PROVIDERS).map(([id, provider]) => ({
            id,
            name: provider.name,
            requiresKey: provider.requiresKey,
            models: Object.entries(provider.models).map(([modelId, model]) => ({
                id: modelId,
                name: model.name,
                type: model.type
            }))
        }));
    }
}

export const aiProviderService = new AIProviderService(); 