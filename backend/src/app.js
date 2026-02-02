require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const specs = require('./docs/swagger');
const routes = require('./routes/index');
const errorHandler = require('./middlewares/errorMiddleware');
const { initDb } = require('./database/schema');

const app = express();

// Init Database
initDb().then(() => {
    console.log('Database initialized');
}).catch(err => {
    console.error('Database failed to initialize:', err);
});

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api', routes);

// Swagger Docs - JSON specification
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

// Swagger Docs - UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Basic root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Expense Tracker API. Visit /api-docs for documentation.' });
});

// Error Handling
app.use(errorHandler);

module.exports = app;
