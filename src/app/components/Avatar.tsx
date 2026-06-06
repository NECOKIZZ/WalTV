import { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, alt = 'User avatar', size = 34, className = '' }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  const isValid = src && src.trim().length > 0 && !src.includes('undefined') && !src.includes('null');
  const imgSrc = !isValid || hasError ? '/walrus.png' : src;

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={`rounded-full object-cover object-center ${className}`}
      style={{ width: size, height: size }}
      onError={() => setHasError(true)}
    />
  );
}
