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
                1. You MUST ask between 4 and 6 targeted follow-up questions (ONE question at a time) before generating an assessment.
                2. NEVER generate an assessment (do not provide possibleCondition, riskLevel, or preventionAdvice) after only 1, 2, or 3 user answers unless the user explicitly commands you to diagnose immediately or red-flag emergency symptoms are present.
                3. You MUST provide a clear, helpful single follow-up question in 'followUpQuestion' to learn more about their symptom (duration, pain scale 1-10, location, accompanying symptoms, triggers).
                4. When asking a follow-up question, you MUST set 'isAssessmentReady' to false, set 'possibleCondition' to null, and set 'riskLevel' to null.
                5. ONLY when you have asked at least 4 follow-up questions and collected enough clinical context, or if an urgent red-flag emergency is detected, set 'isAssessmentReady' to true, leave 'followUpQuestion' empty or provide closing remarks, and fill in 'possibleCondition', 'riskLevel', and 'preventionAdvice'.

                QUESTION PRIORITY (For every symptom, gather step-by-step):
                - Severity (mild, moderate, severe or 1-10)
                - Duration (when did it start)
                - Location and type (throbbing, sharp, dull, one-sided)
                - Associated symptoms (nausea, light sensitivity, fever)
                - Triggers or recent events (stress, lack of sleep, injury)

                RED FLAG SCREENING:
                If dangerous symptoms are detected (chest pain, loss of consciousness, sudden severe worst-headache-of-life, stroke signs):
                - Set riskLevel = High
                - Set emergencyWarning = "Immediate medical attention required."
                - Set isAssessmentReady = true immediately.

                ASSESSMENT FORMAT:
                Risk Level:
                - Low, Medium, High, Critical

                Possible Conditions:
                - Show 1-3 possible conditions in possibleCondition (e.g. "Tension Headache, Migraine")
                - Never claim certainty. Use phrases like "may be" or "could be"

                Recommended Specialist:
                - Select medically appropriate specialist from available list: ${specializationsList}

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

                You must return a JSON response strictly with the following fields:
                - followUpQuestion (string - your next question to the patient. Leave null/empty ONLY if isAssessmentReady is true)
                - isAssessmentReady (boolean - false if still asking questions, true ONLY when ready to show final assessment)
                - possibleCondition (string or null - only when isAssessmentReady is true)
                - riskLevel (string or null: Low, Medium, High, Critical — only when isAssessmentReady is true)
                - recommendedSpecialization (string, optional - only when isAssessmentReady is true)
                - preventionAdvice (string or null - only when isAssessmentReady is true)
                - emergencyWarning (string, optional - only for High/Critical risk situations)
                - suggestedPrescriptions (array of objects, max 3 items - only when isAssessmentReady is true)`;
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

        // Safety enforcement: If user has had fewer than 4 exchanges in assessment mode,
        // and no emergency warning is flagged, ensure we stay in questioning mode.
        const userExchangeCount = (previousMessages || []).filter(m => m.role === 'user').length + 1;
        const isEmergency = aiResponse.riskLevel === 'Critical' || (aiResponse.emergencyWarning && aiResponse.emergencyWarning.trim() !== '');

        if (mode === 'assess' && !isEmergency && userExchangeCount < 4) {
            // Force question mode
            aiResponse.isAssessmentReady = false;
            if (!aiResponse.followUpQuestion || aiResponse.followUpQuestion.trim() === '') {
                // If model prematurely omitted question, supply an appropriate diagnostic follow-up question
                const questions = [
                    "How long have you been experiencing this symptom, and did it start suddenly or gradually?",
                    "On a scale of 1 to 10, how severe is the pain or discomfort right now?",
                    "Are you experiencing any other accompanying symptoms, such as nausea, dizziness, or fever?",
                    "Have you noticed any specific triggers, or does anything make the symptom better or worse?"
                ];
                aiResponse.followUpQuestion = questions[userExchangeCount - 1] || "Could you describe what makes the symptom feel better or worse?";
            }
            // Strip out premature assessment fields so frontend does not show assessment card
            delete aiResponse.possibleCondition;
            delete aiResponse.riskLevel;
            delete aiResponse.preventionAdvice;
            delete aiResponse.suggestedPrescriptions;
            delete aiResponse.recommendedSpecialization;
        }

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
