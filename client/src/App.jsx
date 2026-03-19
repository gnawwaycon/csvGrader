import React, { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';

// Spinner SVG component
const Spinner = () => (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
);

// StudentCard Component — now shows multiple items per student
const StudentCard = ({
    name, sisid, items, score, onScoreChange,
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
        {/* Render each item */}
        {items.map((item, idx) => (
            <div key={idx} className="border-b border-gray-700 last:border-b-0">
                <div className="px-4 pt-3 pb-1">
                    <p className="text-xs font-semibold text-amber-400 mb-1">Question {idx + 1}</p>
                    <p className="text-sm text-gray-300 mb-2">{item.questionText}</p>
                </div>
                <div className="px-4 pb-3 bg-black/20 text-sm">
                    <div dangerouslySetInnerHTML={{ __html: item.code || '<p class="text-gray-400">No code submitted.</p>' }} />
                </div>
            </div>
        ))}
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
    const [rubric, setRubric] = useState('');
    const [maxScore, setMaxScore] = useState('');
    const [curveExponent, setCurveExponent] = useState('1.5');
    const [gradingStatus, setGradingStatus] = useState({});
    const [gradingProgress, setGradingProgress] = useState({ current: 0, total: 0, active: false });
    const gradingAbortedRef = useRef(false);

    // Parsed item metadata from CSV header
    const [itemMeta, setItemMeta] = useState([]); // [{ colIndex, questionText }]

    const handleFileUpload = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Extract assignment name from filename (before "Student Analysis Report")
        const nameMatch = file.name.match(/^(.+?)\s*Student Analysis Report/i);
        if (nameMatch) {
            setAssignmentName(nameMatch[1].trim());
        }

        setError(null);
        setSubmissions([]);
        setGradingStatus({});
        setItemMeta([]);

        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                const headerRow = results.data[0];
                const dataRows = results.data.slice(1);
                if (dataRows.length === 0) {
                    setError("No data found in the CSV. It might be empty or formatted incorrectly.");
                    return;
                }

                // Detect item groups by scanning for ItemID columns starting at index 9
                // Pattern: ItemID, ItemType, QuestionText/Code, EarnedPoints, Status (5 cols each)
                const detectedItems = [];
                for (let i = 9; i < headerRow.length; i++) {
                    if (headerRow[i] === 'ItemID') {
                        const questionText = (headerRow[i + 2] || '').trim();
                        detectedItems.push({
                            itemIdCol: i,
                            itemTypeCol: i + 1,
                            codeCol: i + 2,
                            earnedPointsCol: i + 3,
                            statusCol: i + 4,
                            questionText,
                        });
                    }
                }

                // Fallback: if no ItemID pattern found, treat col 11 as single item (old behavior)
                if (detectedItems.length === 0 && headerRow.length > 11) {
                    detectedItems.push({
                        itemIdCol: 9,
                        itemTypeCol: 10,
                        codeCol: 11,
                        earnedPointsCol: 12,
                        statusCol: 13,
                        questionText: headerRow[11]?.trim() || '',
                    });
                }

                setItemMeta(detectedItems);

                const parsedSubmissions = dataRows.map((columns, index) => {
                    if (columns.length > 11) {
                        const items = detectedItems.map(meta => ({
                            itemId: columns[meta.itemIdCol]?.trim() || '',
                            questionText: meta.questionText,
                            code: columns[meta.codeCol]?.trim() || 'No code submitted.',
                        }));

                        return {
                            id: index,
                            name: columns[0]?.trim() || 'N/A',
                            sisid: columns[2]?.trim() || 'N/A',
                            items,
                            score: '',
                            comment: '',
                        };
                    }
                    return null;
                }).filter(Boolean);

                if (parsedSubmissions.length === 0) {
                    setError("Could not parse any valid student rows from the CSV.");
                    return;
                }

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

    const gradeStudent = async (items) => {
        const response = await fetch('/api/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: items.map(item => ({
                    questionText: item.questionText,
                    code: item.code,
                })),
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
        if (!rubric.trim()) {
            setError('Please enter a grading rubric before using AI grading.');
            return;
        }

        const student = submissions.find(s => s.id === id);
        if (!student) return;

        setError(null);
        setGradingStatus(prev => ({ ...prev, [id]: 'loading' }));

        try {
            const result = await gradeStudent(student.items);
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
    }, [submissions, rubric, maxScore]);

    const handleGradeAll = useCallback(async () => {
        if (!rubric.trim()) {
            setError('Please enter a grading rubric before using AI grading.');
            return;
        }

        setError(null);
        gradingAbortedRef.current = false;
        const total = submissions.length;
        let completed = 0;
        setGradingProgress({ current: 0, total, active: true });

        // Mark all as loading
        const allLoading = {};
        submissions.forEach(s => { allLoading[s.id] = 'loading'; });
        setGradingStatus(prev => ({ ...prev, ...allLoading }));

        // Grade in parallel batches of 5
        const BATCH_SIZE = 5;
        for (let i = 0; i < submissions.length; i += BATCH_SIZE) {
            if (gradingAbortedRef.current) break;

            const batch = submissions.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(async (student) => {
                    if (gradingAbortedRef.current) throw new Error('Aborted');
                    const result = await gradeStudent(student.items);
                    return { id: student.id, ...result };
                })
            );

            for (const res of results) {
                completed++;
                if (res.status === 'fulfilled') {
                    const { id, score, comment } = res.value;
                    setSubmissions(prev =>
                        prev.map(sub =>
                            sub.id === id
                                ? { ...sub, score: String(score), comment }
                                : sub
                        )
                    );
                    setGradingStatus(prev => ({ ...prev, [id]: 'done' }));
                } else {
                    const student = batch[results.indexOf(res)];
                    console.error(`Grading error for student:`, res.reason);
                    setGradingStatus(prev => ({ ...prev, [student.id]: 'error' }));
                }
                setGradingProgress(prev => ({ ...prev, current: completed }));
            }
        }

        setGradingProgress(prev => ({ ...prev, active: false }));
    }, [submissions, rubric, maxScore]);

    const handleAbortGrading = useCallback(() => {
        gradingAbortedRef.current = true;
    }, []);

    // --- Export ---

const handleExport = useCallback(() => {
        if (submissions.length === 0) {
            setError("No data to export.");
            return;
        }
        if (!assignmentName.trim()) {
            setError("Please enter the Assignment Name to export scores.");
            return;
        }

        // Format the assignment column header. 
        // Canvas usually formats this as "Assignment Name (ID)"
        const assignmentColumn = assignmentId.trim() 
            ? `${assignmentName.trim()} (${assignmentId.trim()})` 
            : assignmentName.trim();

        // Build the array of objects for PapaParse to convert
        const exportData = [];

        // Canvas export is always out of 3
        const exportMaxScore = 3;
        const rawMax = parseFloat(maxScore) || 1;
        const n = parseFloat(curveExponent) || 1.5;

        // Curve function: proportion^(1/n) * 3
        // With n=1.5, a 60% raw → 71% curved, 65% → 75%, 70% → 79%, etc.
        const applyCurve = (rawScore) => {
            const proportion = Math.max(0, Math.min(1, rawScore / rawMax));
            const curved = Math.pow(proportion, 1 / n);
            return Math.round(curved * exportMaxScore * 100) / 100; // round to 2 decimals
        };

        // 1. The mandatory "Points Possible" row
        exportData.push({
            "Student": "Points Possible",
            "ID": "",
            "SIS User ID": "",
            "SIS Login ID": "",
            "Section": "",
            [assignmentColumn]: exportMaxScore
        });

        // 2. Loop through submissions and apply curve + scale to 3
        submissions.forEach(({ sisid, score }) => {
            const rawScore = parseFloat(score) || 0;
            const curvedScore = applyCurve(rawScore);
            exportData.push({
                "Student": "",
                "ID": "",
                "SIS User ID": sisid,
                "SIS Login ID": "",
                "Section": "",
                [assignmentColumn]: curvedScore
            });
        });

        // Use PapaParse to safely generate the CSV string
        const csv = Papa.unparse(exportData);
        
        // Trigger the download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `canvas_grades_${assignmentName.trim()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url); // Clean up the object URL
        }
    }, [submissions, assignmentName, assignmentId, maxScore, curveExponent]);

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
            link.setAttribute('download', `comments ${assignmentName.trim()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [submissions, assignmentName, assignmentId]);

    const aiEnabled = rubric.trim() !== '' && !gradingProgress.active;

    return (
        <div style={{ fontFamily: "'Inter', sans-serif" }} className="bg-gray-900 text-gray-100 min-h-screen flex items-start justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Student Code Submission Grader</h1>
                    <p className="text-lg text-gray-400">Upload a Canvas Student Analysis CSV. Questions are auto-detected from the file.</p>
                </header>

                <main>
                    {/* File Upload & Export Section */}
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8 shadow-lg">
                        <label htmlFor="csvFileInput" className="block text-sm font-medium text-gray-300 mb-2">Upload CSV File</label>
                        <input
                            type="file"
                            id="csvFileInput"
                            accept=".csv"
                            onChange={handleFileUpload}
                            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                        />
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
                                        placeholder="e.g. FRQ 2D array practice"
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
                                        placeholder="e.g. 650898"
                                        className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 pb-1">
                                    Find in Canvas URL: /courses/.../assignments/<strong className="text-gray-400">ID</strong>
                                </p>
                            </div>

                            {/* Detected Items Info */}
                            {itemMeta.length > 0 && (
                                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 mb-4 text-sm text-gray-400">
                                    <span className="font-medium text-gray-300">{itemMeta.length} question{itemMeta.length > 1 ? 's' : ''} detected:</span>
                                    {itemMeta.map((meta, idx) => (
                                        <span key={idx} className="ml-2 text-gray-500">
                                            Q{idx + 1}: {meta.questionText.substring(0, 60)}{meta.questionText.length > 60 ? '...' : ''}
                                            {idx < itemMeta.length - 1 ? ' |' : ''}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* AI Grading Setup */}
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-8 shadow-lg">
                                <h3 className="text-lg font-semibold text-white mb-3">AI Grading Setup</h3>
                                <div className="space-y-4">
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
                                            disabled={!rubric.trim() || gradingProgress.active}
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
                                    items={submission.items}
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

                    {/* Curve & Export Section — shows once any student has a score */}
                    {submissions.some(s => s.score !== null && s.score !== undefined && s.score !== '') && (() => {
                        const rawMax = parseFloat(maxScore) || 1;
                        const n = parseFloat(curveExponent) || 1.5;
                        const scored = submissions.filter(s => s.score !== null && s.score !== undefined && s.score !== '');
                        const curved = scored.map(s => {
                            const p = Math.max(0, Math.min(1, parseFloat(s.score) / rawMax));
                            return Math.pow(p, 1 / n) * 3;
                        });
                        const avg = curved.length ? curved.reduce((a, b) => a + b, 0) / curved.length : 0;
                        const avgPct = ((avg / 3) * 100).toFixed(1);
                        return (
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 mt-8 shadow-lg">
                                <h3 className="text-lg font-semibold text-white mb-3">Curve & Export</h3>
                                <p className="text-sm text-gray-400 mb-4">
                                    Scores are scaled to <strong className="text-white">3 points</strong> for Canvas import. Adjust the curve exponent below — higher values give a more generous curve.
                                </p>
                                <div className="flex flex-wrap items-end gap-4 mb-4">
                                    <div className="w-36">
                                        <label htmlFor="curveInput" className="block text-sm font-medium text-gray-300 mb-1">
                                            Curve (nth root)
                                        </label>
                                        <input
                                            type="number"
                                            id="curveInput"
                                            value={curveExponent}
                                            onChange={(e) => setCurveExponent(e.target.value)}
                                            step="0.1"
                                            min="1"
                                            max="5"
                                            placeholder="1.5"
                                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2"
                                        />
                                    </div>
                                    <div className="text-sm text-gray-300 pb-2">
                                        <span className="text-gray-500">Preview:</span>{' '}
                                        <strong className={`${parseFloat(avgPct) >= 78 && parseFloat(avgPct) <= 85 ? 'text-green-400' : 'text-amber-400'}`}>
                                            {avgPct}% avg
                                        </strong>
                                        <span className="text-gray-500 ml-1">({scored.length} graded)</span>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500 mb-4">
                                    1 = no curve &nbsp;|&nbsp; 1.5 = mild &nbsp;|&nbsp; 2 = square root &nbsp;|&nbsp; 3 = cube root
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleExport}
                                        disabled={!assignmentName.trim() || !assignmentId.trim()}
                                        className="bg-green-600 text-white font-semibold py-2 px-5 rounded-full hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300"
                                    >
                                        Export Scores
                                    </button>
                                    <button
                                        onClick={handleExportComments}
                                        disabled={!assignmentName.trim() || !assignmentId.trim()}
                                        className="bg-purple-600 text-white font-semibold py-2 px-5 rounded-full hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300"
                                    >
                                        Export Canvas Comments
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </main>
            </div>
        </div>
    );
}

export default App;
