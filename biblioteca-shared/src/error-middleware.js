export function createErrorMiddleware(getNodeEnv) {
  return (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

    const response = {
      success: false,
      error: message
    };

    if (getNodeEnv() === 'development') {
      response.stack = err.stack;
    }

    res.status(statusCode).json(response);
  };
}
