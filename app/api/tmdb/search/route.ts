import { NextResponse } from 'next/server';
import { z } from 'zod';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const searchSchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters").max(100, "Search query too long")
});

const MOCK_SEARCH_DATA = {
  results: [
    {
      id: 991,
      title: "Search Result 1 (Mock)",
      overview: "This is a mock search result because the TMDB API key is missing or the network failed.",
      poster_path: null,
      backdrop_path: null,
      media_type: "movie"
    },
    {
      id: 992,
      name: "Search Result 2 (Mock)",
      overview: "Another mock result for your search query.",
      poster_path: null,
      backdrop_path: null,
      media_type: "tv"
    }
  ]
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  const validation = searchSchema.safeParse({ q });

  if (!validation.success) {
    return NextResponse.json({ error: validation.error.errors[0].message }, { status: 400 });
  }

  if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key_here') {
    console.warn(`TMDB API key missing. Serving mock search data for query: ${validation.data.q}`);
    return NextResponse.json(MOCK_SEARCH_DATA);
  }

  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&language=en-US&query=${encodeURIComponent(validation.data.q)}&page=1`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      throw new Error(`TMDB API responded with status ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('TMDB Search Error:', error.message);
    console.warn('Fallback to mock data due to fetch failure.');
    return NextResponse.json(MOCK_SEARCH_DATA);
  }
}
