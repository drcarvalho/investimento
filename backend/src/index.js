const { loadEnvFile } = require('./middleware/security');

// Load backend/.env before initializing DB or services
loadEnvFile();

const { createApp } = require('./app');
const db = require('./models/db');

const app = createApp();

// Export Express app for Vercel Services (framework: "express") and programmatic imports
module.exports = app;

// Only bind a TCP port when executed directly (local dev / Docker)
if (require.main === module && !process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  const server = app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}. Closing server gracefully...`);

    server.close(async () => {
      await db.closeGracefully();
      console.log('Shutdown complete.');
      process.exit(0);
    });

    // Force exit if connections hang beyond 5s
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
