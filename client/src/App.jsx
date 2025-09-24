import React, { useState, useCallback } from 'react';
import Papa from 'papaparse';

// StudentCard Component
const StudentCard = ({ name, sisid, codeHTML, score, onScoreChange }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-md overflow-hidden transition-transform duration-300 hover:scale-[1.02]">
        <div className="p-4 bg-gray-700/50 border-b border-gray-600 flex justify-between items-center flex-wrap gap-4">
            <div>
                <h2 className="text-xl font-semibold text-white">{name}</h2>
                <p className="text-sm text-gray-400">SISID: {sisid}</p>
            </div>
            <div className="flex items-center space-x-2">
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

    const handleFileUpload = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;

        setError(null);
        setSubmissions([]);

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
    
    const handleExport = useCallback(() => {
        if (submissions.length === 0) {
            setError("No data to export.");
            return;
        }

        const exportData = submissions.map(({ name, sisid, score }) => ({
            'Name': name,
            'SISID': sisid,
            'Score': score || '0', // Default score to '0' if it's empty
        }));

        const csv = Papa.unparse(exportData);

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) { // feature detection
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'student_scores.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [submissions]);

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
                        <div className="w-full sm:w-auto">
                           <button 
                                onClick={handleExport}
                                disabled={submissions.length === 0}
                                className="w-full sm:w-auto mt-4 sm:mt-0 bg-green-600 text-white font-semibold py-2 px-5 rounded-full hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-300"
                           >
                               Export Scores
                           </button>
                        </div>
                    </div>

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

