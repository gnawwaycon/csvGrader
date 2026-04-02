require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = 3001;

const MODEL = 'gemini-3.1-pro-preview';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Context Cache State ---
let currentCache = null;  // { name, rubricKey }

// Build a key to detect when rubric/questions change
function buildCacheKey(questionTexts, rubric, maxScore) {
    return JSON.stringify({ questionTexts, rubric, maxScore });
}

// Build the static system instruction (rubric + AP rules + question texts)
function buildSystemInstruction(questionTexts, rubric, maxScore) {
    const questionsBlock = questionTexts.map((q, idx) =>
        `QUESTION ${idx + 1}: ${q}`
    ).join('\n');

    return `You are an experienced AP Computer Science A exam reader grading student code submissions according to official College Board scoring guidelines.

There are ${questionTexts.length} question${questionTexts.length > 1 ? 's' : ''} on this assignment. Grade all questions together and provide a CUMULATIVE score.

QUESTIONS ON THIS ASSIGNMENT:
${questionsBlock}

GRADING RUBRIC:
${rubric}

${maxScore ? `MAXIMUM TOTAL SCORE: ${maxScore}` : ''}

=== AP® COMPUTER SCIENCE A UNIVERSAL SCORING RULES ===

Apply the question scoring criteria (rubric) first — it always takes precedence. Penalty points can only be deducted in a part of the question that has earned credit via the rubric. No part of a question may have a negative point total. A given penalty can be assessed only once per question, even if it occurs multiple times or in multiple parts. A maximum of 3 penalty points may be assessed per question.

1-POINT PENALTIES (assess at most once each per question):
v) Array/collection access confusion (e.g., mixing [] and get)
w) Extraneous code that causes a side-effect (e.g., printing to output, incorrect precondition check)
x) Local variables used but none declared
y) Destruction of persistent data (e.g., changing value referenced by parameter)
z) Void method or constructor that returns a value

NO PENALTY — do NOT deduct for any of the following:
• Extraneous code with no side-effect (e.g., valid precondition check, no-op)
• Spelling/case discrepancies where there is no ambiguity (e.g., "ArayList" for "ArrayList") — only penalize if the context does NOT allow unambiguous inference
• Local variable not declared provided other variables are declared in some part
• private or public qualifier on a local variable
• Missing public qualifier on class or constructor header
• Keyword used as an identifier
• Common mathematical symbols used for operators (× • ÷ ≤ ≥ <> ≠)
• [] vs. () vs. <>
• = instead of == and vice versa
• length/size confusion for array, String, List, or ArrayList; with or without ()
• Extraneous [] when referencing entire array
• [i,j] instead of [i][j]
• Extraneous size in array declaration, e.g., int[size] nums = new int[size];
• Missing ; where structure clearly conveys intent
• Missing { } where indentation clearly conveys intent
• Missing () on parameter-less method or constructor invocations
• Missing () around if or while conditions
• : instead of ; and vice versa
• , instead of ; and vice versa

DIGITAL SUBMISSION RULES:
• Some non-ASCII characters may not print correctly. If a badly displayed character makes sense as standard punctuation, evaluate accordingly.
• If there are missing closing double-quotes or closing parentheses, assume they are at the end of the line where they opened.
• Assume an open curly bracket { immediately after any method or class header that does not already have one.
• Assume appropriate closing brackets before any method header to close all open brackets from the previous method or constructor.
• If there are missing curly brackets, clear indentation can "convey intent" — evaluate accordingly.
• Inside a method with left-justified code, indentation cannot "convey intent", so missing curly brackets cannot be assumed.

=== END UNIVERSAL SCORING RULES ===

INSTRUCTIONS:
1. Carefully read each question and the student's code for it.
2. If a submission says "No code submitted." or only contains a name, give 0 for that question.
3. Apply the rubric FIRST to determine earned points, then assess penalties per the AP universal rules above.
4. Provide a CUMULATIVE numeric score across all questions${maxScore ? ` (out of ${maxScore})` : ''}.
5. Provide constructive, specific feedback for each question, explaining what the student did well and what needs improvement.
6. Reference specific parts of the rubric in your feedback. If penalties are applied, state which penalty category (v/w/x/y/z) and why.

Respond with a JSON object containing "score" (number — cumulative total) and "comment" (string — combined feedback for all questions).`;
}

// Get or create a context cache for this grading session
async function getOrCreateCache(questionTexts, rubric, maxScore) {
    const key = buildCacheKey(questionTexts, rubric, maxScore);

    // Reuse existing cache if rubric/questions haven't changed
    if (currentCache && currentCache.rubricKey === key) {
        console.log('Reusing existing context cache.');
        return currentCache.name;
    }

    // Delete old cache if it exists
    if (currentCache) {
        try {
            await ai.caches.delete({ name: currentCache.name });
            console.log('Deleted old context cache.');
        } catch (e) {
            // Ignore deletion errors (cache may have expired)
        }
    }

    const systemInstruction = buildSystemInstruction(questionTexts, rubric, maxScore);

    console.log('Creating new context cache...');
    const cached = await ai.caches.create({
        model: MODEL,
        config: {
            systemInstruction,
            displayName: 'grading-session',
            ttl: '3600s', // 1 hour
        }
    });

    currentCache = { name: cached.name, rubricKey: key };
    console.log(`Context cache created: ${cached.name} (tokens: ${cached.usageMetadata?.totalTokenCount || '?'})`);
    return cached.name;
}

// --- HTML Cleaner ---
function cleanHtml(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\t/g, '    ')
        .replace(/ {2,}/g, m => m)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// --- Per-Student Prompt (only the code, since rubric/questions are cached) ---
function buildStudentPrompt(items) {
    return items.map((item, idx) =>
        `--- STUDENT'S CODE FOR QUESTION ${idx + 1} ---\n${cleanHtml(item.code)}`
    ).join('\n\n');
}

// --- Gemini API Call with Context Cache ---
async function geminiCall(studentPrompt, cacheName) {
    const response = await ai.models.generateContent({
        model: MODEL,
        contents: studentPrompt,
        config: {
            cachedContent: cacheName,
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

        // Get or create context cache for the static parts
        const questionTexts = items.map(item => item.questionText);
        const cacheName = await getOrCreateCache(questionTexts, rubric, maxScore);

        // Build per-student prompt (just the code)
        const studentPrompt = buildStudentPrompt(items);
        const totalChars = items.reduce((sum, item) => sum + (item.code || '').length, 0);
        console.log(`Grading submission (${items.length} items, ${totalChars} chars, cached)...`);

        const result = await geminiCall(studentPrompt, cacheName);
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
