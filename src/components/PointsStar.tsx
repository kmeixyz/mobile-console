import { useId } from "react";

/** A soft, rounded gold star standing in for the word "points"; it sizes with the score. */
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
          <stop offset="0" stopColor="#ffd84d" />
          <stop offset="1" stopColor="#ffab1f" />
        </linearGradient>
      </defs>
      {/* A same-color stroke with round joins rounds the star's points. */}
      <polygon
        points="12,3.2 14.7,8.9 20.9,9.6 16.3,13.9 17.5,20.1 12,17 6.5,20.1 7.7,13.9 3.1,9.6 9.3,8.9"
        fill={`url(#${shine})`}
        stroke={`url(#${shine})`}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M9.6 10.6 11.2 7.9" stroke="#fff" strokeOpacity=".7" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
