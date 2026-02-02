/**
 * Standard error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  console.error('[AI-ORCHESTRATOR-ERROR]:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    response: err.response?.data
  });

  // Handle Axios errors specifically (from backend calls)
  if (err.response) {
    return res.status(err.response.status).json({
      error: true,
      message: err.response.data?.message || 'The backend service returned an error.',
      details: err.response.data
    });
  }

  // Handle OpenAI errors
  if (err.status && err.status === 401) {
    return res.status(500).json({
      error: true,
      message: 'AI Service configuration error: Invalid API Key.'
    });
  }

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: true,
    message: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};
