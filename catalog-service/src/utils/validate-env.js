export function validateRequiredEnv(vars) {
  const missing = vars.filter((envVar) => !process.env[envVar]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please check your .env file and ensure all required variables are set.`
    );
  }
}

export function parseBoolean(value) {
  return ['1', 'true', 'yes', 'require', 'required'].includes(
    String(value || '').trim().toLowerCase()
  );
}
