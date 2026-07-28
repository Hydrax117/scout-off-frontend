const createApp = require('./app');

const PORT = process.env.PORT ?? 4000;

const app = createApp();
app.listen(PORT, () => {
  console.log(`scout-off backend listening on port ${PORT}`);
});
