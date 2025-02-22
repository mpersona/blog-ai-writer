import React, { useState, useEffect } from 'react';
import { PenLine, Loader2 } from 'lucide-react';
import { generateBlogContent } from './lib/openai';
import { supabase, getReferenceArticles } from './lib/supabase';
import { testUnsplashConnection } from './lib/unsplash-test';
import slugify from 'slugify';

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costInEuros: number;
}

function App() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);

  useEffect(() => {
    // Test Unsplash connection on component mount
    testUnsplashConnection().then(success => {
      if (!success) {
        setError('Failed to connect to Unsplash API. Please check your API key.');
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    setTokenUsage(null);

    try {
      // First, get reference articles
      const referenceUrls = await getReferenceArticles();
      console.log('Reference articles:', referenceUrls);

      // Generate content
      console.log('Generating content for topic:', topic);
      const { content, usage } = await generateBlogContent(topic, referenceUrls);
      console.log('Received content:', content);
      setTokenUsage(usage);
      
      const slug = slugify(content.headline, { lower: true, strict: true });
      console.log('Generated slug:', slug);

      // Insert into database
      const { error: supabaseError } = await supabase
        .from('blog_posts')
        .insert([{
          slug,
          headline: content.headline,
          primary_keywords: content.primaryKeywords,
          secondary_keywords: content.secondaryKeywords,
          outline: content.outline,
          introduction: content.introduction,
          body_copy: content.body_copy,
          full_article: content.full_article,
          section1: content.section1,
          section2: content.section2,
          section3: content.section3,
          section4: content.section4,
          section5: content.section5,
          image_urls: content.image_urls,
          alt_image_texts: content.alt_image_texts,
          published: true
        }]);

      if (supabaseError) {
        console.error('Supabase insert error:', supabaseError);
        throw supabaseError;
      }
      
      setSuccess(true);
      setTopic('');
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center">
          <PenLine className="mx-auto h-12 w-12 text-indigo-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Blog Post Generator
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter a topic and let AI create your complete blog post
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="topic" className="sr-only">
                Blog Topic
              </label>
              <textarea
                id="topic"
                name="topic"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your blog topic..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                  Generating Blog Post...
                </>
              ) : 'Generate Blog Post'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-4 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
            <strong>Error Details:</strong><br/>
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 space-y-4">
            <div className="p-4 text-sm text-green-600 bg-green-50 rounded-md border border-green-200">
              Blog post generated and saved successfully!
            </div>
            
            {tokenUsage && (
              <div className="p-4 text-sm bg-white rounded-md border border-gray-200">
                <h3 className="font-medium text-gray-900 mb-2">Token Usage & Costs</h3>
                <div className="space-y-1 text-gray-600">
                  <p>Prompt Tokens: {tokenUsage.promptTokens.toLocaleString()}</p>
                  <p>Completion Tokens: {tokenUsage.completionTokens.toLocaleString()}</p>
                  <p>Total Tokens: {tokenUsage.totalTokens.toLocaleString()}</p>
                  <p className="text-indigo-600 font-medium">
                    Cost: €{tokenUsage.costInEuros.toFixed(4)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;