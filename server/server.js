require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = 3001;

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for large HTML code submissions

// --- Rate Limiter ---
// Gemini 3 Flash free tier: 5 requests/min → 12.5s minimum gap
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 12500;

async function rateLimitedGeminiCall(prompt) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_INTERVAL_MS) {
        const waitTime = MIN_INTERVAL_MS - elapsed;
        console.log(`Rate limiter: waiting ${(waitTime / 1000).toFixed(1)}s before next Gemini call...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastRequestTime = Date.now();

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    score: {
                        type: 'number',
                        description: 'The numeric score for the student submission'
                    },
                    comment: {
                        type: 'string',
                        description: 'Detailed feedback comment for the student'
                    }
                },
                required: ['score', 'comment']
            }
        }
    });

    return JSON.parse(response.text);
}

// --- Prompt Builder ---
function buildGradingPrompt(question, rubric, studentCode, maxScore) {
    return `You are an experienced programming instructor grading student code submissions.

ASSIGNMENT QUESTION:
${question}

GRADING RUBRIC:
${rubric}

${maxScore ? `MAXIMUM SCORE: ${maxScore}` : ''}

STUDENT'S SUBMITTED CODE (HTML from Canvas LMS):
${studentCode}

INSTRUCTIONS:
1. Carefully read the assignment question and rubric.
2. Analyze the student's code submission against the rubric criteria.
3. The student code is HTML content exported from Canvas LMS. Parse through any HTML tags (<p>, <pre>, <code>, <br>, etc.) to read the actual code.
4. If the submission says "No code submitted." or is empty, give a score of 0 and note that nothing was submitted.
5. Provide a numeric score based on the rubric${maxScore ? ` (out of ${maxScore})` : ''}.
6. Provide constructive, specific feedback explaining what the student did well and what needs improvement.
7. Reference specific parts of the rubric in your feedback.
8. Be encouraging but honest.

Respond with a JSON object containing "score" (number) and "comment" (string).`;
}

// --- Routes ---

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the CSV Grader API!' });
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running correctly' });
});

// AI Grading endpoint
app.post('/api/grade', async (req, res) => {
    try {
        const { studentCode, question, rubric, maxScore } = req.body;

        if (!studentCode || !question || !rubric) {
            return res.status(400).json({
                error: 'Missing required fields: studentCode, question, rubric'
            });
        }

        console.log(`Grading submission (${studentCode.length} chars)...`);
        const prompt = buildGradingPrompt(question, rubric, studentCode, maxScore);
        const result = await rateLimitedGeminiCall(prompt);
        console.log(`Grading complete: score=${result.score}`);

        res.json({
            score: result.score,
            comment: result.comment
        });
    } catch (error) {
        console.error('Gemini API error:', error.message || error);
        if (error.status === 429 || (error.message && error.message.includes('429'))) {
            res.status(429).json({
                error: 'Rate limit exceeded. Please wait and try again.'
            });
        } else {
            res.status(500).json({
                error: 'Failed to grade submission: ' + (error.message || 'Unknown error')
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
