'use client';

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: { outer: 20, inner: 16 },
  md: { outer: 40, inner: 32 },
  lg: { outer: 60, inner: 48 },
};

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const { outer, inner } = sizeMap[size];

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className="relative animate-spin"
        style={{
          width: outer,
          height: outer,
          backgroundImage: 'linear-gradient(rgb(186, 66, 255) 35%, rgb(0, 225, 255))',
          borderRadius: '50%',
          filter: 'blur(0.5px)',
          boxShadow: '0px -3px 10px 0px rgba(186, 66, 255, 0.6), 0px 3px 10px 0px rgba(0, 225, 255, 0.6)',
          animationDuration: '1.7s',
        }}
      >
        <div
          className="absolute bg-gray-900"
          style={{
            width: inner,
            height: inner,
            borderRadius: '50%',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    </div>
  );
}
