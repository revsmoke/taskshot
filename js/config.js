const CONFIG = {
    // Vision AI Configuration
    VISION_API: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',  // Matching the curl example exactly
        max_tokens: 300
    },
    
    // LLM Configuration
    LLM_API: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',  // Using same model for consistency
        max_tokens: 150
    },

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
    DB_VERSION: 1,
    TASK_STORE_NAME: 'tasks'
};

// Don't expose API keys in frontend code - these should be managed securely
// Either through environment variables or a backend service
const getApiKey = () => {
    // In production, this should make a secure request to your backend
    return localStorage.getItem('OPENAI_API_KEY');
};

export { CONFIG, getApiKey }; 