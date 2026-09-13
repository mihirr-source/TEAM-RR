import base64
from io import BytesIO
import os
import re
import urllib.request

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util
from transformers import pipeline

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

try:
    from backend.model import predict_toxicity, model, vectorizer
except ImportError:
    from model import predict_toxicity, model, vectorizer

# Globally load Falconsai/nsfw_image_detection model
try:
    nsfw_classifier = pipeline("image-classification", model="Falconsai/nsfw_image_detection")
except Exception as e:
    print(f"Warning: Failed to load Falconsai/nsfw_image_detection: {e}")
    nsfw_classifier = None

# Globally load all-MiniLM-L6-v2 model for semantic trigger filtering
try:
    trigger_model = SentenceTransformer("all-MiniLM-L6-v2")
    print("Semantic trigger model (all-MiniLM-L6-v2) loaded successfully.")
except Exception as e:
    print(f"Warning: Failed to load all-MiniLM-L6-v2: {e}")
    trigger_model = None

app = FastAPI(
    title="AI Shield - Real-Time ML Backend API",
    description="Interactive API documentation for all AI Shield machine learning models: Scikit-Learn Toxicity Classification, Falconsai Vision Transformer (NSFW Detection), and SentenceTransformer Semantic Trigger Filtering.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        return FileResponse(demo_path)
    return {"error": f"demo.html not found at {demo_path}"}


@app.get("/content.js")
def get_content_js():
    """Serve extension content.js directly over HTTP."""
    js_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "extension", "content.js"))
    if os.path.exists(js_path):
        return FileResponse(js_path, media_type="application/javascript")
    return {"error": "content.js not found"}


@app.get("/content.css")
def get_content_css():
    """Serve extension content.css directly over HTTP."""
    css_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "extension", "content.css"))
    if os.path.exists(css_path):
        return FileResponse(css_path, media_type="text/css")
    return {"error": "content.css not found"}


# ---------------------------------------------------------------------------
# GET /health — health check endpoint for extension diagnostics
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    """Health check endpoint for extension and diagnostics."""
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
        "son of a bitch", "ass hole", "fat ugly", "kill your self",
        "bhenchod", "behenchod", "madarchod", "chutiya", "chutiye", "chutiyapa",
        "bhosdike", "bsdk", "bhosdi", "gandu", "gaandu", "gaand", "lund", "loda",
        "lauda", "lodu", "randi", "rndi", "harami", "kameene", "kamina", "saala", "saale",
        "mc", "bc", "mc bc", "maa ki chut", "teri maa ki", "teri maa ki chut", "teri behen ki",
        "bhen ke lode", "bhen ke takke", "bhosadike", "bhosdi ke", "bhosdiwale",
        "gaand mara", "gaand maro", "chut ke dhakkan", "lund ke baal", "kutta kamina"
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
            encoded = image_url.split(",", 1)[1] if "," in image_url else image_url
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


# ---------------------------------------------------------------------------
# POST /check-draft — pre-post toxicity check & safe rephrase suggestions
# ---------------------------------------------------------------------------

PHRASE_REPLACEMENTS = [
    (r'(?i)\bnobody likes your posts\.?\s*delete your account,?\s*loser\.?', 'I have a different perspective on this topic.'),
    (r'(?i)\byou(?:\'re| are) absolutely worthless at this\.?\s*everyone is laughing at you\.?', 'There is room for improvement here, but keep learning.'),
    (r'(?i)\bimagine being this clueless\.?\s*total embarrassment\.?', 'I see things differently, but let us discuss respectfully.'),
    (r'(?i)\bif you can\'?t keep up,?\s*stay out of my way\.?\s*weak effort everywhere\.?', 'Let us encourage everyone to do their best and keep improving.'),
    (r'(?i)\bblock me if this offends you\.?\s*your feelings are not my problem\.?', 'Here is my perspective on this topic for open discussion.'),
    (r'(?i)\bdelete your account,?\s*loser\.?', 'I disagree with this post.'),
    (r'(?i)\bdelete your account\b', 'reconsider this post'),
    (r'(?i)\bkill yourself\b', 'take care of yourself'),
    (r'(?i)\bgo die\b', 'take a break'),
    (r'(?i)\bfuck(?:ing)? idiot\b', 'misguided individual'),
    (r'(?i)\bfuck(?:ing)? loser\b', 'person I disagree with'),
    (r'(?i)\bfuck off\b', 'please leave me be'),
    (r'(?i)\bfuck you\b', 'I strongly disagree with you'),
    (r'(?i)\bshut up\b', 'let us take a pause'),
    (r'(?i)\bshut the fuck up\b', 'let us pause this conversation'),
    (r'(?i)\bpiece of shit\b', 'unpleasant situation'),
    (r'(?i)\bworthless\b', 'challenging'),
    (r'(?i)\bloser\b', 'friend'),
    (r'(?i)\bidiot\b', 'mistaken person'),
    (r'(?i)\bmoron\b', 'individual'),
    (r'(?i)\bstupid\b', 'unhelpful'),
    (r'(?i)\bdumb\b', 'unclear'),
    (r'(?i)\basshole\b', 'rude person'),
    (r'(?i)\bbitch\b', 'person'),
    (r'(?i)\bbullshit\b', 'inaccurate'),
]


def generate_safe_suggestion(text: str) -> str:
    cleaned = text
    for pattern, repl in PHRASE_REPLACEMENTS:
        cleaned = re.sub(pattern, repl, cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    if predict_toxicity(cleaned) > 0.35 or cleaned == text:
        cleaned = 'I disagree with this viewpoint, but appreciate the discussion.'
    return cleaned


class CheckDraftRequest(BaseModel):
    text: str | None = ""
    draft: str | None = None
    threshold: float = 0.7


@app.post("/check-draft")
def check_draft(payload: CheckDraftRequest):
    """Analyze a draft post before publication, returning toxicity flag and suggested safe text."""
    draft_text = (payload.text or payload.draft or "").strip()
    if not draft_text:
        return {
            "is_toxic": False,
            "toxicity_score": 0.0,
            "suggested_text": "",
            "safe_text": "",
            "threshold": payload.threshold,
        }

    score = predict_toxicity(draft_text)
    is_toxic = score > payload.threshold

    if is_toxic:
        safe_suggestion = generate_safe_suggestion(draft_text)
        return {
            "is_toxic": True,
            "toxicity_score": round(score, 4),
            "suggested_text": safe_suggestion,
            "safe_text": safe_suggestion,
            "threshold": payload.threshold,
        }
    else:
        return {
            "is_toxic": False,
            "toxicity_score": round(score, 4),
            "suggested_text": draft_text,
            "safe_text": draft_text,
            "threshold": payload.threshold,
        }


# ---------------------------------------------------------------------------
# POST /analyze-trigger — Semantic Trigger Filter Endpoint
# ---------------------------------------------------------------------------

class AnalyzeTriggerRequest(BaseModel):
    trigger: str
    text: str
    threshold: float = 0.35


@app.post("/analyze-trigger")
def analyze_trigger(payload: AnalyzeTriggerRequest):
    """Calculate semantic similarity between custom trigger and scraped text using all-MiniLM-L6-v2."""
    trigger = (payload.trigger or "").strip()
    text = (payload.text or "").strip()
    threshold = float(payload.threshold if payload.threshold is not None else 0.35)

    if not trigger or not text or trigger_model is None:
        return {
            "trigger_matched": False,
            "score": 0.0,
            "reason": "missing_input_or_model"
        }

    direct_match = trigger.lower() in text.lower()

    try:
        emb_trigger = trigger_model.encode(trigger, convert_to_tensor=True)
        emb_text = trigger_model.encode(text, convert_to_tensor=True)
        cos_sim = util.cos_sim(emb_trigger, emb_text)
        score = float(cos_sim.item())
    except Exception as e:
        print(f"Error computing trigger embeddings: {e}")
        score = 0.0

    if direct_match:
        score = max(score, 0.95)
        is_matched = True
        reason = "exact_keyword"
    else:
        is_matched = bool(score >= threshold)
        reason = "semantic_similarity" if is_matched else "below_threshold"

    return {
        "trigger_matched": is_matched,
        "score": round(score, 4),
        "threshold": threshold,
        "reason": reason
    }

