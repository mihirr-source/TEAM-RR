import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
from io import BytesIO
import urllib.request
from PIL import Image

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline

from model import predict_toxicity

# Globally load Falconsai/nsfw_image_detection model
try:
    nsfw_classifier = pipeline("image-classification", model="Falconsai/nsfw_image_detection")
except Exception as e:
    print(f"Warning: Failed to load Falconsai/nsfw_image_detection: {e}")
    nsfw_classifier = None

app = FastAPI(title="Social Media Safety Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# GET /feed — mock posts scored live by the ML model at startup
# ---------------------------------------------------------------------------

_RAW_POSTS = [
    {
        "id": 1,
        "author": "sunny_travels",
        "avatar_url": "https://i.pravatar.cc/150?img=1",
        "image_url": "https://picsum.photos/600/400?random=1",
        "text": "Golden hour on the coast. No filter needed. #sunset #travel",
    },
    {
        "id": 2,
        "author": "coffee_and_code",
        "avatar_url": "https://i.pravatar.cc/150?img=2",
        "image_url": "https://picsum.photos/600/400?random=2",
        "text": "Shipped a tiny side project today. Small wins add up!",
    },
    {
        "id": 3,
        "author": "plant_parent_92",
        "avatar_url": "https://i.pravatar.cc/150?img=3",
        "image_url": "https://picsum.photos/600/400?random=3",
        "text": "My monstera finally has a new leaf 🌿 Reacting slowly but surely.",
    },
    {
        "id": 4,
        "author": "weekend_baker",
        "avatar_url": "https://i.pravatar.cc/150?img=4",
        "image_url": "https://picsum.photos/600/400?random=4",
        "text": "Sourdough attempt #7. Crumb is getting better!",
    },
    {
        "id": 5,
        "author": "city_wanderer",
        "avatar_url": "https://i.pravatar.cc/150?img=5",
        "image_url": "https://picsum.photos/600/400?random=5",
        "text": "Some people have zero taste. This street art deserves better.",
    },
    {
        "id": 6,
        "author": "gymrat_dan",
        "avatar_url": "https://i.pravatar.cc/150?img=6",
        "image_url": "https://picsum.photos/600/400?random=6",
        "text": "If you can't keep up, stay out of my way. Weak effort everywhere.",
    },
    {
        "id": 7,
        "author": "anon_rants",
        "avatar_url": "https://i.pravatar.cc/150?img=7",
        "image_url": "https://picsum.photos/600/400?random=7",
        "text": "Imagine being this clueless. Total embarrassment.",
    },
    {
        "id": 8,
        "author": "troll_account_x",
        "avatar_url": "https://i.pravatar.cc/150?img=8",
        "image_url": "https://picsum.photos/600/400?random=8",
        "text": "Nobody likes your posts. Delete your account, loser.",
    },
    {
        "id": 9,
        "author": "flame_war_404",
        "avatar_url": "https://i.pravatar.cc/150?img=9",
        "image_url": "https://picsum.photos/600/400?random=9",
        "text": "You're absolutely worthless at this. Everyone is laughing at you.",
    },
    {
        "id": 10,
        "author": "chaos_poster",
        "avatar_url": "https://i.pravatar.cc/150?img=10",
        "image_url": "https://picsum.photos/600/400?random=10",
        "text": "Block me if this offends you. Your feelings are not my problem.",
    },
]

# Score every feed post through the real ML model once at startup.
MOCK_POSTS = [
    {**post, "toxicity_score": round(predict_toxicity(post["text"]), 4)}
    for post in _RAW_POSTS
]


@app.get("/feed")
def get_feed():
    """Return mock posts with toxicity scores computed by the ML model."""
    return MOCK_POSTS


@app.get("/demo")
def get_demo():
    """Serve the interactive demo feed HTML page directly over HTTP."""
    demo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "extension", "demo.html"))
    if os.path.exists(demo_path):
        from fastapi.responses import FileResponse
        return FileResponse(demo_path)
    return {"error": f"demo.html not found at {demo_path}"}


# ---------------------------------------------------------------------------
# GET /health — health check endpoint for extension diagnostics
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    """Health check endpoint for extension and diagnostics."""
    from model import model, vectorizer
    return {
        "status": "ok",
        "service": "Social Media Toxicity Shield API",
        "model_loaded": model is not None and vectorizer is not None,
        "default_threshold": 0.7,
    }


# ---------------------------------------------------------------------------
# GET /toxic-lexicon — returns high-weight toxic features learned by ML model
# ---------------------------------------------------------------------------

_TOXIC_LEXICON_CACHE = None


def _get_toxic_lexicon():
    global _TOXIC_LEXICON_CACHE
    if _TOXIC_LEXICON_CACHE is not None:
        return _TOXIC_LEXICON_CACHE

    from model import model, vectorizer
    features = []
    if model is not None and vectorizer is not None:
        try:
            feature_names = vectorizer.get_feature_names_out()
            coefs = model.coef_[0]
            for i in range(len(feature_names)):
                w = float(coefs[i])
                if w >= 2.0:
                    features.append({"term": str(feature_names[i]), "weight": round(w, 2)})
            features.sort(key=lambda x: -x["weight"])
        except Exception as e:
            print("Error loading feature weights:", e)

    # Core compound idioms & harassment phrases
    compounds = [
        "fuck off", "fuck you", "fucking idiot", "fucking loser", "shut up",
        "shut the fuck up", "piss off", "pissed off", "piece of shit",
        "kill yourself", "go die", "delete your account", "waste of space",
        "worthless piece of shit", "nobody likes you", "drop dead", "eat shit",
        "get the fuck out", "motherfucker", "dumb fuck", "dumb bitch",
        "son of a bitch", "ass hole", "fat ugly", "kill your self"
    ]

    _TOXIC_LEXICON_CACHE = {
        "features": features,
        "compounds": compounds,
        "count": len(features) + len(compounds)
    }
    return _TOXIC_LEXICON_CACHE


@app.get("/toxic-lexicon")
def get_toxic_lexicon():
    """Return toxic vocabulary and feature weights learned by the ML model."""
    return _get_toxic_lexicon()


# ---------------------------------------------------------------------------
# POST /analyze — toxicity analysis endpoint (supports single text or batch)
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    text: str | None = None
    texts: list[str] | None = None
    threshold: float = 0.7


@app.post("/analyze")
def analyze(payload: AnalyzeRequest):
    """Analyze text or batch of texts and return toxicity scores."""
    # Batch processing
    if payload.texts is not None:
        results = []
        for t in payload.texts:
            s = predict_toxicity(t)
            results.append({
                "text": t,
                "toxicity_score": round(s, 4),
                "is_toxic": s > payload.threshold,
            })
        return {
            "results": results,
            "count": len(results),
            "threshold": payload.threshold,
        }

    # Single text processing
    text_content = payload.text or ""
    score = predict_toxicity(text_content)
    return {
        "text": text_content,
        "toxicity_score": round(score, 4),
        "is_toxic": score > payload.threshold,
        "threshold": payload.threshold,
    }


# ---------------------------------------------------------------------------
# POST /analyze-image — NSFW image detection endpoint
# ---------------------------------------------------------------------------


class AnalyzeImageRequest(BaseModel):
    image_url: str
    threshold: float = 0.7


@app.post("/analyze-image")
def analyze_image(payload: AnalyzeImageRequest):
    """Download image from image_url, run NSFW inference, and return classification."""
    image_url = payload.image_url
    if not image_url:
        return {"is_nsfw": False, "score": 0.0}

    global nsfw_classifier
    if nsfw_classifier is None:
        try:
            nsfw_classifier = pipeline("image-classification", model="Falconsai/nsfw_image_detection")
        except Exception as e:
            print(f"Warning: Failed to initialize nsfw_classifier: {e}")
            return {"is_nsfw": False, "score": 0.0}

    try:
        if image_url.startswith("data:image"):
            import base64
            header, encoded = image_url.split(",", 1)
            image_data = base64.b64decode(encoded)
            img = Image.open(BytesIO(image_data)).convert("RGB")
        else:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://www.reddit.com/",
            }
            req = urllib.request.Request(image_url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response:
                img = Image.open(BytesIO(response.read())).convert("RGB")

        results = nsfw_classifier(img)
        # Falconsai/nsfw_image_detection outputs label 'nsfw' or 'normal'
        nsfw_score = 0.0
        found = False
        normal_score = None
        for item in results:
            lbl = str(item.get("label", "")).lower()
            if lbl in ("nsfw", "unsafe"):
                nsfw_score = float(item.get("score", 0.0))
                found = True
                break
            elif lbl in ("normal", "safe"):
                normal_score = float(item.get("score", 0.0))

        if not found and normal_score is not None:
            nsfw_score = 1.0 - normal_score

        is_nsfw = nsfw_score > payload.threshold
        print(f"DEBUG [/analyze-image] is_nsfw={is_nsfw} score={nsfw_score:.4f} url={image_url[:90]}")
        return {
            "is_nsfw": is_nsfw,
            "score": round(nsfw_score, 4),
        }
    except Exception as e:
        print(f"Error analyzing image ({image_url}): {e}")
        return {"is_nsfw": False, "score": 0.0}


# ---------------------------------------------------------------------------
# POST /posts — create a new post scored live by the ML model
# ---------------------------------------------------------------------------


class CreatePostRequest(BaseModel):
    text: str
    author: str = "you"
    avatar_url: str = "https://i.pravatar.cc/150?img=12"
    image_url: str = ""


@app.post("/posts")
def create_post(payload: CreatePostRequest):
    """Score a new post live with the toxicity ML model and append it to feed."""
    score = predict_toxicity(payload.text)
    post_id = max([p["id"] for p in MOCK_POSTS], default=0) + 1
    image_url = payload.image_url or f"https://picsum.photos/600/400?random={post_id + 100}"
    
    new_post = {
        "id": post_id,
        "author": payload.author,
        "avatar_url": payload.avatar_url,
        "image_url": image_url,
        "text": payload.text,
        "toxicity_score": round(score, 4),
    }
    MOCK_POSTS.insert(0, new_post)
    return new_post

