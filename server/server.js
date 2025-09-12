const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // To parse JSON bodies

// Basic root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the CSV Viewer API!' });
});

// A simple API endpoint example
app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running correctly' });
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
