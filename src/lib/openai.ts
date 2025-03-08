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

// Move the safeJsonParse function to the top of the file
const safeJsonParse = (text: string) => {
  try {
    // Basic cleaning of the text before parsing
    const cleanedText = text.trim();
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('JSON Parse Error:', error);
    console.log('Raw text:', text);
    throw new Error(`Failed to parse OpenAI response as JSON: ${error}`);
  }
};

export const generateBlogContent = async (
  topic: string, 
  referenceUrls: string[],
  primaryKeywords: string[],
  secondaryKeywords: string[]
): Promise<{ content: BlogContent; usage: TokenUsage }> => {
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
      costInEuros: 0,
      modelUsed: 'gpt-3.5-turbo'
    };

    // Get the style guide first
    const styleAnalysisPrompt = `Analysiere den Schreibstil, Ton und die Struktur dieser Artikel:
    ${referenceUrls.join('\n')}
    
    Beschreibe kurz die gemeinsamen Schreibmuster, den Ton und die strukturellen Elemente.`;

    console.log('Sending request to OpenAI for style analysis...');
    try {
      const styleAnalysis = await openai.chat.completions.create({
        messages: [{ role: "user", content: styleAnalysisPrompt }],
        model: "gpt-3.5-turbo",
        temperature: 0.7,
      });
      console.log('Received response from OpenAI for style analysis');

      // Add style analysis usage
      totalUsage.promptTokens += styleAnalysis.usage?.prompt_tokens || 0;
      totalUsage.completionTokens += styleAnalysis.usage?.completion_tokens || 0;
      totalUsage.totalTokens += styleAnalysis.usage?.total_tokens || 0;

      const styleGuide = styleAnalysis.choices[0].message.content;

      // Create structure using provided keywords
      const structurePrompt = `Erstelle eine detaillierte Blog-Post-Struktur zum Thema "${topic}" auf Deutsch.

      Verwende diese Keywords:
      Primäre Keywords: ${primaryKeywords.join(', ')}
      Sekundäre Keywords: ${secondaryKeywords.join(', ')}

      Die Blog-Post-Struktur sollte diesem Schema folgen:
      1. Hauptüberschrift (H1) - MUSS mindestens eines der primären Keywords enthalten
      2. Einleitung (100 Wörter)
      3. 5 Hauptabschnitte. 
      4. Der letzte Absnitt ist eine Zusammnefassung und schießt mit einer Frage ab
      4. Erstelle eine Überschrift zu jedem Hauptschnitt. Versuche Key Word in der Überschrift zu verwenden. Versuche die Überschrift als Frage zu formulieren.

      Formatiere deine Antwort als valides JSON genau wie folgt:
      {
        "headline": "Deine SEO-optimierte H1-Überschrift hier",
        "primaryKeywords": ${JSON.stringify(primaryKeywords)},
        "secondaryKeywords": ${JSON.stringify(secondaryKeywords)},
        "outline": [
          {
            "title": "Einleitung",
            "type": "h1",
            "keyPoints": [
              "Hauptpunkt 1 zur Einleitung",
              "Hauptpunkt 2 zur Einleitung",
              "Hauptpunkt 3 zur Einleitung"
            ]
          }
        ]
      }`;

      console.log('=== STRUCTURE PROMPT ===');
      console.log(structurePrompt);
      console.log('=======================');

      console.log('Sending request to OpenAI for structure...');
      try {
        const structureCompletion = await openai.chat.completions.create({
          messages: [{ role: "user", content: structurePrompt }],
          model: "gpt-3.5-turbo",
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
        const introductionPrompt = `Schreibe eine Einleitung für einen Blog-Post zum Thema "${topic}".

        Zu integrierende Keywords: ${structure.primaryKeywords.join(', ')}

        Anforderungen:
        - Die Einleitung besteht aus mindestens 100 Wörters
        - Fessele den Leser vom ersten Satz an
        - Stelle die Hauptthemen vor, die behandelt werden
        - Halte dich an diesen Stilguide: ${styleGuide}

        Formatiere deine Antwort als valides JSON:
        {
          "introduction": "Dein Einleitungstext hier..."
        }`;

        console.log('Generiere Einleitung...');
        const introCompletion = await openai.chat.completions.create({
          messages: [
            { 
              role: "user", 
              content: introductionPrompt 
            }
          ],
          model: "gpt-3.5-turbo",
          temperature: 0.7,
        });

        console.log('Introduction Response:', introCompletion.choices[0].message.content);
        const introductionResponse = safeJsonParse(introCompletion.choices[0].message.content);
        const introductionContent = introductionResponse.introduction;

        if (!introductionContent) {
          throw new Error('Introduction content is missing from the response');
        }

        // Define the generateSectionContent function
        const generateSectionContent = async (sectionIndex: number) => {
          if (!structure.outline[sectionIndex]) {
            return null;
          }

          const section = structure.outline[sectionIndex];
          
          const generateSectionPrompt = `
Anforderungen für den Abschnitt:
- Erstelle NUR diesen Abschnitt
- Der Abschnitt besteht aus einer Überschrift "${section.title}" und einem Text
- Der Text muss mindestens 400 Wörter umfassen
- Erstelle einen prägnanten Text, integriere diese Keywords natürlich: ${[
  ...primaryKeywords,
  ...secondaryKeywords,
].join(', ')}
- Formatiere den Text in Markdown:
  * Verwende ## für die Überschrift
  * Nutze Absätze für bessere Lesbarkeit
  * Setze Links als [Text](URL)
  * Nutze Listen mit * oder - wo sinnvoll
- Halte dich an diesen Stilguide: ${styleGuide}

Antworte in diesem JSON-Format:
{
  "title": "${section.title}",
  "content": "## ${section.title}\\n\\nDein Markdown-formatierter Inhalt hier..."
}

WICHTIG: Stelle sicher, dass die JSON-Antwort gültig ist:
- Verwende \\" für Anführungszeichen im Text
- Verwende \\n für Zeilenumbrüche
- Escape alle Sonderzeichen korrekt`;

          const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: generateSectionPrompt }],
            model: "gpt-3.5-turbo",
            temperature: 0.7,
          });

          const sectionContent = safeJsonParse(completion.choices[0].message.content);
          return sectionContent;
        };

        // Generate content for each section
        const sections = await Promise.all([
          generateSectionContent(1),
          generateSectionContent(2),
          generateSectionContent(3),
          generateSectionContent(4),
          generateSectionContent(5)
        ].slice(0, structure.outline.length - 1));

        // After generating sections
        console.log('Generated sections:', sections);

        // After generating all sections, combine them into a full article
        const combinedArticle = `${introductionContent}

${sections.map(section => {
  if (!section || !section.content || !section.title) return '';
  
  // Ensure proper markdown formatting
  const content = section.content.replace(/^## .*\n/, '').trim(); // Remove any existing heading
  return `## ${section.title}\n\n${content}`; // Add heading with proper spacing
  
}).filter(Boolean).join('\n\n')}`.trim();

        // Create a prompt to improve the combined article
        const polishArticlePrompt = `Hier ist ein Artikelentwurf, der verbessert werden soll:

${combinedArticle}

Anweisungen:
1. Formatiere den Artikel strikt in Markdown:
   - Die Einleitung steht am Anfang (ohne Überschrift)
   - Kapitelüberschriften mit ## und Leerzeilen davor und danach
   - Absätze durch Leerzeilen trennen
   - Wichtige Begriffe mit **Fettdruck**
   - Aufzählungen mit * oder -
   - Links als [Text](URL)
2. Verbessere die Übergänge zwischen den Abschnitten
3. Stelle einen einheitlichen Ton und Stil sicher
4. Behalte ALLE Markdown-Formatierungen bei

WICHTIG: Gib den Text exakt in diesem Format zurück:

Einleitung
[Leerzeile]
## Erste Überschrift
[Leerzeile]
Text des ersten Kapitels...
[Leerzeile]
## Zweite Überschrift
[Leerzeile]
Text des zweiten Kapitels...

Antworte AUSSCHLIESSLICH mit diesem JSON-Format:
{
  "full_article": "Dein vollständig formatierter Markdown-Text hier..."
}`;

        // Get the polished version with strict parsing
        const polishCompletion = await openai.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "Du bist ein Experte für Markdown-Formatierung. Stelle sicher, dass der Text perfekt in Markdown formatiert ist."
            },
            {
              role: "user",
              content: polishArticlePrompt
            }
          ],
          model: "gpt-3.5-turbo-16k", // Use the 16k model for longer texts
          max_tokens: 12000,          // Set a reasonable max token limit
          temperature: 0.7,
        });

        // Improve the JSON parsing
        const polishedResponse = safeJsonParse(polishCompletion.choices[0].message.content);
        if (!polishedResponse || !polishedResponse.full_article) {
          throw new Error('Invalid response format from OpenAI');
        }
        const polishedArticle = polishedResponse.full_article;

        // Generate images for the blog post
        try {
          console.log('Generating image search terms for:', { topic, primaryKeywords, secondaryKeywords });
          
          const searchTerms = await generateImageSearchTerms(topic, primaryKeywords, secondaryKeywords);
          console.log('Generated search terms:', searchTerms);

          const images = await Promise.all(
            searchTerms.map(async searchTerm => {
              const image = await searchUnsplashImage(searchTerm.term, searchTerm.expected_tags);
              if (image) {
                return {
                  ...image,
                  primary_keyword_used: searchTerm.primary_keywords_used.length > 0
                };
              }
              return null;
            })
          );

          return {
            content: {
              ...structure,
              introduction: introductionContent,
              full_article: polishedArticle,
              section1: sections[0] || { title: '', content: '' },
              section2: sections[1] || { title: '', content: '' },
              section3: sections[2] || { title: '', content: '' },
              section4: sections[3] || { title: '', content: '' },
              section5: sections[4] || { title: '', content: '' },
              image_urls: images.map(img => img?.urls?.regular || ''),
              alt_image_texts: images.map(img => img?.alt_description || ''),
              image_metadata: images.map(img => ({
                url: img?.urls?.regular || '',
                tags: img?.tags?.map(tag => tag.title) || [],
                photographer: img?.user?.name || '',
                alt_description: img?.alt_description || '',
                primary_keyword_used: img?.primary_keyword_used || false
              }))
            },
            usage: totalUsage
          };
        } catch (error) {
          console.error('Error generating images:', error);
          return {
            content: {
              ...structure,
              introduction: introductionContent,
              full_article: polishedArticle,
              section1: sections[0] || { title: '', content: '' },
              section2: sections[1] || { title: '', content: '' },
              section3: sections[2] || { title: '', content: '' },
              section4: sections[3] || { title: '', content: '' },
              section5: sections[4] || { title: '', content: '' },
              image_urls: [],
              alt_image_texts: [],
              image_metadata: []
            },
            usage: totalUsage
          };
        }
      } catch (error) {
        console.error('Error generating structure:', error);
        throw new Error('Failed to generate blog structure. Please try again.');
      }
    } catch (error) {
      console.error('Error generating style analysis:', error);
      throw new Error('Failed to generate style analysis. Please try again.');
    }
  } catch (error) {
    console.error('Error generating blog content:', error);
    throw new Error('Failed to generate blog content. Please try again.');
  }
};

const generateImageSearchTerms = async (topic: string, primaryKeywords: string[], secondaryKeywords: string[]) => {
  const prompt = `Du bist ein KI-Assistent, der dabei hilft, das perfekte und einzigartige Bild für Blog-Beiträge zu finden.

Aktuelle Anfrage:
Thema: ${topic}
Primäre Keywords: ${primaryKeywords.join(', ')}
Sekundäre Keywords: ${secondaryKeywords.join(', ')}

Erstelle einen spezifischen und beschreibenden Suchbegriff, der ein professionelles, relevantes und einzigartiges Bild auf Unsplash finden würde.
Beachte dabei:
- Professioneller Business/Tech-Kontext
- Abstrakte Konzepte können durch Metaphern visualisiert werden
- Fokussiere auf Szenen, Situationen oder metaphorische Darstellungen
- Stelle sicher, dass die Begriffe mit gängigen Unsplash-Bildtags übereinstimmen
- Priorisiere primäre Keywords, aber kombiniere sie intelligent mit beschreibenden Begriffen
- Der Suchbegriff sollte einzigartig genug sein, um häufig verwendete Bilder zu vermeiden

Anforderungen an die Antwort:
- Gib genau einen Suchbegriff zurück
- Der Begriff sollte spezifisch genug sein, um relevante aber einzigartige Bilder zu finden
- Der Begriff sollte für das Unsplash-Tagging-System optimiert sein

Antworte in diesem JSON-Format:
{
  "searchTerm": {
    "term": "spezifischer einzigartiger Suchbegriff",
    "primary_keywords_used": ["verwendete", "primäre", "keywords"],
    "expected_tags": ["erwartete", "matching", "tags"]
  }
}`;

  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-3.5-turbo",
    temperature: 0.9,
  });

  const response = safeJsonParse(completion.choices[0].message.content);
  return [response.searchTerm]; // Return as array for backward compatibility
};
