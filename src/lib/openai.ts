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
  article_long: string;
  image_urls: string[];
  alt_image_texts: string[];
  section1: { title: string; content: string };
  section2: { title: string; content: string };
  section3: { title: string; content: string };
  section4: { title: string; content: string };
  section5: { title: string; content: string };
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

// Helper function to safely parse JSON response
const safeJsonParse = (text: string | undefined, fallback: any = {}) => {
  if (!text) return fallback;
  try {
    // Clean the text before parsing
    const cleanText = text
      // Remove control characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      // Properly escape newlines
      .replace(/\n/g, '\\n')
      // Properly escape quotes
      .replace(/\\"/g, '\\"')
      // Remove any potential markdown formatting
      .replace(/```json/g, '')
      .replace(/```/g, '');

    // Find the JSON object
    const jsonStart = cleanText.indexOf('{');
    const jsonEnd = cleanText.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('No JSON object found in response:', cleanText);
      throw new Error('No JSON object found in response');
    }
    
    const jsonString = cleanText.slice(jsonStart, jsonEnd + 1);
    console.log('Attempting to parse JSON:', jsonString);
    
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSON Parse Error:', error);
    console.error('Raw text:', text);
    throw new Error(`Failed to parse OpenAI response as JSON: ${error}`);
  }
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
        const structurePrompt = `Create a detailed blog post structure about "${topic}".

        The blog post should follow this specific structure:
        1. Main H1 Headline
        2. Introduction section (100 words)
        3. 4-5 main sections, each with:
           - H2 subheadline
           - 400-500 words of content
           - 3-4 key bullet points outlining the section's content

        Important: Format your response as valid JSON exactly like this:
        {
          "headline": "Your H1 SEO-optimized headline here",
          "primaryKeywords": ["keyword1", "keyword2", "keyword3"],
          "secondaryKeywords": ["keyword4", "keyword5", "keyword6"],
          "outline": [
            {
              "title": "Introduction",
              "type": "h1",
              "keyPoints": [
                "Key point 1 about introduction",
                "Key point 2 about introduction",
                "Key point 3 about introduction"
              ]
            },
            {
              "title": "First Main Section",
              "type": "h2",
              "keyPoints": [
                "Key point 1 about this section",
                "Key point 2 about this section",
                "Key point 3 about this section"
              ]
            }
          ]
        }

        Requirements:
        - All headlines must be descriptive and SEO-friendly
        - Include 3-5 primary keywords related to the main topic
        - Include 3-5 secondary keywords for supporting concepts
        - Ensure all text is properly escaped for JSON
        - Each section's key points should clearly outline what that section will cover`;

        console.log('=== STRUCTURE PROMPT ===');
        console.log(structurePrompt);
        console.log('=======================');

        console.log('Sending request to OpenAI for structure...');
        try {
          const structureCompletion = await openai.chat.completions.create({
            messages: [{ role: "user", content: structurePrompt }],
            model: "gpt-4",
            temperature: 0.7,
          });

          // Log the response
          console.log('=== STRUCTURE RESPONSE ===');
          console.log('Response content:', structureCompletion.choices[0].message.content);
          console.log('Token usage:', structureCompletion.usage);
          console.log('========================');

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

          // Log the outline structure
          console.log('Full outline structure:', structure.outline);
          console.log('Selected section for content:', structure.outline[2]);

          // Step 1: Generate Introduction
          const introductionPrompt = `Write an engaging introduction for a blog post about "${topic}".

          Keywords to incorporate: ${structure.primaryKeywords.join(', ')}

          Requirements:
          - About 100 words
          - Hook the reader from the first sentence
          - Set up the main topics that will be covered
          - Match this style guide: ${styleGuide}

          Format your response as valid JSON:
          {
            "introduction": "Your introduction text here..."
          }`;

          console.log('Generating introduction...');
          const introCompletion = await openai.chat.completions.create({
            messages: [
              { 
                role: "user", 
                content: introductionPrompt 
              }
            ],
            model: "gpt-4",
            temperature: 0.7,
          });

          console.log('Introduction Response:', introCompletion.choices[0].message.content);
          const introResponse = safeJsonParse(introCompletion.choices[0].message.content);
          const introductionContent = introResponse.introduction;

          if (!introductionContent) {
            throw new Error('Introduction content is missing from the response');
          }

          // Step 2: Generate Main Content
          const mainContentPrompt = `Write the second main section (NOT the introduction) for a blog post about "${topic}". 

          Use this section from the outline as a guide:
          ${JSON.stringify(structure.outline[2], null, 2)}

          Requirements for the section:
          - Generate ONLY the second main section (not introduction)
          - The section's "title" must match this headline: "${structure.outline[2].title}"
          - The "content" must be 400-500 words and must begin with the headline
          - Follow these key points: ${JSON.stringify(structure.outline[2].keyPoints)}
          - Naturally incorporate these keywords: ${[
            ...structure.primaryKeywords,
            ...structure.secondaryKeywords,
          ].join(', ')}
          - Adhere to this style guide: ${styleGuide}

          Return your answer strictly in the following JSON format with no additional text:
          {
            "sections": [
              {
                "title": "${structure.outline[2].title}",
                "content": "Section content starting with the headline..."
              }
            ]
          }`;

          console.log('Generating main content...');
          const mainCompletion = await openai.chat.completions.create({
            messages: [
              {
                role: "system",
                content: "You must respond with valid JSON only. No additional text or markdown formatting."
              },
              {
                role: "user",
                content: mainContentPrompt
              }
            ],
            model: "gpt-4",
            temperature: 0.7,
          });

          console.log('Main Content Response:', mainCompletion.choices[0].message.content);
          const mainResponse = safeJsonParse(mainCompletion.choices[0].message.content);
          const bodyContent = mainResponse.sections.map(section => section.content).join('\n');

          if (!bodyContent) {
            throw new Error('Main content is missing from the response');
          }

          // Step 3: Format Final Article
          const formatPrompt = `Create a markdown-formatted article by combining these parts:

          Title: ${structure.headline}

          Introduction:
          ${introductionContent}

          Main Content:
          ${bodyContent}

          Return ONLY a JSON response in this format:
          {
            "full_article": "# ${structure.headline}\n\n${introductionContent}\n\n${bodyContent}"
          }`;

          console.log('Content to format:', {
            headline: structure.headline,
            introduction: introductionContent,
            bodyContent: bodyContent
          });

          const formatCompletion = await openai.chat.completions.create({
            messages: [
              {
                role: "system",
                content: "You must return a valid JSON object containing the full article with both introduction and main content in markdown format."
              },
              {
                role: "user",
                content: formatPrompt
              }
            ],
            model: "gpt-4",
            temperature: 0.7,
          });

          console.log('Format Response:', formatCompletion.choices[0].message.content);
          const formatResponse = safeJsonParse(formatCompletion.choices[0].message.content);
          const formattedArticle = formatResponse.full_article;

          if (!formattedArticle) {
            throw new Error('Formatted article is missing from the response');
          }

          // Log the final formatted article
          console.log('Final formatted article:', formattedArticle);

          // Track total usage across all steps
          totalUsage.promptTokens += 
            (structureCompletion.usage?.prompt_tokens || 0) +
            (formatCompletion.usage?.prompt_tokens || 0);
          
          totalUsage.completionTokens += 
            (structureCompletion.usage?.completion_tokens || 0) +
            (formatCompletion.usage?.completion_tokens || 0);

          // Function to generate content for a specific section
          const generateSectionContent = async (sectionIndex: number) => {
            // Add error checking
            if (!structure.outline[sectionIndex]) {
              console.log('Available outline sections:', structure.outline);
              console.log('Attempted to access section:', sectionIndex);
              return {
                title: `Section ${sectionIndex}`,
                content: `Content for section ${sectionIndex} could not be generated.`
              };
            }

            const section = structure.outline[sectionIndex];
            console.log(`Generating content for section ${sectionIndex}:`, section);
            
            const sectionPrompt = `Write section ${sectionIndex} for a blog post about "${topic}". 

            Use this section from the outline as a guide:
            ${JSON.stringify(section, null, 2)}

            Requirements for the section:
            - Generate ONLY this section
            - The section's "title" must match this headline: "${section.title}"
            - The "content" must be 400-500 words and must begin with the headline
            - Follow these key points: ${JSON.stringify(section.keyPoints)}
            - Naturally incorporate these keywords: ${[
              ...structure.primaryKeywords,
              ...structure.secondaryKeywords,
            ].join(', ')}
            - Adhere to this style guide: ${styleGuide}

            Return your answer strictly in the following JSON format with no additional text:
            {
              "sections": [
                {
                  "title": "${section.title}",
                  "content": "Section content starting with the headline..."
                }
              ]
            }`;

            const completion = await openai.chat.completions.create({
              messages: [{ 
                role: "user", 
                content: sectionPrompt 
              }],
              model: "gpt-3.5-turbo",
              temperature: 0.7,
            });

            const response = safeJsonParse(completion.choices[0].message.content);
            return response.sections[0];
          };

          // Log the outline structure before generating sections
          console.log('Full outline structure:', structure.outline);

          // Generate content for available sections
          const sections = await Promise.all([
            generateSectionContent(1),  // section1
            generateSectionContent(2),  // section2
            generateSectionContent(3),  // section3
            generateSectionContent(4),  // section4
            generateSectionContent(5),  // section5
          ].slice(0, structure.outline.length - 1));  // Only generate for available sections

          // Fill any missing sections with placeholder content
          while (sections.length < 5) {
            sections.push({
              title: `Section ${sections.length + 1}`,
              content: `Content for section ${sections.length + 1} not available.`
            });
          }

          // After generating sections
          console.log('Generated sections:', sections);

          // First combine all sections
          const combinedArticle = `# ${structure.headline}

${introductionContent}

## ${sections[0].title}
${sections[0].content}

## ${sections[1].title}
${sections[1].content}

## ${sections[2].title}
${sections[2].content}

## ${sections[3].title}
${sections[3].content}

## ${sections[4].title}
${sections[4].content}`;

          // Create a prompt to improve the combined article
          const polishArticlePrompt = `Here's a draft article that needs polishing:

${combinedArticle}

Instructions:
1. Improve the flow between sections
2. Add smooth transitions between paragraphs
3. Ensure consistent tone and style throughout
4. Keep all section headlines exactly as they are
5. Maintain all key information and examples
6. Keep the markdown formatting intact
7. Make sure the article reads as one cohesive piece

Return the polished article in this JSON format:
{
  "full_article": "Your polished markdown article here"
}`;

          // Get the polished version
          const polishCompletion = await openai.chat.completions.create({
            messages: [{ 
              role: "user", 
              content: polishArticlePrompt 
            }],
            model: "gpt-3.5-turbo",
            temperature: 0.7,
          });

          const polishedResponse = safeJsonParse(polishCompletion.choices[0].message.content);
          const polishedArticle = polishedResponse.full_article;

          // Update the return statement
          const returnContent = {
            content: {
              ...structure,
              introduction: introductionContent,
              body_copy: bodyContent,
              full_article: polishedArticle,  // Use the polished version
              section1: { title: sections[0].title, content: sections[0].content },
              section2: { title: sections[1].title, content: sections[1].content },
              section3: { title: sections[2].title, content: sections[2].content },
              section4: { title: sections[3].title, content: sections[3].content },
              section5: { title: sections[4].title, content: sections[4].content },
              image_urls: images.map(img => img?.urls?.regular || ''),
              alt_image_texts: images.map(img => img?.description || img?.alt_description || '')
            },
            usage: totalUsage
          };

          console.log('Return content:', returnContent);
          console.log('Section 1:', returnContent.content.section1);
          console.log('Section 2:', returnContent.content.section2);

          return returnContent;
        } catch (error) {
          console.error('Error generating blog content:', error);
          throw error;
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