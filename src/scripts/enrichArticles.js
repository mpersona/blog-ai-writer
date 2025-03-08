import OpenAI from 'openai';
import { supabase } from '../lib/supabase';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

async function enrichBlogPost(blogPost) {
  try {
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
    6. Behalte den Schreibstil bei`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      temperature: 0.7,
    });

    // Update the blog post in Supabase
    await supabase
      .from('blog_posts')
      .update({ 
        enriched_article: completion.choices[0].message.content 
      })
      .eq('id', blogPost.id);

    console.log(`Updated blog post ${blogPost.id}`);
  } catch (error) {
    console.error(`Error processing blog post ${blogPost.id}:`, error);
  }
}

async function main() {
  try {
    // Get all blog posts that need enrichment
    const { data: blogPosts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .is('enriched_article', null)
      .not('reference_articles', 'eq', '[]');

    if (error) throw error;

    console.log(`Found ${blogPosts.length} blog posts to enrich`);

    // Process each blog post
    for (const blogPost of blogPosts) {
      console.log(`Processing blog post: ${blogPost.id}`);
      await enrichBlogPost(blogPost);
      // Wait 1 second between posts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('All done!');
  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 