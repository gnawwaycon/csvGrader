import React, { useState, useCallback } from 'react';
import Papa from 'papaparse';

// StudentCard Component
const StudentCard = ({ name, codeHTML }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-md overflow-hidden transition-transform duration-300 hover:scale-[1.02]">
        <div className="p-4 bg-gray-700/50 border-b border-gray-600">
            <h2 className="text-xl font-semibold text-white">{name}</h2>
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
                    if (columns.length > 11) {
                        return {
                            id: index,
                            name: columns[0].trim(),
                            code: columns[11].trim() || 'No code submitted.',
                        };
                    }
                    return null;
                }).filter(Boolean); // Filter out any null entries from malformed rows

                setSubmissions(parsedSubmissions);
            },
            error: (err) => {
                setError(`Failed to parse CSV: ${err.message}`);
            },
        });
    }, []);

    return (
        <div style={{ fontFamily: "'Inter', sans-serif" }} className="bg-gray-900 text-gray-100 min-h-screen flex items-start justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Student Code Submission Viewer</h1>
                    <p className="text-lg text-gray-400">Upload a CSV file to display student names and their code from Column L.</p>
                </header>

                <main>
                    {/* File Upload Section */}
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

                    {/* Results Section */}
                    <div id="resultsContainer" className="space-y-6">
                        {error && (
                            <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">
                                <strong>Error:</strong> {error}
                            </div>
                        )}

                        {submissions.length > 0 ? (
                            submissions.map(submission => (
                                <StudentCard key={submission.id} name={submission.name} codeHTML={submission.code} />
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
