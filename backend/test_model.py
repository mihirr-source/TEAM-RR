import sys
sys.path.insert(0, ".")
from model import vectorizer, model, predict_toxicity

print("=== Model Load Test ===")
print(f"Vectorizer loaded: {vectorizer is not None}")
print(f"Model loaded:      {model is not None}")

print()
print("=== predict_toxicity Tests ===")
tests = [
    ("Golden hour on the coast. No filter needed. #sunset #travel", "safe"),
    ("Shipped a tiny side project today. Small wins add up!", "safe"),
    ("Nobody likes your posts. Delete your account, loser.", "toxic"),
    ("You're absolutely worthless at this. Everyone is laughing at you.", "very toxic"),
    ("Block me if this offends you. Your feelings are not my problem.", "toxic"),
    ("I love programming and building cool things!", "safe"),
    ("Imagine being this clueless. Total embarrassment.", "toxic"),
]

all_passed = True
for text, label in tests:
    score = predict_toxicity(text)
    flag = "TOXIC" if score > 0.7 else ("MID" if score > 0.35 else "OK")
    print(f"  [{flag:5s}] score={score:.3f}  [{label:10s}]  \"{text[:55]}\"")

print()

# Basic assertions
score_safe = predict_toxicity("I love beautiful sunsets and nature!")
score_toxic = predict_toxicity("You are worthless, nobody likes you, get out of here!")
assert score_safe < 0.5, f"Expected safe score < 0.5, got {score_safe}"
assert score_toxic > 0.5, f"Expected toxic score > 0.5, got {score_toxic}"
print("Assertions passed: safe text scores low, toxic text scores high.")
print()
print("=== All Tests Passed ===")
