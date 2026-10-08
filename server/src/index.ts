import cors from 'cors';
import express from 'express';
import 'dotenv/config';
import { migrate, pool } from './db.js';
import { loadDataset, seedCredits, seedVerifications } from './seed.js';
import { creditsRouter } from './routes/credits.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
app.use(cors({ origin: corsOrigin as string | string[] }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'carbonlens-server' });
});

app.use('/api/credits', creditsRouter);

async function boot(): Promise<void> {
  // Idempotent schema + seed on every boot (deploy skill rule 5: the app owns
  // its schema; seed is upsert-safe and never overwrites user data).
  await migrate();
  const dataset = loadDataset();
  const c = await seedCredits(dataset.credits);
  const v = await seedVerifications(dataset);
  console.log(`boot seed: ${c.inserted} credits, ${v.inserted} verifications inserted`);

  app.listen(PORT, () => {
    console.log(`carbonlens-server listening on :${PORT}`);
  });
}

boot().catch((err) => {
  console.error('boot failed:', err);
  process.exit(1);
});

// Graceful shutdown for the pool (lets tests exit cleanly too).
process.on('SIGTERM', () => {
  void pool.end().then(() => process.exit(0));
});
