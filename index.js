try {
  // Ensure build output is present
  require('./dist/index.js');
} catch (e) {
  console.error('\nBuild output not found or failed to start.');
  console.error('Hint: Render should run postinstall → tsc automatically.');
  console.error('If this persists, set Build Command to "npm ci && npm run build" and Start Command to "npm start".');
  console.error(e && (e.stack || e.message || e));
  process.exit(1);
}

