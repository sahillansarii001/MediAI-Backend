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

                QUESTION PRIORITY (Ask ONE question at a time in clinical sequence):
                1. Duration & Onset: When did it begin, and was it sudden or gradual?
                2. Severity & Quality: Pain scale (1-10) and description (dull, sharp, throbbing, aching)?
                3. Exact Anatomical Location & Radiation: Where is it felt, and does it spread?
                4. Associated Systemic Symptoms: Fever, chills, nausea, vomiting, shortness of breath, dizziness?
                5. Aggravating & Relieving Factors: What makes it better or worse (posture, rest, food)?

                RED FLAG SCREENING (Immediate Emergency Threshold):
                If dangerous red-flag signs are reported (e.g., crushing substernal chest pressure, sudden severe thunderclap headache, facial droop/arm weakness, hemoptysis, acute dyspnea, anaphylactic airway compromise):
                - Immediately set isAssessmentReady = true
                - Set riskLevel = "Critical" or "High"
                - Set emergencyWarning = "Immediate emergency medical attention required. Please dial emergency services or press the SOS button."
                - Set followUpQuestion = null

                ASSESSMENT & TRIAGE STANDARDS:
                - Risk Level: Exactly one of ["Low", "Medium", "High", "Critical"]
                - Possible Conditions: 1 to 3 non-definitive clinical differentials (e.g. "Probable Viral Upper Respiratory Infection, Acute Sinusitis")
                - Recommended Specialist: Match from registered specialties on platform: ${specializationsList}
                - Suggested Prescriptions: List maximum 2-3 common over-the-counter supportive medications (e.g. Acetaminophen/Paracetamol, Saline nasal spray, ORS) ONLY if patient has no known allergies. Never suggest prescription-only antibiotics or controlled substances.

                OUTPUT FORMAT:
                You MUST return ONLY a single, valid JSON object with NO preamble or conversational text outside the JSON:
                {
                  "followUpQuestion": "string (next intake question) or null if isAssessmentReady is true",
                  "isAssessmentReady": boolean,
                  "possibleCondition": "string or null",
                  "riskLevel": "Low | Medium | High | Critical or null",
                  "recommendedSpecialization": "string or null",
                  "preventionAdvice": "string or null",
                  "emergencyWarning": "string or null",
                  "suggestedPrescriptions": [
                    { "name": "string", "dosage": "string", "frequency": "string", "instructions": "string" }
                  ]
                }`;
        }

        // Build user message — include image for vision analysis if imageUrl provided
        let userContent;
        if (imageUrl) {
            userContent = [
                {
                    type: 'text',
                    text: symptoms
                        ? `${symptoms}\n\n[Clinical Inspection Context: Patient uploaded a medical image. Examine carefully for visible signs of swelling, erythema, rash, laceration, infection, or discoloration and synthesize observations.]`
                        : '[Clinical Inspection Context: Patient uploaded a medical image. Examine carefully for visible signs of swelling, erythema, rash, laceration, infection, or discoloration and synthesize observations.]'
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

        // Determine active AI configuration (Google Gemini or Groq)
        const { getAIProviderConfig } = await import('../utils/aiClient.js');
        const activeAI = getAIProviderConfig();

        let modelToUse = activeAI.model;
        let clientToUse = activeAI.client;

        if (imageUrl) {
            if (activeAI.provider === 'Google Gemini') {
                modelToUse = 'gemini-3.5-flash-lite';
            } else {
                modelToUse = 'qwen/qwen3.8-27b';
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
            console.warn(`[AI Engine] ${activeAI.provider} model ${modelToUse} failed:`, initialError.message || initialError);
            
            // Automatic failover between primary model and fallback model
            try {
                const fallbackModel = activeAI.fallbackModel || (activeAI.provider === 'Groq' ? 'allam-2-7b' : 'gemini-3.8-flash');
                console.log(`[AI Engine] Retrying with failover model: ${fallbackModel}...`);
                response = await clientToUse.chat.completions.create({
                    model: fallbackModel,
                    messages,
                    response_format: { type: 'json_object' }
                });
            } catch (fallbackError) {
                // If primary provider completely failed, attempt alternate provider (Gemini <-> Groq)
                const alternateProvider = activeAI.provider === 'Google Gemini' ? 'qwen/qwen3.8-27b' : 'gemini-3.5-flash-lite';
                const altAI = getAIProviderConfig(alternateProvider);
                console.log(`[AI Engine] Switching provider to ${altAI.provider} (${altAI.model})...`);
                response = await altAI.client.chat.completions.create({
                    model: altAI.model,
                    messages,
                    response_format: { type: 'json_object' }
                });
            }
        }

        let aiResponse;
        try {
            const rawText = response.choices[0].message.content.trim();
            // Handle cases where model wraps JSON in markdown fences
            const cleanJson = rawText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
            aiResponse = JSON.parse(cleanJson);
        } catch (parseErr) {
            console.error('[AI Engine] Failed to parse model JSON output:', parseErr);
            aiResponse = {
                followUpQuestion: "Could you describe where and when you first noticed these symptoms?",
                isAssessmentReady: false
            };
        }

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
