# Social Media Safety Demo — Backend

FastAPI backend for a demo social-media safety app. Serves a mock feed of posts
and a text toxicity analysis endpoint.

## Setup

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the server:

```bash
uvicorn main:app --reload --port 8000
```

Run from inside the `backend/` folder so `uvicorn` can find `main.py`.

## Endpoints

| Method | Path       | Description                                                          |
| ------ | ---------- | -------------------------------------------------------------------- |
| GET    | `/feed`    | Returns 10 hardcoded mock Instagram-style posts with toxicity scores |
| POST   | `/analyze` | Body: `{"text": "..."}` → returns `toxicity_score` and `is_toxic`    |

Interactive API docs are available at http://localhost:8000/docs once the
server is running.

## Notes

- `model.py` contains a placeholder `predict_toxicity(text: str) -> float`
  that always returns `0.5`. Replace its internals with your own trained
  model without changing the signature.
- CORS is enabled for `http://localhost:3000` (and `*`) for local development.
