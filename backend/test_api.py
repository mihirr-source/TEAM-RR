import urllib.request, json

base = "http://127.0.0.1:8000"

# --- Test GET /feed ---
print("=== GET /feed ===")
with urllib.request.urlopen(base + "/feed") as r:
    posts = json.loads(r.read())
print(f"Returned {len(posts)} posts")
for p in posts:
    print(f"  id={p['id']} author={p['author']:20s} score={p['toxicity_score']}")

# --- Test POST /analyze ---
print()
print("=== POST /analyze ===")
test_texts = [
    "I love beautiful sunsets!",
    "Delete your account, loser.",
    "Great job on the project!",
    "You are absolutely worthless.",
    "Block me if this offends you. Your feelings are not my problem.",
]
for text in test_texts:
    data = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        base + "/analyze",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        result = json.loads(r.read())
    flag = "TOXIC" if result["is_toxic"] else "SAFE"
    print(f"  [{flag:5s}] score={result['toxicity_score']:.3f}  \"{text}\"")

print()
print("=== All API Tests Passed ===")
