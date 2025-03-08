import { supabase } from './supabase';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

// Function to enrich a single blog post
async function enrichBlogPost(blogPost: any) {
  try {
    if (!blogPost.reference_articles || blogPost.reference_articles.length === 0) {
      console.log('No reference articles found for blog post:', blogPost.id);
      return null;
    }

    // Create prompt for ChatGPT
    const prompt = `Als erfahrener Content Writer sollst du den folgenden Blogartikel verbessern.
    Lies die Inhalte von diesen Referenzartikeln und baue relevante Informationen daraus ein:
    ${blogPost.reference_articles.join('\n')}

    Originalartikel:
    ${blogPost.full_article}

    Wichtige Anweisungen:
    1. Behalte die Markdown-Formatierung bei
    2. Integriere relevante Informationen aus den Referenzartikeln natürlich in den Text
    3. Behalte die ursprüngliche Struktur bei
    4. Stelle sicher, dass der Text kohärent und flüssig bleibt
    5. Füge keine neuen Überschriften hinzu
    6. Behalte den Schreibstil bei

    Liefere nur den verbesserten Artikeltext zurück, ohne zusätzliche Erklärungen.`;

    // Get improved version from ChatGPT
    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",  // Using GPT-4 as it has better web browsing capabilities
      temperature: 0.7,
    });

    const improvedArticle = completion.choices[0].message.content;

    if (!improvedArticle) {
      throw new Error('No response from ChatGPT');
    }

    // Update the blog post in Supabase
    const { error } = await supabase
      .from('blog_posts')
      .update({ enriched_article: improvedArticle })
      .eq('id', blogPost.id);

    if (error) {
      throw error;
    }

    return improvedArticle;
  } catch (error) {
    console.error('Error enriching blog post:', error);
    return null;
  }
}

// Main function to process all blog posts
export async function enrichAllBlogPosts() {
  try {
    // Fetch blog posts that haven't been enriched yet
    const { data: blogPosts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .is('enriched_article', null)
      .not('reference_articles', 'eq', '[]');

    if (error) {
      throw error;
    }

    console.log(`Found ${blogPosts.length} blog posts to enrich`);

    // Process each blog post
    for (const blogPost of blogPosts) {
      console.log(`Processing blog post: ${blogPost.id}`);
      await enrichBlogPost(blogPost);
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('Finished enriching blog posts');
  } catch (error) {
    console.error('Error in enrichAllBlogPosts:', error);
    throw error;
  }
} 