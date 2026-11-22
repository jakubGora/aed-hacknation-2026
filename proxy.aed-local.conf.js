/**
 * Local AED front → Docker mcod API on host :8008 (container :8000).
 * Includes portal auth (/auth/login) and AED (/aed/...) from the same backend source.
 */
module.exports = {
  '/api': {
    target: 'http://127.0.0.1:8008',
    secure: false,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    logLevel: 'debug',
  },
};
