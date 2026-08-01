'use client';

import MediaCard from './MediaCard';

interface MediaGridProps {
  items: any[];
  title: string;
  loading?: boolean;
}

export default function MediaGrid({ items, title, loading }: MediaGridProps) {
  if (loading) {
    return (
      <section className="py-8 px-6">
        <h2 className="text-2xl font-bold text-white mb-6 tracking-wide">{title}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-gray-800/50 animate-pulse border border-white/5"></div>
          ))}
        </div>
      </section>
    );
  }

  if (!items || items.length === 0) {
    return (
      <section className="py-12 px-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h3 className="text-xl font-medium text-gray-300">No results found</h3>
        <p className="text-gray-500 mt-2">Try adjusting your search query.</p>
      </section>
    );
  }

  return (
    <section className="py-8 px-6">
      <h2 className="text-2xl font-bold text-white mb-6 tracking-wide">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {items.map((item) => (
          <MediaCard key={item.id} media={item} />
        ))}
      </div>
    </section>
  );
}
