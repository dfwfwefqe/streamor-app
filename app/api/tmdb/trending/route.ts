import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '8e2be4aa080a70388e9d3514dcc73339';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const MOCK_DATA = {
  results: [
    {
      id: 1,
      title: "Dune: Part Two",
      overview: "Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.",
      poster_path: "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
      backdrop_path: "/xOMo8BRK7PfcJv9JCnx7s520b4q.jpg",
      media_type: "movie",
      vote_average: 8.2,
      vote_count: 5200
    },
    {
      id: 2,
      name: "Fallout",
      overview: "The story of haves and have-nots in a world in which there's almost nothing left to have.",
      poster_path: "/AnsSKR9LuK0T9bAILezCxKGUTqq.jpg",
      backdrop_path: "/5f58359yuvv6tAwhbWkvf8yq.jpg",
      media_type: "tv",
      vote_average: 8.4,
      vote_count: 2100
    },
    {
      id: 3,
      title: "Kingdom of the Planet of the Apes",
      overview: "Several generations in the future following Caesar's reign, apes are now the dominant species.",
      poster_path: "/gKkl37BQuKTanygYQG1pyYgLVgf.jpg",
      backdrop_path: "/fqv8v6AycXKsivp1T5yKtLb2w9z.jpg",
      media_type: "movie",
      vote_average: 7.1,
      vote_count: 3100
    },
    {
      id: 4,
      title: "Oppenheimer",
      overview: "The story of J. Robert Oppenheimer’s role in the development of the atomic bomb during World War II.",
      poster_path: "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
      backdrop_path: "/rLb2cw6PxLwqxbtunioJwW8mGLz.jpg",
      media_type: "movie",
      vote_average: 8.1,
      vote_count: 8500
    }
  ]
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'all'; // 'all', 'movie', 'tv'

  if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key_here') {
    return NextResponse.json(MOCK_DATA);
  }

  try {
    const fetchPopularMovies = async () => {
      const res = await fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`, {
        next: { revalidate: 1800 }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map((m: any) => ({ ...m, media_type: 'movie' }));
    };

    const fetchPopularTv = async () => {
      const res = await fetch(`${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`, {
        next: { revalidate: 1800 }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map((t: any) => ({ ...t, media_type: 'tv' }));
    };

    const fetchTrendingWeekly = async () => {
      const res = await fetch(`${TMDB_BASE_URL}/trending/all/week?api_key=${TMDB_API_KEY}&language=en-US`, {
        next: { revalidate: 1800 }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    };

    let items: any[] = [];

    if (category === 'movie') {
      items = await fetchPopularMovies();
    } else if (category === 'tv') {
      items = await fetchPopularTv();
    } else {
      const [movies, tv, trending] = await Promise.all([
        fetchPopularMovies(),
        fetchPopularTv(),
        fetchTrendingWeekly()
      ]);

      // Combine and prioritize high-rated/popular content
      const map = new Map<number, any>();
      for (const item of [...trending, ...movies, ...tv]) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      }
      items = Array.from(map.values());
    }

    // Filter out obscure titles with no poster or very low vote count (< 100) or antique unseeded titles
    const curated = items
      .filter((item: any) => {
        const hasPoster = !!item.poster_path;
        const hasVotes = (item.vote_count || 0) >= 100;
        const isNotPerson = item.media_type !== 'person';
        const year = parseInt((item.release_date || item.first_air_date || '').split('-')[0], 10);
        const isModern = !year || year >= 1995;
        return hasPoster && hasVotes && isNotPerson && isModern;
      })
      // Sort by popularity and vote count
      .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));

    return NextResponse.json({ results: curated });
  } catch (error: any) {
    console.error('TMDB Curated Trending Error:', error.message);
    return NextResponse.json(MOCK_DATA);
  }
}
