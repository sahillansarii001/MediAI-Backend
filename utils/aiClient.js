import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const GROQ_MODELS = ['llama', 'mixtral', 'gemma', 'whisper', 'qwen', 'allam', 'groq'];
const GEMINI_MODELS = ['gemini'];

const model = process.env.AI_MODEL || 'gemini-3.5-flash-lite';
const modelLower = model.toLowerCase();

let provider = 'Google Gemini';
let clientConfig = {
    apiKey: process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
};

// Check if model explicitly specifies Groq or if Gemini is not configured
if (GROQ_MODELS.some(prefix => modelLower.startsWith(prefix))) {
    provider = 'Groq';
    clientConfig = {
        apiKey: process.env.GROQ_API_KEY || 'missing_groq_key',
        baseURL: 'https://api.groq.com/openai/v1',
    };
} else if (GEMINI_MODELS.some(prefix => modelLower.startsWith(prefix))) {
    provider = 'Google Gemini';
    clientConfig = {
        apiKey: process.env.GEMINI_API_KEY || 'missing_gemini_key',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    };
} else if (modelLower.startsWith('gpt') || process.env.OPENAI_API_KEY) {
    provider = 'OpenAI';
    clientConfig = {
        apiKey: process.env.OPENAI_API_KEY,
    };
} else if (process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    provider = 'Groq';
    clientConfig = {
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
    };
}

const aiClient = new OpenAI(clientConfig);

console.log(`[AI Client] Using provider: ${provider} | Model: ${model}`);

export default aiClient;
