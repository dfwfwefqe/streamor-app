import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const MOCK_DATA = {
  results: [
    {
      id: 1,
      title: "The Fall Guy (Mock)",
      overview: "He's a stuntman, and like everyone in the stunt community, he gets blown up, shot, crashed, thrown through windows and dropped from the highest of heights, all for our entertainment.",
      poster_path: null,
      backdrop_path: null,
      media_type: "movie"
    },
    {
      id: 2,
      name: "Fallout (Mock)",
      overview: "The story of haves and have-nots in a world in which there's almost nothing left to have. 200 years after the apocalypse, the gentle denizens of luxury fallout shelters are forced to return to the irradiated hellscape their ancestors left behind.",
      poster_path: null,
      backdrop_path: null,
      media_type: "tv"
    },
    {
      id: 3,
      title: "Kingdom of the Planet of the Apes (Mock)",
      overview: "Several generations in the future following Caesar's reign, apes are now the dominant species and live harmoniously while humans have been reduced to living in the shadows.",
      poster_path: null,
      backdrop_path: null,
      media_type: "movie"
    },
    {
      id: 4,
      title: "Dune: Part Two (Mock)",
      overview: "Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.",
      poster_path: null,
      backdrop_path: null,
      media_type: "movie"
    }
  ]
};

export async function GET() {
  if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key_here') {
    console.warn('TMDB API key not configured properly. Serving mock data.');
    return NextResponse.json(MOCK_DATA);
  }

  try {
    const res = await fetch(`${TMDB_BASE_URL}/trending/all/day?api_key=${TMDB_API_KEY}&language=en-US`, {
      next: { revalidate: 3600 }
    });

    if (!res.ok) {
      throw new Error(`TMDB API responded with status ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('TMDB Trending Error:', error.message);
    console.warn('Fallback to mock data due to fetch failure.');
    return NextResponse.json(MOCK_DATA);
  }
}
