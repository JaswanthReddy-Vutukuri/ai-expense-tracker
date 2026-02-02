import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import chatRoutes from './src/routes/chat.js';
import uploadRoutes from './src/routes/upload.js';
import debugRoutes from './src/routes/debug.js';
import { errorHandler } from './src/middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

// AUDIT FIX: Part 10 - Security Hardening
// Add helmet for security headers
app.use(helmet());

// AUDIT FIX: Part 10 - CORS Configuration (no longer wide open)
// Restrict origins to environment-configured values only
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:4200']; // Default for development

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// AUDIT FIX: Part 10 - Rate Limiting (prevent DOS attacks)
// Limit requests per IP to prevent abuse and cost explosion
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

// Apply rate limiting to all AI routes
app.use('/ai', limiter);

// AUDIT FIX: Part 10 - Explicit Body Size Limits (prevent DOS via large payloads)
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/ai', chatRoutes);
app.use('/ai', uploadRoutes);
app.use('/ai', debugRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'AI Orchestrator' });
});

// Centralized Error Handling
app.use(errorHandler);

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 AI Orchestrator running on http://localhost:${PORT}`);
  console.log(`🔗 Backend URL: ${process.env.BACKEND_URL || 'http://localhost:3000'}`);
});
