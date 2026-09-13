# Handoff

## Current state
- **Team**: TEAM-RR
- **Track**: 3 (AI/ML: A Layer Between You and the Noise)
- **Architecture**:
  - FastAPI real-time microservice backend on `http://127.0.0.1:8000`
  - Manifest V3 Chrome browser extension with live DOM interception
  - Interactive demonstration feed at `http://localhost:8000/demo`

## Works
- **Toxicity Classification**: Real-time scoring using Scikit-Learn TF-IDF model (`POST /analyze`).
- **NSFW Image Detection**: Computer vision filtering using Hugging Face Vision Transformer `Falconsai/nsfw_image_detection` (`POST /analyze-image`).
- **Semantic Trigger Filter**: Contextual topic matching using SentenceTransformers `all-MiniLM-L6-v2` with calibrated threshold (0.35) and direct keyword fallback (`POST /analyze-trigger`).
- **Pre-Post Interception**: Input draft checking with constructive rephrase suggestions (`POST /check-draft`).
- **Live Demo Test Bench**: Dynamic `/demo` page with interactive Semantic Trigger Filter Bench and 1-click test presets (`🌿 Plants`, `🍞 Sourdough`, `🌊 Travel`, `⚠️ Insult`, `🕷️ Spiders`).
- **Extension Controls**: Master ON/OFF toggle switch, live metrics (Total Analyzed & Words Discarded), and trigger configuration.

## Broken
- None. Backend runs cleanly on port 8000 with interactive docs at `/docs`.

## Next 3 things
1. Test DOM interception live across real web targets (Reddit, X/Twitter, Instagram).
2. Package extension zip bundle and finalize demo walkthrough for judges.
3. Keep `cyhi` turn logs updated during all team development sessions.

## Decisions (and why)
- **Local / Self-Hosted Models**: Used local lightweight transformer models (`all-MiniLM-L6-v2`, `Falconsai/nsfw_image_detection`, TF-IDF) to strictly satisfy the Track 3 rule requiring team-hosted models over commercial APIs.
- **Calibrated Semantic Threshold (0.35)**: SentenceTransformers cosine similarity between 1-word triggers and full sentences naturally lands in the 0.30–0.40 range; 0.35 ensures accurate matching without false positives.
- **Dual Storage Fallback**: Content script supports both `chrome.storage.local` and `localStorage` so the demo functions identically in standalone web browsers and installed extension contexts.

## Don't retry
- Do not set semantic trigger similarity threshold higher than 0.40 for short prompts.
- Do not remove the `localStorage` fallback from the demo feed.
