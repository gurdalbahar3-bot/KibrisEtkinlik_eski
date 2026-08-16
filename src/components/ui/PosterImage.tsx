"use client";

import Image from "next/image";
import { useState } from "react";
import { MEDIA } from "@/lib/data/media-urls";

interface PosterImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  priority?: boolean;
}

export function PosterImage({
  src,
  alt,
  fill = true,
  sizes,
  className = "object-cover",
  priority = false,
}: PosterImageProps) {
  const [imgSrc, setImgSrc] = useState(src);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`absolute inset-0 bg-gradient-to-br from-brand-800 via-brand-900 to-slate-900 ${className}`}
        role="img"
        aria-label={alt}
      />
    );
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill={fill}
      sizes={sizes}
      className={className}
      priority={priority}
      onError={() => {
        if (imgSrc !== MEDIA.posters.fallback) {
          setImgSrc(MEDIA.posters.fallback);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
