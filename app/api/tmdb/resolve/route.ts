import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const apiKey = process.env.TMDB_API_KEY || '8e2be4aa080a70388e9d3514dcc73339';

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    // 1. Try TV Series API
    let res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const extRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/external_ids?api_key=${apiKey}`);
      const extData = extRes.ok ? await extRes.json() : {};
      return NextResponse.json({
        type: 'series',
        title: data.name,
        imdbId: extData.imdb_id || ''
      });
    }

    // 2. Try Movie API
    res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const extRes = await fetch(`https://api.themoviedb.org/3/movie/${id}/external_ids?api_key=${apiKey}`);
      const extData = extRes.ok ? await extRes.json() : {};
      return NextResponse.json({
        type: 'movie',
        title: data.title,
        imdbId: extData.imdb_id || ''
      });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
