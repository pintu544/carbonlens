# Research — CarbonLens (IEEE ClimateChain Hackathon)

> Findings that grill/spec/design decisions rest on. Read 2026-10-08 unless noted.
> Rule: if it isn't written here with a source, it doesn't count as verified.

## Event facts (official Devpost page)

- **Event:** IEEE ClimateChain Global Hackathon — "AI and BLOCKCHAIN Innovate Today for a Sustainable Tomorrow."
  Source: https://ieee-climatechain-hack.devpost.com/ (read 2026-10-08)
- **Organizers:** IEEE Blockchain Türkiye Group, IEEE Blockchain Technical Group, IEEE Orange County EMBS/Section/Chapter, IEEE Türkiye Section, Istanbul Chamber of Commerce, AI Ecosystem Association of Türkiye.
  Source: same page (read 2026-10-08)
- **Submission deadline:** Oct 25, 2026, **7:30 PM IST** — confirmed on Devpost (parent verified 2026-10-08; equals 10:00 AM EDT).
  Note: the rules page text says "Don't submit before official start time which 8 AM PT on October 25" — confusing wording; the confirmed deadline above stands. Re-verify on the Devpost page the day before submitting.
  Sources: https://ieee-climatechain-hack.devpost.com/rules (read 2026-10-08); Devpost AI category listing (recent crawl 2026-10-08)
- **Solo:** explicitly allowed — "Form a team or participate individually."
  Source: event page (read 2026-10-08). Pintu registered solo as pintu544 on 2026-10-08.
- **Prizes:** $3,000 cash — 1st $1,500, 2nd $1,000, 3rd $500. Plus IEEE Certificate of Merit (top 3), Certificate of Participation (10), Senior Member nomination (5).
  Source: event page (read 2026-10-08)
- **Participants:** 607 (Devpost listing, recent crawl 2026-10-08).
- **Tracks (4):** Carbon Markets & Emissions Transparency; Renewable Energy & Energy Trading; Sustainable Supply Chains; Climate Data & Environmental Monitoring.
  Source: event page (read 2026-10-08)
- **Judging criteria:** Climate Impact; Innovation & Creativity; Technical Execution ("effective use of tools such as blockchain, smart contracts, AI…"); Practical Usefulness; Presentation & Communication (video must communicate the problem, how it works, real-world impact).
  Sources: event page + rules page (read 2026-10-08)
- **Submission must include:** track alignment statement; project description (problem, solution, users, scale, adoption); demo video 3–5 min; public GitHub repo with source + docs; working prototype/demo.
  Source: rules page (read 2026-10-08)

## Chosen track

**Carbon Markets & Emissions Transparency** — Challenge: improve trust, transparency, and efficiency in carbon markets. Problems: lack of transparency, double counting, complex verification. Suggested builds: blockchain-based carbon credit verification, real-time emissions tracking, smart contracts to prevent double counting, transparent trading platforms.
Source: event page track table (read 2026-10-08)

## Carbon-credit data sources (assessed 2026-10-08)

- **Verra** exposes a public, unauthenticated project-search UI API (used by community projects, e.g. `registry.verra.org/uiapi/resource/resourceSummary/{id}`). Project Hub APIs need login. ToU: must not misrepresent project quality/ownership/verification status.
  Sources: https://github.com/chhelu123/vertex-sylithe/blob/HEAD/sylithe-docs/research/SYLITHE_RESEARCH.md ; https://github.com/dustinhaggett/carbonverifier (search 2026-10-08)
- **Gold Standard** has a public Impact Registry with filter + export of public records.
  Source: https://www.goldstandard.org/impact-registry (via search 2026-10-08)
- **OffsetsDB (CarbonPlan)** is an open-source harmonized dataset + documented API covering Verra, Gold Standard, ACR, CAR, ART TREES.
  Source: https://offsets-db-data.readthedocs.io/en/stable/api.html (via search 2026-10-08)
- **Decision basis:** public endpoints exist but are unofficial/ToU-constrained and unsuitable as the deterministic demo backbone for a 17-day solo build. Primary dataset = synthetic-but-realistic fixtures modeled on the Verra VCS schema. A read-only live registry lookup is an explicitly-marked stretch goal only (see GRILL Q3).

## Blockchain target (to verify at deploy time, day 2–3)

- **Polygon Amoy testnet** (chain id 80002): EVM, free test MATIC via the official faucet, AmoyScan block explorer for demo proof links. Backend integrates via ethers v6.
  Faucet: https://faucet.polygon.technology — verify availability when funding the deployer wallet; get funds on day 1–2, not the night before the demo.
