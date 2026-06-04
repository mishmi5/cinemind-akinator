import { NextResponse } from 'next/server';

// מאגר פרימיום - כל סרט מוגדר עם ה-ID האמיתי שלו למניעת כפילויות
const FALLBACK_MOVIES = [
  { id: 155, posterUrl: "/api/poster?path=/qJ2tW6WMUDux911r6m7haRef0WH.jpg" }, // Dark Knight
  { id: 27205, posterUrl: "/api/poster?path=/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg" }, // Inception
  { id: 157336, posterUrl: "/api/poster?path=/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg" }, // Interstellar
  { id: 496243, posterUrl: "/api/poster?path=/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg" }, // Parasite
  { id: 680, posterUrl: "/api/poster?path=/d5iIlFn5s0ImszYzBPbOYKQruzY.jpg" }, // Pulp Fiction
  { id: 603, posterUrl: "/api/poster?path=/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg" }, // Matrix
  { id: 120, posterUrl: "/api/poster?path=/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg" }, // LOTR
  { id: 278, posterUrl: "/api/poster?path=/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg" }, // Shawshank
  { id: 550, posterUrl: "/api/poster?path=/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg" }, // Fight Club
  { id: 807, posterUrl: "/api/poster?path=/wgQ7APnFpf1TuviKHXeEe3KnsTV.jpg" }  // Se7en
];

export async function GET() {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  // שימוש במפה מבטיח שכל ID יופיע רק פעם אחת בלבד!
  let moviesMap = new Map<number, string>();

  // טעינת גיבויים קודם
  FALLBACK_MOVIES.forEach(m => moviesMap.set(m.id, m.posterUrl));

  try {
    if (TMDB_API_KEY) {
      const randomPage = Math.floor(Math.random() * 20) + 1; 
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=he-IL&page=${randomPage}`,
        { next: { revalidate: 0 } }
      );

      if (response.ok) {
        const data = await response.json();
        data.results.forEach((movie: any) => {
          if (movie.poster_path) {
            // אם הסרט כבר קיים בגיבוי, TMDB פשוט יעדכן את הפוסטר שלו, וכך אין כפילויות של אותו סרט!
            moviesMap.set(movie.id, `/api/poster?path=${movie.poster_path}`);
          }
        });
      }
    }
  } catch (error) {
    console.error('TMDB Fetch Error:', error);
  }

  // המרה חזרה למערך אובייקטים
  const uniqueMovies = Array.from(moviesMap.entries()).map(([id, posterUrl]) => ({ id, posterUrl }));
  return NextResponse.json({ movies: uniqueMovies }, { status: 200 });
}