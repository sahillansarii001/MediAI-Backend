import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Supported Models & Endpoints:
 * - Google Gemini: 'gemini-3.5-flash-lite' (Default), 'gemini-3.8-flash'
 *   Base URL: https://generativelanguage.googleapis.com/v1beta/openai/
 * - Groq: 'qwen/qwen3.8-27b' (High accuracy / speed), 'allam-2-7b', 'meta-llama/llama-prompt-guard-2-86m'
 *   Base URL: https://api.groq.com/openai/v1
 */

const GROQ_PREFIXES = ['qwen', 'allam', 'groq', 'llama', 'mixtral', 'gemma', 'whisper'];
const GEMINI_PREFIXES = ['gemini'];

export const getAIProviderConfig = (requestedModel) => {
    const rawModel = (requestedModel || process.env.AI_MODEL || 'gemini-3.5-flash-lite').trim();
    const modelLower = rawModel.toLowerCase();

    // Check if model targets Groq
    const isGroq = GROQ_PREFIXES.some(prefix => modelLower.startsWith(prefix));
    const isGemini = GEMINI_PREFIXES.some(prefix => modelLower.startsWith(prefix));

    if (isGroq || (!process.env.GEMINI_API_KEY && process.env.GROQ_API_KEY)) {
        // Groq active model mapping
        let targetModel = rawModel;
        if (targetModel === 'llama-3.3-70b-versatile' || targetModel === 'grok-beta' || targetModel.startsWith('llama')) {
            targetModel = 'qwen/qwen3.8-27b';
        }
        return {
            provider: 'Groq',
            model: targetModel,
            fallbackModel: 'allam-2-7b',
            client: new OpenAI({
                apiKey: process.env.GROQ_API_KEY || 'missing_groq_key',
                baseURL: 'https://api.groq.com/openai/v1',
            }),
        };
    }

    // Default to Google Gemini
    let targetModel = rawModel;
    if (targetModel.includes('2.5') || targetModel === 'grok-beta') {
        targetModel = 'gemini-3.5-flash-lite';
    }

    return {
        provider: 'Google Gemini',
        model: targetModel,
        fallbackModel: 'gemini-3.8-flash',
        client: new OpenAI({
            apiKey: process.env.GEMINI_API_KEY || 'missing_gemini_key',
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        }),
    };
};

const defaultConfig = getAIProviderConfig();
const aiClient = defaultConfig.client;

console.log(`[AI Client] Initialized. Primary Provider: ${defaultConfig.provider} | Model: ${defaultConfig.model}`);

export default aiClient;
