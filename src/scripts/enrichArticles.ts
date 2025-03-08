import { enrichAllBlogPosts } from '../lib/enrichArticle';
import { supabase } from '../lib/supabase';

async function main() {
  try {
    console.log('Starting blog post enrichment process...');
    const { data: blogPosts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .is('enriched_article', null)           // Only gets posts where enriched_article is null
      .not('reference_articles', 'eq', '[]'); // Only gets posts with at least one reference article

    if (error) {
      console.error('Error fetching blog posts:', error);
      process.exit(1);
    }

    await enrichAllBlogPosts();
    console.log('Blog post enrichment completed successfully!');
  } catch (error) {
    console.error('Error in enrichment process:', error);
    process.exit(1);
  }
}

main(); 