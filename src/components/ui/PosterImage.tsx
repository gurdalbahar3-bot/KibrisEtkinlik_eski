"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { getGenericFallback } from "@/lib/ui/media-registry";

interface PosterImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  priority?: boolean;
  /** District-safe ordered fallbacks — tried on load error. */
  fallbackSources?: string[];
}

export function PosterImage({
  src,
  alt,
  fill = true,
  sizes,
  className = "object-cover",
  priority = false,
  fallbackSources,
}: PosterImageProps) {
  const chain = useMemo(() => {
    const ordered = fallbackSources?.length ? fallbackSources : [getGenericFallback()];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const url of [src, ...ordered]) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      unique.push(url);
    }
    return unique;
  }, [src, fallbackSources]);

  const [index, setIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const imgSrc = chain[index] ?? src;

  if (exhausted || !imgSrc) {
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
        if (index < chain.length - 1) {
          setIndex((i) => i + 1);
        } else {
          setExhausted(true);
        }
      }}
    />
  );
}
