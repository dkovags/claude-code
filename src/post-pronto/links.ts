// Links para ouvir as músicas sugeridas e conferir os lugares no mapa.

const q = encodeURIComponent;

export const spotifySearch = (s: string) => `https://open.spotify.com/search/${q(s)}`;
export const youtubeSearch = (s: string) => `https://www.youtube.com/results?search_query=${q(s)}`;
export const mapsSearch = (s: string) => `https://www.google.com/maps/search/?api=1&query=${q(s)}`;
export const mapsPoint = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
