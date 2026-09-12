import { useEffect, useRef, useState } from "react";

const ANALYZE_URL = "http://localhost:8000/analyze";
const POSTS_URL = "http://localhost:8000/posts";
const DEBOUNCE_MS = 400;

export default function ComposeBox({ onPostCreated }) {
  const [text, setText] = useState("");
  const [isToxic, setIsToxic] = useState(false);
  const [score, setScore] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Keep the latest request id so slow responses can't clobber newer ones.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (text.trim() === "") {
      setIsToxic(false);
      setScore(null);
      setAnalyzing(false);
      return;
    }

    setAnalyzing(true);
    const id = ++requestIdRef.current;

    const timer = setTimeout(() => {
      fetch(ANALYZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (requestIdRef.current === id) {
            setIsToxic(Boolean(data.is_toxic));
            setScore(data.toxicity_score);
            setAnalyzing(false);
          }
        })
        .catch(() => {
          if (requestIdRef.current === id) {
            setIsToxic(false);
            setScore(null);
            setAnalyzing(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isToxic || text.trim() === "" || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(POSTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          author: "you",
          avatar_url: "https://i.pravatar.cc/150?img=12",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const newPost = await res.json();

      setText("");
      setIsToxic(false);
      setScore(null);
      if (onPostCreated) {
        onPostCreated(newPost);
      }
    } catch (err) {
      console.error("Failed to create post:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = isToxic || text.trim() === "" || submitting || analyzing;

  return (
    <section className="mt-6 mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          Compose Comment / Post
        </h2>
        {score !== null && !analyzing && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              score > 0.7
                ? "bg-red-100 text-red-700 font-bold"
                : score > 0.35
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            ML Score: {(score * 100).toFixed(0)}% {score > 0.7 ? "🚨 Toxic" : score > 0.35 ? "⚠️ Borderline" : "✅ Safe"}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Write a comment… (ML model scores in real-time)"
          className={`w-full resize-none rounded-lg border p-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:bg-white ${
            isToxic
              ? "border-red-300 bg-red-50/50 focus:border-red-500"
              : "border-gray-300 bg-gray-50 focus:border-blue-500"
          }`}
        />

        {isToxic && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-600">
            <span>⚠️</span>
            <span>This message is flagged as toxic by the AI model. Please rephrase to enable posting.</span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] font-medium text-gray-400">
            {analyzing ? "⚡ ML Model Analyzing..." : submitting ? "Posting..." : " "}
          </span>

          <button
            type="submit"
            disabled={disabled}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition shadow-sm ${
              disabled
                ? "cursor-not-allowed bg-blue-200 text-white shadow-none"
                : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
            }`}
          >
            {submitting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>
    </section>
  );
}
