from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from model import predict_toxicity

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


# ---------------------------------------------------------------------------
# POST /analyze — toxicity analysis endpoint
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    text: str


@app.post("/analyze")
def analyze(payload: AnalyzeRequest):
    """Analyze text and return its toxicity score."""
    score = predict_toxicity(payload.text)
    return {
        "text": payload.text,
        "toxicity_score": round(score, 4),
        "is_toxic": score > 0.7,
    }


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

