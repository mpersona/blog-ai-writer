import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getReferenceArticles() {
  const { data, error } = await supabase
    .from('reference_articles')
    .select('urls');
  
  if (error) {
    throw new Error(`Failed to fetch reference articles: ${error.message}`);
  }
  
  return data.map(article => article.urls);
}