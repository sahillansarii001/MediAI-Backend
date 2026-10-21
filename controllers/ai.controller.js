import aiClient from '../utils/aiClient.js';
import OpenAI from 'openai';
import Doctor from '../models/Doctor.js';
import HealthVitals from '../models/HealthVitals.js';
import { computeDoctorStatus } from '../utils/statusHelper.js';
import { createAuditLog } from '../utils/auditLogger.js';

// @desc    AI Symptom Checker
// @route   POST /api/ai/symptom-check
// @access  Private (Patient)
export const symptomCheck = async (req, res, next) => {
    try {
        const { symptoms, previousMessages = [], mode, imageUrl } = req.body;
        console.log("check", symptoms, "mode:", mode, "imageUrl:", imageUrl ? "present" : "none");
        if (!symptoms && !imageUrl) {
            return res.status(400).json({ success: false, message: 'Please provide symptoms or an image' });
        }

        const { _id: patientId, fullName, age, sex, bloodGroup, allergies, currentMedications, previousDiseaseHistory } = req.user;

        // Fetch available doctor specializations
        const availableSpecializations = await Doctor.distinct('specialization', { verificationStatus: 'approved', accountStatus: 'active' });
        const specializationsList = availableSpecializations.length > 0 ? availableSpecializations.join(', ') : 'None registered currently';

        // Fetch latest patient vitals
        const latestVitals = await HealthVitals.findOne({ patient: patientId })
            .sort({ recordedAt: -1, createdAt: -1 });

        let vitalsText = "None recorded yet";
        if (latestVitals) {
            const bp = (latestVitals.systolicBP && latestVitals.diastolicBP)
                ? `${latestVitals.systolicBP}/${latestVitals.diastolicBP} mmHg`
                : 'Not recorded';
            vitalsText = `
                - Heart Rate: ${latestVitals.heartRate ? latestVitals.heartRate + ' bpm' : 'Not recorded'}
                - Blood Pressure: ${bp}
                - Temperature: ${latestVitals.temperature ? latestVitals.temperature + ' °F' : 'Not recorded'}
                - Oxygen Level: ${latestVitals.oxygenLevel ? latestVitals.oxygenLevel + ' %' : 'Not recorded'}
                - Weight: ${latestVitals.weight ? latestVitals.weight + ' kg' : 'Not recorded'}
                - Blood Sugar: ${latestVitals.bloodSugar ? latestVitals.bloodSugar + ' mg/dL' : 'Not recorded'}
                - Recorded At: ${new Date(latestVitals.recordedAt).toLocaleString()}
                - Source: ${latestVitals.source}
            `;
        }

        // Build system prompt based on mode
        let systemPrompt;

        if (mode === 'continue_ai') {
            // Patient chose "Continue with AI" — provide safe general guidance
            systemPrompt = `You are MediAI, a calm, empathetic medical intake assistant continuing a conversation with a patient.
                Patient Profile:
                - Name: ${fullName}
                - Age: ${age || 'Unknown'}
                - Sex: ${sex || 'Unknown'}
                - Blood Group: ${bloodGroup || 'Unknown'}
                - Allergies: ${allergies?.join(', ') || 'None'}
                - Current Medications: ${currentMedications?.join(', ') || 'None'}
                - Medical History: ${previousDiseaseHistory?.join(', ') || 'None'}
                - Latest Patient Vitals: ${vitalsText}

                CRITICAL RULES FOR CONTINUE MODE:
                1. The patient has already received an initial assessment and chose to continue with AI guidance instead of consulting a doctor immediately.
                2. You must provide safe, general health guidance only. Focus on:
                   - Rest, hydration, diet, and lifestyle adjustments
                   - What symptoms to monitor and when to seek emergency help
                   - General wellness advice relevant to their symptoms
                   - Answering their follow-up health questions clearly and empathetically
                3. Do NOT prescribe strong medications or prescription-only drugs. You may mention common OTC options (like paracetamol for mild pain) only if safe given their allergies, with a disclaimer.
                4. Do NOT give false assurance. Never say "everything is fine" unless symptoms are clearly mild.
                5. SAFETY MONITORING: If the patient mentions new or worsening symptoms that indicate HIGH RISK or EMERGENCY, or if their Latest Patient Vitals show abnormal / dangerous trends (e.g. oxygen levels < 92%, heart rate > 120 or < 50 resting, hypertensive crisis blood pressure >= 180 systolic or >= 120 diastolic, extreme blood sugars), you MUST:
                   - Strongly urge immediate medical attention
                   - Set urgentDoctorNeeded to true
                   - Set emergencyWarning with a clear urgent message
                   - Example: "These symptoms and vital signs could indicate a serious condition. I strongly recommend seeking urgent medical help immediately. Please do not delay."
                6. Remember previous answers from the conversation. Do NOT repeat questions already answered.
                7. Be a supportive, calm listener. Do not interrogate deeply about symptoms.
                8. You have access to doctors on this platform. Currently available specializations: ${specializationsList}. If the patient wants to consult a specialist that is NOT in this list, you MUST tell them clearly that the specialist is not available on this platform.

                You must return a JSON response with these fields:
                - followUpQuestion (string - your conversational response, advice, or follow-up question)
                - urgentDoctorNeeded (boolean - set to true ONLY if you detect high-risk/emergency symptoms that require immediate medical attention)
                - emergencyWarning (string, optional - urgent warning message if urgentDoctorNeeded is true)
                - recommendedSpecialization (string, optional - if urgentDoctorNeeded is true, specify the specialist)`;
        } else {
            // Default assessment mode
            systemPrompt = `You are MediAI, an AI Symptom Checker for Medi AI.
                Your goal is to provide a safe preliminary assessment, not a diagnosis.

                Patient Profile:
                - Name: ${fullName}
                - Age: ${age || 'Unknown'}
                - Sex: ${sex || 'Unknown'}
                - Blood Group: ${bloodGroup || 'Unknown'}
                - Allergies: ${allergies?.join(', ') || 'None'}
                - Current Medications: ${currentMedications?.join(', ') || 'None'}
                - Medical History: ${previousDiseaseHistory?.join(', ') || 'None'}
                - Latest Patient Vitals: ${vitalsText}
                
                Platform Information:
                - Currently Available Doctor Specializations on Platform: ${specializationsList}

                RULES:
                1. Ask between 4 and 6 targeted follow-up questions before generating an assessment.
                2. Do not generate an assessment after only 1-2 questions UNLESS the user explicitly asks for a diagnosis, medicine, treatment, or to consult a doctor.
                3. Do not ask more than 6 questions unless a red-flag symptom is detected.
                4. Keep questions short and conversational.
                5. Each new question should depend on previous answers.
                6. IMPORTANT: If the user explicitly asks for medicine, cream, treatment, or to consult a doctor, STOP asking questions immediately and provide your full assessment.

                QUESTION PRIORITY (For every symptom, gather):
                - Severity (mild, moderate, severe or 1-10)
                - Duration
                - Location of symptom
                - Associated symptoms
                - Relevant triggers or recent events

                RED FLAG SCREENING:
                Always check for dangerous symptoms when relevant: Chest pain, Difficulty breathing, Loss of consciousness, Severe bleeding, High fever, Sudden severe headache, Severe abdominal pain, Neurological symptoms (weakness, confusion, vision changes).
                If red flags are detected:
                - Set riskLevel = High
                - Recommend immediate medical attention (set emergencyWarning)
                - Stop asking unnecessary questions and provide assessment immediately.

                ASSESSMENT FORMAT:
                Risk Level:
                - Low, Medium, High, Critical

                Possible Conditions:
                - Show 1-3 possible conditions in possibleCondition
                - Never claim certainty. Use phrases like "may be" or "could be"

                Recommended Specialist:
                - Select medically appropriate specialist.
                - If the appropriate specialist is available on the platform, set recommendedSpecialization.
                - If the specialist is unavailable on the platform, DO NOT set recommendedSpecialization. Instead, append exactly this format to your preventionAdvice:
                  "Recommended Specialist: [Specialist]"
                  "Available Doctor on Platform: [Available Specialization or None]"

                Advice:
                - Provide safe self-care recommendations in preventionAdvice
                - Encourage consultation if symptoms persist or worsen

                MEDICATION SAFETY:
                - Only suggest OTC medication when appropriate (in suggestedPrescriptions).
                - Before suggesting medication, verify: Age group, Pregnancy status (when relevant), Allergies (if relevant)

                CONFIDENCE RULES:
                - 4 Questions Answered: Low Confidence
                - 5 Questions Answered: Medium Confidence
                - 6 Questions Answered: Higher Confidence

                IMPORTANT:
                The user should feel that the AI is thorough but efficient. Target assessment time: 30-60 seconds. Target question count: 4-6 questions. Never present information as a definitive diagnosis. Always include a medical disclaimer.

                You must return a JSON response strictly with the following fields:
                - followUpQuestion (string - use for questions or conversational replies. Leave EMPTY when providing a full assessment.)
                - possibleCondition (string, only when providing full assessment)
                - riskLevel (string: Low, Medium, High, Critical — only when assessing)
                - recommendedSpecialization (string, optional - ONLY provide this if the exactly matching specialist is present in the available list)
                - preventionAdvice (string, only when assessing)
                - emergencyWarning (string, optional — only for High/Critical risk situations)
                - suggestedPrescriptions (array of objects, max 3 items. Each: name, type (must be "OTC" only), dosage, duration, notes. Always check patient allergies first.)`;
        }

        // Build user message — include image for vision analysis if imageUrl provided
        let userContent;
        if (imageUrl) {
            userContent = [
                {
                    type: 'text',
                    text: symptoms
                        ? `${symptoms}\n\n[Patient has uploaded a medical image for analysis. Please examine the image carefully for visible symptoms such as swelling, redness, rash, wound, skin infection, or allergic reaction, and incorporate your visual findings into your assessment.]`
                        : '[Patient has uploaded a medical image for analysis. Please examine the image carefully for visible symptoms such as swelling, redness, rash, wound, skin infection, or allergic reaction, and provide your assessment.]'
                },
                {
                    type: 'image_url',
                    image_url: { url: imageUrl, detail: 'high' }
                }
            ];
        } else {
            userContent = symptoms;
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...previousMessages,
            { role: 'user', content: userContent }
        ];


        let modelToUse = process.env.AI_MODEL || 'grok-beta';
        let clientToUse = aiClient;

        if (imageUrl) {
            const groqPrefixes = ['llama', 'mixtral', 'gemma', 'whisper', 'qwen', 'openai', 'allam', 'groq'];
            const isGroq = groqPrefixes.some(p => modelToUse.toLowerCase().startsWith(p));
            if (isGroq) {
                // Groq decommissioned Llama 3.2 vision. The active vision model is qwen/qwen3.6-27b
                modelToUse = 'qwen/qwen3.6-27b'; 
            } else {
                modelToUse = 'grok-2-vision-1212'; // xAI vision model
            }
        }

        let response;
        try {
            response = await clientToUse.chat.completions.create({
                model: modelToUse,
                messages,
                response_format: { type: 'json_object' }
            });
        } catch (initialError) {
            if ((initialError.status === 404 || initialError.status === 400) && !imageUrl) {
                console.warn(`Model ${modelToUse} failed with ${initialError.status}. Falling back to openai/gpt-oss-120b...`);
                response = await clientToUse.chat.completions.create({
                    model: 'openai/gpt-oss-120b',
                    messages
                });
            } else {
                throw initialError;
            }
        }

        const aiResponse = JSON.parse(response.choices[0].message.content);

        // Create an audit log for patient activity tracking
        await createAuditLog({
            action: mode === 'continue_ai' ? 'ai_chat' : 'symptom_check',
            req,
            target: mode === 'continue_ai' ? 'AI Chat' : 'Symptom Check',
            details: {
                symptoms,
                riskLevel: aiResponse.riskLevel || 'Low',
                possibleCondition: aiResponse.possibleCondition || 'N/A'
            }
        });

        // Fetch matching approved and active doctors from MongoDB based on AI recommendedSpecialization
        let recommendedDoctors = [];
        if (aiResponse.recommendedSpecialization) {
            const cleanSpec = aiResponse.recommendedSpecialization.trim();
            const docs = await Doctor.find({
                verificationStatus: 'approved',
                accountStatus: 'active',
                specialization: { $regex: new RegExp(cleanSpec, 'i') }
            }).select('-password');

            recommendedDoctors = await Promise.all(docs.map(async (doc) => {
                const computed = await computeDoctorStatus(doc);
                const docObj = doc.toObject();
                docObj.onlineStatus = computed;
                return docObj;
            }));
        }

        aiResponse.recommendedDoctors = recommendedDoctors;

        res.status(200).json({ success: true, data: aiResponse });
    } catch (error) {
        console.error('AI Symptom Check Error:', error.response?.data || error.message || error);
        
        let errorMessage = "AI request failed. Please try again.";
        const apiError = error.response?.data?.error || error.response?.data || error.message;
        const statusCode = error.status || error.response?.status || 500;

        if (statusCode === 403 && typeof apiError === 'string' && apiError.toLowerCase().includes('credits')) {
            errorMessage = "Your xAI API Key is completely out of credits. Please add credits to your xAI account to use Image Analysis.";
        } else if (statusCode === 400 && typeof apiError === 'string' && apiError.toLowerCase().includes('decommissioned')) {
             errorMessage = "The Groq AI Vision model has been permanently decommissioned by the provider.";
        } else if (statusCode === 429) {
             errorMessage = "Too many requests. Please wait a moment before sending another message.";
        }

        res.status(statusCode).json({ 
            success: false, 
            message: errorMessage,
            error: apiError
        });
    }
};
