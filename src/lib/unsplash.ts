import { createApi } from 'unsplash-js';

const ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY?.trim();
console.log('Unsplash API Key (first 8 chars):', ACCESS_KEY?.substring(0, 8));

// Match the interface that OpenAI expects
interface UnsplashResponse {
  urls: {
    regular: string;
  };
  description: string | null;
  alt_description: string | null;
}

export async function searchUnsplashImage(query: string): Promise<UnsplashResponse | null> {
  try {
    console.log('Searching Unsplash for:', query);
    
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.append('query', query);
    url.searchParams.append('per_page', '1');
    url.searchParams.append('orientation', 'landscape');
    url.searchParams.append('client_id', ACCESS_KEY);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept-Version': 'v1',
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const photo = data.results?.[0];
    
    if (!photo) {
      console.warn('No photos found for query:', query);
      return null;
    }

    return {
      urls: {
        regular: photo.urls.regular
      },
      description: photo.description,
      alt_description: photo.alt_description
    };
  } catch (error) {
    console.error('Unsplash API Error:', error);
    return null;
  }
}
