import { useId } from "react";

/** A smiling gold star standing in for the word "points"; it sizes with the score. */
export default function PointsStar() {
  const shine = useId();
  return (
    <svg
      className="points-star"
      viewBox="0 0 24 24"
      role="img"
      aria-label="points"
    >
      <defs>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffec9a" />
          <stop offset="1" stopColor="#ffc533" />
        </linearGradient>
      </defs>
      <polygon
        points="12,3 14.88,9.04 21.51,9.91 16.66,14.51 17.88,21.09 12,17.9 6.12,21.09 7.34,14.51 2.49,9.91 9.12,9.04"
        fill={`url(#${shine})`}
        stroke="#f0a91f"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <ellipse cx="9.2" cy="10.4" rx="1.5" ry="0.8" fill="#fff" opacity="0.75" transform="rotate(-35 9.2 10.4)" />
      <circle cx="10.1" cy="13.3" r="0.85" fill="#7a4a12" />
      <circle cx="13.9" cy="13.3" r="0.85" fill="#7a4a12" />
      <path d="M10.4 15.2q1.6 1.3 3.2 0" fill="none" stroke="#7a4a12" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}
