import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const GROQ_MODELS = ['llama', 'mixtral', 'gemma', 'whisper', 'qwen', 'openai', 'allam', 'groq'];

const model = process.env.AI_MODEL || 'grok-beta';

// Check if the model is a Groq model (Groq also uses an OpenAI-compatible API)
const isGroqModel = GROQ_MODELS.some(prefix => model.toLowerCase().startsWith(prefix));

const aiClient = new OpenAI(
    isGroqModel
        ? {
              apiKey: process.env.GROQ_API_KEY || 'missing_groq_key',
              baseURL: 'https://api.groq.com/openai/v1',
          }
        : {
              apiKey: process.env.XAI_API_KEY || 'missing_xai_key',
              baseURL: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
          }
);

console.log(`[AI Client] Using provider: ${isGroqModel ? 'Groq' : 'xAI'} | Model: ${model}`);

export default aiClient;
