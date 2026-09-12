import joblib
import os

# Get the directory of the current file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load the model and vectorizer
try:
    vectorizer = joblib.load(os.path.join(BASE_DIR, "tfidf_vectorizer.pkl"))
    model = joblib.load(os.path.join(BASE_DIR, "toxicity_model.pkl"))
except FileNotFoundError:
    print("Warning: Model or vectorizer files not found.")
    vectorizer = None
    model = None

def predict_toxicity(text: str) -> float:
    """Return a toxicity score in [0.0, 1.0] for the given text."""
    if model is None or vectorizer is None:
        return 0.5
        
    text_vectorized = vectorizer.transform([text])
    probabilities = model.predict_proba(text_vectorized)
    
    # Extract the toxicity score (probability of the toxic class)
    toxicity_score = probabilities[0][1]
    
    return float(toxicity_score)
