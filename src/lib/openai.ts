import OpenAI from 'openai';
import { searchUnsplashImage } from './unsplash';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
  baseURL: 'https://api.openai.com/v1',
});

// Add a check for the API key
if (!import.meta.env.VITE_OPENAI_API_KEY) {
  console.error('OpenAI API key is not set in environment variables');
}

interface BlogContent {
  headline: string;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  outline: string[];
  introduction: string;
  body_copy: string;
  full_article: string;
  image_urls: string[];
  alt_image_texts: string[];
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costInEuros: number;
}

// GPT-4 pricing in euros (as of 2024)
const GPT4_PRICING = {
  promptTokens: 0.00003, // €0.03 per 1K tokens
  completionTokens: 0.00006, // €0.06 per 1K tokens
};

export const generateBlogContent = async (topic: string, referenceUrls: string[]): Promise<{ content: BlogContent; usage: TokenUsage }> => {
  try {
    console.log('OpenAI Configuration:', {
      apiKeyExists: !!import.meta.env.VITE_OPENAI_API_KEY,
      apiKeyLength: import.meta.env.VITE_OPENAI_API_KEY?.length
    });

    if (!import.meta.env.VITE_OPENAI_API_KEY) {
      throw new Error('OpenAI API key is missing. Please check your .env file.');
    }

    if (!import.meta.env.VITE_OPENAI_API_KEY.startsWith('sk-')) {
      throw new Error('Invalid OpenAI API key format. The key should start with "sk-"');
    }

    let totalUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costInEuros: 0
    };

    // First, analyze the reference articles to understand their style
    const styleAnalysisPrompt = `Analyze the writing style, tone, and structure of these articles:
    ${referenceUrls.join('\n')}
    
    Provide a brief description of their common writing patterns, tone, and structural elements.`;

    console.log('Sending request to OpenAI for style analysis...');
    try {
      const styleAnalysis = await openai.chat.completions.create({
        messages: [{ role: "user", content: styleAnalysisPrompt }],
        model: "gpt-4",
        temperature: 0.7,
      });
      console.log('Received response from OpenAI for style analysis');

      // Add style analysis usage
      totalUsage.promptTokens += styleAnalysis.usage?.prompt_tokens || 0;
      totalUsage.completionTokens += styleAnalysis.usage?.completion_tokens || 0;
      totalUsage.totalTokens += styleAnalysis.usage?.total_tokens || 0;

      const styleGuide = styleAnalysis.choices[0].message.content;

      // Generate image queries based on the topic
      const imageQueryPrompt = `Generate 3 specific image search queries for Unsplash that would be relevant for a blog post about "${topic}".
      The queries should be descriptive and specific to get high-quality, relevant images.
      
      Format your response as a valid JSON array of strings, like this:
      ["query 1", "query 2", "query 3"]`;

      console.log('Sending request to OpenAI for image queries...');
      try {
        const imageQueryCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: imageQueryPrompt }],
          model: "gpt-4",
          temperature: 0.7,
        });
        console.log('Received response from OpenAI for image queries');

        totalUsage.promptTokens += imageQueryCompletion.usage?.prompt_tokens || 0;
        totalUsage.completionTokens += imageQueryCompletion.usage?.completion_tokens || 0;
        totalUsage.totalTokens += imageQueryCompletion.usage?.total_tokens || 0;

        let imageQueries: string[];
        try {
          imageQueries = JSON.parse(imageQueryCompletion.choices[0].message.content || '[]');
          if (!Array.isArray(imageQueries) || imageQueries.length === 0) {
            throw new Error('Invalid image queries format');
          }
        } catch (error) {
          console.error('Failed to parse image queries:', error);
          imageQueries = [topic]; // Fallback to using the topic as a query
        }

        // Fetch images from Unsplash
        const images = await Promise.all(
          imageQueries.map(query => searchUnsplashImage(query))
        );

        // Now generate the blog post structure
        const structurePrompt = `Create a blog post structure about "${topic}". 
          
        Important: Ensure your response is valid JSON. Format your response exactly like this:
        {
          "headline": "Your SEO-optimized headline here",
          "primaryKeywords": ["keyword1", "keyword2", "keyword3"],
          "secondaryKeywords": ["keyword4", "keyword5", "keyword6"],
          "outline": ["Section 1: Introduction", "Section 2: Main Point", "Section 3: Another Point"]
        }
        
        Requirements:
        1. The headline should be engaging and SEO-friendly
        2. Include 3-5 primary keywords
        3. Include 3-5 secondary keywords
        4. Create 5-7 main sections in the outline
        5. Ensure all text is properly escaped for JSON`;

        console.log('Sending request to OpenAI for structure...');
        try {
          const structureCompletion = await openai.chat.completions.create({
            messages: [{ role: "user", content: structurePrompt }],
            model: "gpt-4",
            temperature: 0.7,
          });
          console.log('Received response from OpenAI for structure');

          // Add structure completion usage
          totalUsage.promptTokens += structureCompletion.usage?.prompt_tokens || 0;
          totalUsage.completionTokens += structureCompletion.usage?.completion_tokens || 0;
          totalUsage.totalTokens += structureCompletion.usage?.total_tokens || 0;

          let structure;
          try {
            const content = structureCompletion.choices[0].message.content;
            if (!content) {
              throw new Error('No content received from OpenAI');
            }

            // Sanitize the content
            const sanitizedContent = content
              .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
              .replace(/\\n/g, '\\n')  // Properly escape newlines
              .replace(/\\"/g, '\\"'); // Properly escape quotes

            structure = JSON.parse(sanitizedContent);

            // Validate the required fields
            if (!structure.headline || !Array.isArray(structure.primaryKeywords) || 
                !Array.isArray(structure.secondaryKeywords) || !Array.isArray(structure.outline)) {
              throw new Error('Missing required fields in the structure response');
            }
          } catch (parseError) {
            console.error('Failed to parse OpenAI response:', structureCompletion.choices[0].message.content);
            throw new Error('Failed to parse blog structure. Please try again.');
          }

          // Finally, generate the full blog post
          const blogPostPrompt = `Write a comprehensive blog post about "${topic}" following this structure:
          
          Headline: ${structure.headline}
          Outline: ${JSON.stringify(structure.outline)}
          
          Style Guide: ${styleGuide}
          
          Requirements:
          1. Write in markdown format
          2. Create an engaging introduction that hooks the reader
          3. Follow the provided outline for the main content
          4. Maintain the style and tone from the reference articles
          5. Naturally incorporate the keywords: ${[...structure.primaryKeywords, ...structure.secondaryKeywords].join(', ')}
          
          Important: Ensure your response is valid JSON. Escape any special characters in the content.
          Format your response exactly like this, with proper JSON escaping:
          {
            "introduction": "Your introduction text here...",
            "body_copy": "Your main content here...",
            "full_article": "Complete article here..."
          }`;

          console.log('Sending request to OpenAI for full blog post...');
          try {
            const blogPostCompletion = await openai.chat.completions.create({
              messages: [{ role: "user", content: blogPostPrompt }],
              model: "gpt-4",
              temperature: 0.7,
            });
            console.log('Received response from OpenAI for full blog post');

            // Add blog post completion usage
            totalUsage.promptTokens += blogPostCompletion.usage?.prompt_tokens || 0;
            totalUsage.completionTokens += blogPostCompletion.usage?.completion_tokens || 0;
            totalUsage.totalTokens += blogPostCompletion.usage?.total_tokens || 0;

            // Calculate total cost in euros
            totalUsage.costInEuros = (
              (totalUsage.promptTokens * GPT4_PRICING.promptTokens) +
              (totalUsage.completionTokens * GPT4_PRICING.completionTokens)
            );

            let blogPost;
            try {
              const content = blogPostCompletion.choices[0].message.content;
              if (!content) {
                throw new Error('No content received from OpenAI');
              }

              // Sanitize the content to handle any special characters
              const sanitizedContent = content
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
                .replace(/\\n/g, '\\n')  // Properly escape newlines
                .replace(/\\"/g, '\\"'); // Properly escape quotes

              blogPost = JSON.parse(sanitizedContent);

              // Validate the required fields
              if (!blogPost.introduction || !blogPost.body_copy || !blogPost.full_article) {
                throw new Error('Missing required fields in the blog post response');
              }
            } catch (parseError) {
              console.error('Failed to parse OpenAI response:', blogPostCompletion.choices[0].message.content);
              throw new Error('Failed to parse blog post content. Please try again.');
            }

            return {
              content: {
                ...structure,
                ...blogPost,
                image_urls: images.map(img => img.url),
                alt_image_texts: images.map(img => img.alt_text)
              },
              usage: totalUsage
            };
          } catch (apiError) {
            if (apiError instanceof Error) {
              if (apiError.message.includes('401')) {
                throw new Error('OpenAI API key is invalid. Please check your API key in the .env file.');
              }
              if (apiError.message.includes('429')) {
                throw new Error('OpenAI API rate limit exceeded. Please try again in a few moments.');
              }
              throw new Error(`OpenAI API Error: ${apiError.message}`);
            }
            throw new Error('Failed to communicate with OpenAI');
          }
        } catch (apiError) {
          if (apiError instanceof Error) {
            if (apiError.message.includes('401')) {
              throw new Error('OpenAI API key is invalid. Please check your API key in the .env file.');
            }
            if (apiError.message.includes('429')) {
              throw new Error('OpenAI API rate limit exceeded. Please try again in a few moments.');
            }
            throw new Error(`OpenAI API Error: ${apiError.message}`);
          }
          throw new Error('Failed to communicate with OpenAI');
        }
      } catch (apiError) {
        if (apiError instanceof Error) {
          if (apiError.message.includes('401')) {
            throw new Error('OpenAI API key is invalid. Please check your API key in the .env file.');
          }
          if (apiError.message.includes('429')) {
            throw new Error('OpenAI API rate limit exceeded. Please try again in a few moments.');
          }
          throw new Error(`OpenAI API Error: ${apiError.message}`);
        }
        throw new Error('Failed to communicate with OpenAI');
      }
    } catch (error) {
      console.error('OpenAI API Error:', error);
      if (error instanceof Error) {
        throw new Error(`OpenAI API Error: ${error.message}`);
      }
      throw new Error('An unexpected error occurred while generating content');
    }
  } catch (error) {
    console.error('OpenAI API Error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while generating content');
  }
};