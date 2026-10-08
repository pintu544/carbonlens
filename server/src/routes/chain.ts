import { Router } from 'express';
import { chainStatus } from '../chain.js';

export const chainRouter = Router();

// GET /api/chain/status → { configured, network, contractAddress, amoyScanAddressUrl }
chainRouter.get('/status', (_req, res) => {
  res.json(chainStatus());
});
