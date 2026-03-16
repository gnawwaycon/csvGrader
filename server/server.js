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

// --- Gemini API Call (paid tier — no rate limiting) ---

async function geminiCall(prompt) {
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
function buildGradingPrompt(items, rubric, maxScore) {
    const itemsText = items.map((item, idx) => {
        return `--- QUESTION ${idx + 1} ---
${item.questionText}

STUDENT'S CODE FOR QUESTION ${idx + 1} (HTML from Canvas LMS):
${item.code}`;
    }).join('\n\n');

    return `You are an experienced programming instructor grading student code submissions.

This submission has ${items.length} question${items.length > 1 ? 's' : ''}. Grade all questions together and provide a CUMULATIVE score.

${itemsText}

GRADING RUBRIC:
${rubric}

${maxScore ? `MAXIMUM TOTAL SCORE: ${maxScore}` : ''}

INSTRUCTIONS:
1. Carefully read each question and the student's code for it.
2. The student code is HTML content exported from Canvas LMS. Parse through any HTML tags (<p>, <pre>, <code>, <br>, etc.) to read the actual code.
3. If a submission says "No code submitted." or only contains a name, give 0 for that question.
4. Provide a CUMULATIVE numeric score across all questions based on the rubric${maxScore ? ` (out of ${maxScore})` : ''}.
5. Provide constructive, specific feedback for each question, explaining what the student did well and what needs improvement.
6. Reference specific parts of the rubric in your feedback.
7. Be encouraging but honest.

Respond with a JSON object containing "score" (number — cumulative total) and "comment" (string — combined feedback for all questions).`;
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
        const { items, rubric, maxScore } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0 || !rubric) {
            return res.status(400).json({
                error: 'Missing required fields: items (array), rubric'
            });
        }

        const totalChars = items.reduce((sum, item) => sum + (item.code || '').length, 0);
        console.log(`Grading submission (${items.length} items, ${totalChars} chars)...`);
        const prompt = buildGradingPrompt(items, rubric, maxScore);
        const result = await geminiCall(prompt);
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
