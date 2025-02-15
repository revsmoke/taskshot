const CONFIG = {
    // AI Provider Configuration
    AI_PROVIDERS: {
        openai: {
            name: 'OpenAI',
            models: {
                'gpt-4o-mini': {
                    name: 'gpt-4o-mini',
                    type: 'vision',
                    endpoint: 'https://api.openai.com/v1/chat/completions',
                    maxTokens: 300
                },
                'gpt-4o': {
                    name: 'gpt-4o',
                    type: 'text',
                    endpoint: 'https://api.openai.com/v1/chat/completions',
                    maxTokens: 150
                }
            },
            requiresKey: true,
            keyName: 'OPENAI_API_KEY'
        },
        local: {
            name: 'Local AI',
            models: {
                'llama2': {
                    name: 'Llama 2',
                    type: 'text',
                    endpoint: 'http://localhost:8080/v1/chat/completions',
                    maxTokens: 150
                },
                'local-vision': {
                    name: 'Local Vision Model',
                    type: 'vision',
                    endpoint: 'http://localhost:8080/v1/vision',
                    maxTokens: 300
                }
            },
            requiresKey: false
        },
        anthropic: {
            name: 'Anthropic',
            models: {
                'claude-3-opus': {
                    name: 'Claude 3 Opus',
                    type: 'text',
                    endpoint: 'https://api.anthropic.com/v1/messages',
                    maxTokens: 150
                }
            },
            requiresKey: true,
            keyName: 'ANTHROPIC_API_KEY'
        }
    },

    // Default AI settings
    DEFAULT_AI_PROVIDER: 'openai',
    DEFAULT_VISION_MODEL: 'gpt-4o-mini',
    DEFAULT_TEXT_MODEL: 'gpt-4',
    
    // Project Settings
    DEFAULT_PROJECT: 'default',
    
    // Task Categories - Initial set of known tasks
    TASK_CATEGORIES: [
        'Development - Coding',
        'Development - Debugging',
        'Documentation',
        'Email Communication',
        'Meeting - Video Conference',
        'Meeting - In Person',
        'Research',
        'Design Work',
        'Project Management',
        'Break Time'
    ],

    // Database Configuration
    DB_NAME: 'taskshot_db',
    DB_VERSION: 2,
    TASK_STORE_NAME: 'tasks',
    PROJECT_STORE_NAME: 'projects',
    SETTINGS_STORE_NAME: 'settings'
};

// API key management
const getApiKey = (keyName) => {
    return localStorage.getItem(keyName);
};

const setApiKey = (keyName, key) => {
    if (!key) {
        return;
    }
    localStorage.setItem(keyName, key);
};

const getAISettings = () => {
    try {
        const settings = localStorage.getItem('ai_settings');
        if (!settings) {
            return null;
        }
        return JSON.parse(settings);
    } catch (error) {
        console.error('Failed to retrieve AI settings:', error);
        return null;
    }
};

const setAISettings = (settings) => {
    if (!settings || !settings.provider) {
        throw new Error('Invalid AI settings');
    }
    localStorage.setItem('ai_settings', JSON.stringify(settings));
};

export { CONFIG, getApiKey, setApiKey, getAISettings, setAISettings }; 