---
title: AI Shield Real-Time ML Backend
emoji: 🛡️
colorFrom: red
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# AI Shield - Real-Time ML Backend API

Production-ready FastAPI backend powering the **AI Shield Chrome Web Extension**:
- **Toxicity Classification**: Scikit-Learn TF-IDF model.
- **NSFW Image Detection**: Hugging Face Vision Transformer (`Falconsai/nsfw_image_detection`).
- **Semantic Trigger Filtering**: SentenceTransformers (`all-MiniLM-L6-v2`) cosine similarity.
- **Pre-Post Interception**: Real-time draft analysis & polite rephrasing for social media inputs.

## Interactive API Documentation
- **Swagger UI**: [`/docs`](/docs)
- **ReDoc Interactive Reference**: [`/redoc`](/redoc)
- **Live Interactive Cyber Shield Demo**: [`/demo`](/demo)
