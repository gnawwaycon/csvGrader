import React, { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';

// Spinner SVG component
const Spinner = () => (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
);

// StudentCard Component
const StudentCard = ({
    name, sisid, codeHTML, score, onScoreChange,
    comment, onCommentChange,
    onAiGrade, gradingStatus, aiEnabled
}) => (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-md overflow-hidden transition-transform duration-300 hover:scale-[1.02]">
        <div className="p-4 bg-gray-700/50 border-b border-gray-600 flex justify-between items-center flex-wrap gap-4">
            <div>
                <h2 className="text-xl font-semibold text-white">{name}</h2>
                <p className="text-sm text-gray-400">SISID: {sisid}</p>
            </div>
            <div className="flex items-center space-x-2">
                <button
                    onClick={onAiGrade}
                    disabled={!aiEnabled || gradingStatus === 'loading'}
                    className="bg-amber-600 text-white text-sm font-medium py-1.5 px-3 rounded-full hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300"
                >
                    {gradingStatus === 'loading' ? (
                        <span className="flex items-center gap-1">
                            <Spinner />
                            Grading...
                        </span>
                    ) : gradingStatus === 'done' ? (
                        'Re-grade'
                    ) : gradingStatus === 'error' ? (
                        'Retry'
                    ) : (
                        'AI Grade'
                    )}
                </button>
                <label htmlFor={`score-${sisid}`} className="text-sm font-medium text-gray-300">Score:</label>
                <input
                    type="number"
                    id={`score-${sisid}`}
                    value={score}
                    onChange={(e) => onScoreChange(e.target.value)}
                    placeholder="Enter score"
                    className="w-28 bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
                />
            </div>
        </div>
        <div className="p-4 bg-black/20 text-sm">
            {/* Using dangerouslySetInnerHTML because the CSV content is trusted HTML */}
            <div dangerouslySetInnerHTML={{ __html: codeHTML || '<p class="text-gray-400">No code submitted.</p>' }} />
        </div>
        <div className="p-4 border-t border-gray-700">
            <label htmlFor={`comment-${sisid}`} className="block text-sm font-medium text-gray-400 mb-1">
                Feedback Comment
            </label>
            <textarea
                id={`comment-${sisid}`}
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                placeholder="Type feedback for this student..."
                rows={3}
                className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 resize-y"
            />
        </div>
    </div>
);

// Placeholder Component
const Placeholder = ({ title, message }) => (
    <div className="text-center text-gray-500 py-10 border-2 border-dashed border-gray-700 rounded-lg">
        <h3 className="text-xl font-semibold">{title}</h3>
        <p>{message}</p>
    </div>
);


// Main App Component
function App() {
    const [submissions, setSubmissions] = useState([]);
    const [error, setError] = useState(null);
    const [assignmentName, setAssignmentName] = useState('');
    const [assignmentId, setAssignmentId] = useState('');

    // AI Grading state
    const [question, setQuestion] = useState('');
    const [rubric, setRubric] = useState('');
    const [maxScore, setMaxScore] = useState('');
    const [gradingStatus, setGradingStatus] = useState({}); // { [studentId]: 'idle' | 'loading' | 'done' | 'error' }
    const [gradingProgress, setGradingProgress] = useState({ current: 0, total: 0, active: false });
    const gradingAbortedRef = useRef(false);

    const handleFileUpload = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;

        setError(null);
        setSubmissions([]);
        setGradingStatus({});

        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                // Remove header row
                const dataRows = results.data.slice(1);
                if (dataRows.length === 0) {
                    setError("No data found in the CSV. It might be empty or formatted incorrectly.");
                    return;
                }

                const parsedSubmissions = dataRows.map((columns, index) => {
                    // Expecting Name in Col A, SISID in Col C, Code in Col L
                    if (columns.length > 11) {
                        return {
                            id: index,
                            name: columns[0]?.trim() || 'N/A',
                            sisid: columns[2]?.trim() || 'N/A',
                            code: columns[11]?.trim() || 'No code submitted.',
                            score: '', // Initialize score as empty
                            comment: '',
                        };
                    }
                    return null;
                }).filter(Boolean); // Filter out any null entries from malformed rows

                if (parsedSubmissions.length === 0) {
                     setError("Could not parse any valid student rows from the CSV.");
                     return;
                }

                // Sort submissions by SISID
                parsedSubmissions.sort((a, b) => a.sisid.localeCompare(b.sisid, undefined, { numeric: true }));

                setSubmissions(parsedSubmissions);
            },
            error: (err) => {
                setError(`Failed to parse CSV: ${err.message}`);
            },
        });
    }, []);

    const handleScoreChange = useCallback((id, newScore) => {
        setSubmissions(prevSubmissions =>
            prevSubmissions.map(sub =>
                sub.id === id ? { ...sub, score: newScore } : sub
            )
        );
    }, []);

    const handleCommentChange = useCallback((id, newComment) => {
        setSubmissions(prevSubmissions =>
            prevSubmissions.map(sub =>
                sub.id === id ? { ...sub, comment: newComment } : sub
            )
        );
    }, []);

    // --- AI Grading ---

    const gradeStudent = async (studentCode) => {
        const response = await fetch('/api/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentCode,
                question,
                rubric,
                maxScore: maxScore || undefined,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        return response.json();
    };

    const handleGradeOne = useCallback(async (id) => {
        if (!question.trim() || !rubric.trim()) {
            setError('Please enter both the assignment question and rubric before using AI grading.');
            return;
        }

        const student = submissions.find(s => s.id === id);
        if (!student) return;

        setError(null);
        setGradingStatus(prev => ({ ...prev, [id]: 'loading' }));

        try {
            const result = await gradeStudent(student.code);
            setSubmissions(prev =>
                prev.map(sub =>
                    sub.id === id
                        ? { ...sub, score: String(result.score), comment: result.comment }
                        : sub
                )
            );
            setGradingStatus(prev => ({ ...prev, [id]: 'done' }));
        } catch (err) {
            console.error('Grading error:', err);
            setGradingStatus(prev => ({ ...prev, [id]: 'error' }));
            setError(`Failed to grade ${student.name}: ${err.message}`);
        }
    }, [submissions, question, rubric, maxScore]);

    const handleGradeAll = useCallback(async () => {
        if (!question.trim() || !rubric.trim()) {
            setError('Please enter both the assignment question and rubric before using AI grading.');
            return;
        }

        setError(null);
        gradingAbortedRef.current = false;
        setGradingProgress({ current: 0, total: submissions.length, active: true });

        for (let i = 0; i < submissions.length; i++) {
            if (gradingAbortedRef.current) break;

            const student = submissions[i];
            setGradingStatus(prev => ({ ...prev, [student.id]: 'loading' }));

            try {
                const result = await gradeStudent(student.code);
                setSubmissions(prev =>
                    prev.map(sub =>
                        sub.id === student.id
                            ? { ...sub, score: String(result.score), comment: result.comment }
                            : sub
                    )
                );
                setGradingStatus(prev => ({ ...prev, [student.id]: 'done' }));
            } catch (err) {
                console.error(`Grading error for ${student.name}:`, err);
                setGradingStatus(prev => ({ ...prev, [student.id]: 'error' }));
            }

            setGradingProgress(prev => ({ ...prev, current: i + 1 }));
        }

        setGradingProgress(prev => ({ ...prev, active: false }));
    }, [submissions, question, rubric, maxScore]);

    const handleAbortGrading = useCallback(() => {
        gradingAbortedRef.current = true;
    }, []);

    // --- Export ---

    const handleExport = useCallback(() => {
        if (submissions.length === 0) {
            setError("No data to export.");
            return;
        }

        const exportData = submissions.map(({ name, sisid, score }) => ({
            'Name': name,
            'SISID': sisid,
            'Score': score || '0',
        }));

        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'student_scores.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [submissions]);

    const handleExportComments = useCallback(() => {
        if (submissions.length === 0) {
            setError("No data to export.");
            return;
        }
        if (!assignmentName.trim() || !assignmentId.trim()) {
            setError("Please enter both the Assignment Name and Assignment ID for the Canvas comment export.");
            return;
        }

        const assignmentColumn = `${assignmentName.trim()} (${assignmentId.trim()})`;
        const studentsWithComments = submissions.filter(s => s.comment.trim() !== '');

        if (studentsWithComments.length === 0) {
            setError("No comments to export. Add feedback to at least one student.");
            return;
        }

        const exportData = studentsWithComments.map(({ sisid, comment }) => ({
            'ID': sisid,
            [assignmentColumn]: comment,
        }));

        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'canvas_comments.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [submissions, assignmentName, assignmentId]);

    const aiEnabled = question.trim() !== '' && rubric.trim() !== '' && !gradingProgress.active;

    return (
        <div style={{ fontFamily: "'Inter', sans-serif" }} className="bg-gray-900 text-gray-100 min-h-screen flex items-start justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Student Code Submission Grader</h1>
                    <p className="text-lg text-gray-400">Upload a CSV to display student names (Column A), SISIDs (Column B), and code (Column L). Then, enter scores and export.</p>
                </header>

                <main>
                    {/* File Upload & Export Section */}
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8 shadow-lg flex flex-col sm:flex-row gap-4 items-center">
                        <div className="flex-grow w-full">
                             <label htmlFor="csvFileInput" className="block text-sm font-medium text-gray-300 mb-2">Upload CSV File</label>
                             <input
                                type="file"
                                id="csvFileInput"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                            />
                        </div>
                        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                           <button
                                onClick={handleExport}
                                disabled={submissions.length === 0}
                                className="w-full sm:w-auto mt-4 sm:mt-0 bg-green-600 text-white font-semibold py-2 px-5 rounded-full hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300"
                           >
                               Export Scores
                           </button>
                           <button
                                onClick={handleExportComments}
                                disabled={submissions.length === 0 || !assignmentName.trim() || !assignmentId.trim()}
                                className="w-full sm:w-auto mt-4 sm:mt-0 bg-purple-600 text-white font-semibold py-2 px-5 rounded-full hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300"
                           >
                               Export Canvas Comments
                           </button>
                        </div>
                    </div>

                    {/* Assignment Metadata + AI Grading Setup */}
                    {submissions.length > 0 && (
                        <>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4 shadow-lg flex flex-col sm:flex-row gap-4 items-end">
                                <div className="flex-grow">
                                    <label htmlFor="assignmentName" className="block text-sm font-medium text-gray-300 mb-1">
                                        Assignment Name
                                    </label>
                                    <input
                                        type="text"
                                        id="assignmentName"
                                        value={assignmentName}
                                        onChange={(e) => setAssignmentName(e.target.value)}
                                        placeholder="e.g. HTML Quiz 3"
                                        className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
                                    />
                                </div>
                                <div className="w-full sm:w-40">
                                    <label htmlFor="assignmentId" className="block text-sm font-medium text-gray-300 mb-1">
                                        Assignment ID
                                    </label>
                                    <input
                                        type="text"
                                        id="assignmentId"
                                        value={assignmentId}
                                        onChange={(e) => setAssignmentId(e.target.value)}
                                        placeholder="e.g. 52789"
                                        className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 pb-1">
                                    Find in Canvas URL: /courses/.../assignments/<strong className="text-gray-400">ID</strong>
                                </p>
                            </div>

                            {/* AI Grading Setup */}
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-8 shadow-lg">
                                <h3 className="text-lg font-semibold text-white mb-3">AI Grading Setup</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="questionInput" className="block text-sm font-medium text-gray-300 mb-1">
                                            Assignment Question / Prompt
                                        </label>
                                        <textarea
                                            id="questionInput"
                                            value={question}
                                            onChange={(e) => setQuestion(e.target.value)}
                                            placeholder="Paste the assignment question or prompt here..."
                                            rows={4}
                                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 resize-y"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="rubricInput" className="block text-sm font-medium text-gray-300 mb-1">
                                            Grading Rubric
                                        </label>
                                        <textarea
                                            id="rubricInput"
                                            value={rubric}
                                            onChange={(e) => setRubric(e.target.value)}
                                            placeholder="Describe the grading rubric (criteria, point values, etc.)..."
                                            rows={4}
                                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 resize-y"
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-end gap-4">
                                        <div className="w-32">
                                            <label htmlFor="maxScoreInput" className="block text-sm font-medium text-gray-300 mb-1">
                                                Max Score
                                            </label>
                                            <input
                                                type="number"
                                                id="maxScoreInput"
                                                value={maxScore}
                                                onChange={(e) => setMaxScore(e.target.value)}
                                                placeholder="e.g. 10"
                                                className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
                                            />
                                        </div>
                                        <button
                                            onClick={handleGradeAll}
                                            disabled={!question.trim() || !rubric.trim() || gradingProgress.active}
                                            className="bg-amber-600 text-white font-semibold py-2 px-5 rounded-full hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300"
                                        >
                                            {gradingProgress.active ? (
                                                <span className="flex items-center gap-2">
                                                    <Spinner />
                                                    Grading All...
                                                </span>
                                            ) : (
                                                'Grade All with AI'
                                            )}
                                        </button>
                                        {gradingProgress.active && (
                                            <button
                                                onClick={handleAbortGrading}
                                                className="bg-red-600 text-white font-semibold py-2 px-4 rounded-full hover:bg-red-700 transition-colors duration-300"
                                            >
                                                Stop
                                            </button>
                                        )}
                                    </div>
                                    {/* Progress Bar */}
                                    {gradingProgress.active && (
                                        <div className="mt-2">
                                            <div className="flex justify-between text-sm text-gray-400 mb-1">
                                                <span>Grading progress</span>
                                                <span>{gradingProgress.current} / {gradingProgress.total}</span>
                                            </div>
                                            <div className="w-full bg-gray-700 rounded-full h-2">
                                                <div
                                                    className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                                                    style={{ width: `${(gradingProgress.current / gradingProgress.total) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Results Section */}
                    <div id="resultsContainer" className="space-y-6">
                        {error && (
                            <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">
                                <strong>Error:</strong> {error}
                            </div>
                        )}

                        {submissions.length > 0 ? (
                            submissions.map(submission => (
                                <StudentCard
                                    key={submission.id}
                                    name={submission.name}
                                    sisid={submission.sisid}
                                    codeHTML={submission.code}
                                    score={submission.score}
                                    onScoreChange={(newScore) => handleScoreChange(submission.id, newScore)}
                                    comment={submission.comment}
                                    onCommentChange={(newComment) => handleCommentChange(submission.id, newComment)}
                                    onAiGrade={() => handleGradeOne(submission.id)}
                                    gradingStatus={gradingStatus[submission.id] || 'idle'}
                                    aiEnabled={aiEnabled}
                                />
                            ))
                        ) : !error && (
                            <Placeholder title="No Data to Display" message="Upload a file to get started." />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;
