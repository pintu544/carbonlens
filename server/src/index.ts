import express from 'express';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'carbonlens-server', scaffold: true });
});

app.listen(PORT, () => {
  console.log(
    `carbonlens-server listening on :${PORT} (scaffold — feature code pending approval)`
  );
});
