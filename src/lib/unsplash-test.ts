import { createApi } from 'unsplash-js';

const UNSPLASH_API_URL = 'https://api.unsplash.com';
const ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY?.trim(); // Trim any whitespace

console.log('Testing Unsplash connection with key:', ACCESS_KEY?.substring(0, 8) + '...');

export async function testUnsplashConnection() {
  try {
    // Try a simple search
    const url = new URL(`${UNSPLASH_API_URL}/photos/random`);
    url.searchParams.append('query', 'nature');
    url.searchParams.append('count', '1');
    url.searchParams.append('client_id', ACCESS_KEY);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept-Version': 'v1',
        'Content-Type': 'application/json',
      }
    });

    const responseText = await response.text();
    console.log('Raw Response:', responseText);

    console.log('Test Response:', {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      console.error('Test Error Response:', {
        status: response.status,
        statusText: response.statusText,
        responseText,
        headers: Object.fromEntries(response.headers.entries())
      });
    }

    return response.ok;
  } catch (error) {
    console.error('Test Error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}
