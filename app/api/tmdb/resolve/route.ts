import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const title = searchParams.get('title') || searchParams.get('q');
  const apiKey = process.env.TMDB_API_KEY || '8e2be4aa080a70388e9d3514dcc73339';

  if (!id && !title) {
    return NextResponse.json({ error: 'Missing id or title' }, { status: 400 });
  }

  try {
    let resolvedId = id;
    let resolvedType: 'movie' | 'series' | null = null;
    let resolvedTitle = '';

    if (!resolvedId && title) {
      const searchRes = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(title)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const first = searchData?.results?.find((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
        if (first) {
          resolvedId = String(first.id);
          resolvedType = first.media_type === 'tv' ? 'series' : 'movie';
          resolvedTitle = first.title || first.name || '';
        }
      }
    }

    if (!resolvedId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 1. Try TV Series API (or if resolvedType is series)
    if (!resolvedType || resolvedType === 'series') {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${resolvedId}?api_key=${apiKey}`);
      if (res.ok) {
        const data = await res.json();
        const extRes = await fetch(`https://api.themoviedb.org/3/tv/${resolvedId}/external_ids?api_key=${apiKey}`);
        const extData = extRes.ok ? await extRes.json() : {};
        return NextResponse.json({
          type: 'series',
          title: data.name || resolvedTitle,
          imdbId: extData.imdb_id || ''
        });
      }
    }

    // 2. Try Movie API
    const res = await fetch(`https://api.themoviedb.org/3/movie/${resolvedId}?api_key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const extRes = await fetch(`https://api.themoviedb.org/3/movie/${resolvedId}/external_ids?api_key=${apiKey}`);
      const extData = extRes.ok ? await extRes.json() : {};
      return NextResponse.json({
        type: 'movie',
        title: data.title || resolvedTitle,
        imdbId: extData.imdb_id || ''
      });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
