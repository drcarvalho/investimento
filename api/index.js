// Vercel Serverless Function entrypoint — serves all /api/* routes via Express
const { createApp } = require('../backend/src/app');

const app = createApp();

module.exports = app;

