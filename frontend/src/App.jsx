import { useEffect, useState } from "react";
import PostCard from "./components/PostCard.jsx";
import ComposeBox from "./components/ComposeBox.jsx";
import ShieldBadge from "./components/ShieldBadge.jsx";

const FEED_URL = "http://localhost:8000/feed";

export default function App() {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [filter, setFilter] = useState("all"); // all | safe | flagged

  const fetchFeed = () => {
    setStatus("loading");
    fetch(FEED_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setPosts(data);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
      });
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  const handlePostCreated = (newPost) => {
    setPosts((prev) => [newPost, ...prev]);
  };

  const filteredPosts = posts.filter((p) => {
    if (filter === "safe") return p.toxicity_score <= 0.7;
    if (filter === "flagged") return p.toxicity_score > 0.7;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <ShieldBadge />

      {/* Feed header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur shadow-sm">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 font-serif">
              Social Feed
            </h1>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              AI Safety Powered
            </span>
          </div>
          <button
            onClick={fetchFeed}
            title="Refresh Feed"
            className="text-xs font-medium text-gray-500 hover:text-gray-900 transition"
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-2 sm:px-4">
        {/* Compose comment box */}
        <ComposeBox onPostCreated={handlePostCreated} />

        {/* Filter bar */}
        {status === "ready" && (
          <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-2 px-1">
            <span className="text-xs font-medium text-gray-500">
              Showing {filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-1 text-xs">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  filter === "all"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("safe")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  filter === "safe"
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                Clean ({posts.filter((p) => p.toxicity_score <= 0.7).length})
              </button>
              <button
                onClick={() => setFilter("flagged")}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  filter === "flagged"
                    ? "bg-red-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                Flagged ({posts.filter((p) => p.toxicity_score > 0.7).length})
              </button>
            </div>
          </div>
        )}

        {/* Feed Status */}
        {status === "loading" && (
          <div className="py-12 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
            Loading feed & ML scores…
          </div>
        )}

        {status === "error" && (
          <div className="my-8 rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
            <p className="font-semibold text-red-700">Couldn't load the feed</p>
            <p className="mt-1 text-sm text-red-600">
              Is the backend running on{" "}
              <code className="rounded bg-red-100 px-1 font-mono">localhost:8000</code>?
            </p>
            <p className="mt-2 text-xs text-red-500">
              Start backend: <code className="rounded bg-red-100 px-1 font-mono">uvicorn main:app --port 8000</code>
            </p>
            <button
              type="button"
              onClick={fetchFeed}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
            >
              Retry Connection
            </button>
          </div>
        )}

        {status === "ready" && (
          <div className="space-y-6">
            {filteredPosts.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500 bg-white rounded-xl border border-gray-200 p-6">
                No posts match the current filter.
              </p>
            ) : (
              filteredPosts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </div>
        )}
      </main>
    </div>
  );
}
