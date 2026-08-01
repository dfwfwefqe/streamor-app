import { NextResponse } from 'next/server';

const YTS_MIRRORS = [
  'https://yts.mx',
  'https://yts.rs',
  'https://yts.torrentbay.to',
  'https://yts.do'
];

const TRACKERS = [
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:80',
  'udp://tracker.coppersurfer.tk:6969',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://p4p.arenabg.com:1337',
  'udp://tracker.leechers-paradise.org:6969'
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'query param q is required' }, { status: 400 });
  }

  for (const mirror of YTS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(
        `${mirror}/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&sort_by=seeds&limit=5`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) continue;

      const data = await res.json();

      if (data?.status !== 'ok' || !data?.data?.movies?.length) continue;

      const movie = data.data.movies[0];
      const trackerQuery = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');

      const results = (movie.torrents || []).map((t: any) => ({
        title: movie.title,
        quality: t.quality || 'Unknown',
        size: t.size || 'Unknown',
        magnet: `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}&${trackerQuery}`
      }));

      return NextResponse.json({ results });
    } catch (e: any) {
      console.warn(`[YTS Proxy] Mirror ${mirror} failed:`, e.message);
      continue;
    }
  }

  // All mirrors failed
  return NextResponse.json({ results: [] });
}
