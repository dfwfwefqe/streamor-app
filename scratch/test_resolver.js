const apiKey = process.env.TMDB_API_KEY || '8e2be4aa080a70388e9d3514dcc73339';
const input = '1416'; // Grey's Anatomy TMDB ID

async function test() {
  console.log("Fetching TMDB API...");
  const tvRes = await fetch(`https://api.themoviedb.org/3/tv/${input}?api_key=${apiKey}`);
  if (tvRes.ok) {
    const tvData = await tvRes.json();
    console.log("TV Name:", tvData.name);
    const extRes = await fetch(`https://api.themoviedb.org/3/tv/${input}/external_ids?api_key=${apiKey}`);
    const extData = await extRes.json();
    console.log("IMDB ID:", extData.imdb_id);
    
    // Now try Torrentio
    const imdbId = extData.imdb_id;
    const torrentioUrl = `https://torrentio.strem.fun/stream/series/${imdbId}:1:1.json`;
    console.log("Fetching Torrentio:", torrentioUrl);
    const streamRes = await fetch(torrentioUrl);
    if(streamRes.ok) {
        const streamData = await streamRes.json();
        console.log("Torrentio streams:", streamData?.streams?.length);
    } else {
        console.log("Torrentio failed:", streamRes.status);
    }
  } else {
    console.log("TMDB failed:", tvRes.status);
  }
}
test();
