import { createApi } from 'unsplash-js';

// Log the API key (first few characters only for security)
const apiKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
console.log('Unsplash API Key (first 8 chars):', apiKey?.substring(0, 8));

interface UnsplashImage {
  url: string;
  alt_text: string;
}

const UNSPLASH_API_URL = 'https://api.unsplash.com';
const ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY?.trim(); // Trim any whitespace

console.log('Unsplash API Key (first 8 chars):', ACCESS_KEY?.substring(0, 8));

export async function searchUnsplashImage(query: string): Promise<UnsplashImage> {
  try {
    console.log('Searching Unsplash for:', query);
    
    const url = new URL(`${UNSPLASH_API_URL}/search/photos`);
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

    console.log('Unsplash API Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Unsplash API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        headers: Object.fromEntries(response.headers.entries())
      });
      throw new Error(`Unsplash API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Unsplash API Response:', {
      totalResults: data.total,
      hasResults: data.results?.length > 0
    });

    const photo = data.results?.[0];
    if (!photo) {
      console.error('No photos found for query:', query);
      throw new Error('No images found for the given query');
    }

    console.log('Found photo:', {
      id: photo.id,
      hasUrl: !!photo.urls?.regular,
      hasAltDesc: !!photo.alt_description,
      hasDesc: !!photo.description
    });

    return {
      url: photo.urls.regular,
      alt_text: photo.alt_description || photo.description || query
    };
  } catch (error) {
    console.error('Detailed Unsplash API Error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      query,
      apiKeyLength: ACCESS_KEY?.length,
      apiKeyStart: ACCESS_KEY?.substring(0, 8)
    });
    
    if (error instanceof Error && error.message.includes('401')) {
      throw new Error(`Unsplash API authentication failed. Please ensure:
1. You're using the Access Key (Client ID), not the Secret Key
2. The key is correctly copied with no extra spaces
3. The key is properly set in your .env file
Current key starts with: ${ACCESS_KEY?.substring(0, 8)}...`);
    }
    
    throw new Error('Failed to fetch image from Unsplash. Check console for details.');
  }
}
