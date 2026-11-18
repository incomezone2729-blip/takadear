import React from 'react';

interface BkashLogoProps {
  className?: string;
}

export const BkashLogo: React.FC<BkashLogoProps> = ({ className = 'w-7 h-7' }) => {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="bkashBg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0237B" />
          <stop offset="100%" stopColor="#C10E59" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#bkashBg)" />
      {/* Origami bird silhouette inspired by bKash brand emblem */}
      <path d="M10.5 11.5L19.6 18.8L17.2 26.2L10.5 11.5Z" fill="#FFFFFF" />
      <path d="M19.6 18.8L29.5 13.5L23.2 24.4L19.6 18.8Z" fill="#FFFFFF" fillOpacity="0.92" />
      <path d="M17.2 26.2L23.2 24.4L27.4 28.5L14.5 29.2L17.2 26.2Z" fill="#FFE4F0" />
      <path d="M29.5 13.5L32.5 14.8L28.4 17.5L29.5 13.5Z" fill="#FFFFFF" fillOpacity="0.85" />
    </svg>
  );
};
