'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useUiStore } from '../store/uiStore';

interface MediaCardProps {
  media: {
    id: number;
    title?: string;
    name?: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    media_type?: string;
  };
}

export default function MediaCard({ media }: MediaCardProps) {
  const [imageError, setImageError] = useState(false);
  const openRoomModal = useUiStore((state) => state.openRoomModal);

  const title = media.title || media.name || 'Unknown Title';
  const imageUrl = media.poster_path
    ? `https://image.tmdb.org/t/p/w500${media.poster_path}`
    : 'https://placehold.co/400x600/18181b/a1a1aa?text=No+Poster';

  return (
    <div
      className="group relative flex flex-col cursor-pointer overflow-hidden rounded-xl bg-gray-900 border border-white/5 shadow-lg transition-all duration-300 hover:scale-[1.03] hover:shadow-purple-500/20 hover:border-purple-500/30"
      onClick={() => openRoomModal(media)}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-800">
        {!imageError ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => setImageError(true)}
            unoptimized // Using unoptimized for external TMDB images in this sprint to bypass domain config if not set
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 p-4 text-center">
            <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="text-sm font-medium">{title}</span>
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <p className="text-white font-bold truncate">{title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 rounded bg-purple-600/80 text-white backdrop-blur-sm">Watch Party</span>
          </div>
        </div>
      </div>
    </div>
  );
}
