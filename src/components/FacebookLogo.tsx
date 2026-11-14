import React from 'react';

interface FacebookLogoProps {
  className?: string;
}

export const FacebookLogo: React.FC<FacebookLogoProps> = ({ className = 'w-6 h-6' }) => {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect width="36" height="36" rx="10" fill="#1877F2" />
      <path
        d="M24.2 23.2L25 18H20V14.6C20 13.18 20.7 11.8 22.94 11.8H25.22V7.36C25.22 7.36 23.16 7 21.18 7C17.06 7 14.36 9.5 14.36 14.04V18H9.8V23.2H14.36V36H20V23.2H24.2Z"
        fill="#FFFFFF"
      />
    </svg>
  );
};
