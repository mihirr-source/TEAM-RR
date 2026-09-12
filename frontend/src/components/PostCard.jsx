import { useState } from "react";

const TOXIC_THRESHOLD = 0.7;

export default function PostCard({ post }) {
  const isToxic = post.toxicity_score > TOXIC_THRESHOLD;
  const [revealed, setRevealed] = useState(false);
  const blurred = isToxic && !revealed;

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
      {/* Header: avatar + author */}
      <div className="flex items-center gap-3 px-4 py-3">
        <img
          src={post.avatar_url}
          alt={`${post.author}'s avatar`}
          className="h-9 w-9 rounded-full border border-gray-300 object-cover"
          loading="lazy"
          onError={(e) => {
            e.target.src = "https://i.pravatar.cc/150?img=12";
          }}
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900 leading-none">
            {post.author}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">
            {post.author === "you" ? "Just now" : "Sponsored / User"}
          </span>
        </div>
        {isToxic ? (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
            <span>🚨</span> Flagged
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
            <span>🛡️</span> Clean
          </span>
        )}
      </div>

      {/* Post image */}
      {post.image_url && (
        <img
          src={post.image_url}
          alt="Post"
          className="aspect-[3/2] w-full bg-gray-100 object-cover"
          loading="lazy"
          onError={(e) => {
            e.target.src = "https://picsum.photos/600/400?random=99";
          }}
        />
      )}

      {/* Caption — blurred when toxic until revealed */}
      <div className="relative px-4 py-3 bg-white">
        <p
          className={`text-sm leading-relaxed text-gray-800 transition-all duration-300 ${
            blurred ? "blur-md select-none opacity-40" : ""
          }`}
        >
          {post.text}
        </p>

        {blurred && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/10 backdrop-blur-[2px]">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-red-700 active:scale-95"
            >
              ⚠️ View Harmful Content (Score: {(post.toxicity_score * 100).toFixed(0)}%)
            </button>
          </div>
        )}
      </div>

      {/* Footer: score + reveal/hide toggle */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">
            Toxicity Score:
          </span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${
              isToxic
                ? "bg-red-100 text-red-700 font-mono"
                : post.toxicity_score > 0.35
                ? "bg-amber-100 text-amber-800 font-mono"
                : "bg-emerald-100 text-emerald-800 font-mono"
            }`}
          >
            {post.toxicity_score.toFixed(4)}
          </span>
        </div>
        {isToxic && revealed && (
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 underline transition"
          >
            Hide harmful content
          </button>
        )}
      </div>
    </article>
  );
}
