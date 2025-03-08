import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.VITE_OPENAI_API_KEY
});

async function enrichBlogPost(post) {
    console.log(`\nProcessing post ${post.id}...`);
    
    const prompt = `Als erfahrener Content Writer sollst du den folgenden Blogartikel optimieren. 
    Ich möchte, dass Chat GPT den Originalartikel mit relevanten Informationen aus den Referenzartikeln ergänzt. 
    Das Ziel ist, den Artikel um interessante, neue Aspekte zu bereichern, wobei der Fokus insbesondere auf praktischen Beispielen, Zahlen, Zitaten und passenden Hyperlinks liegt.

    Referenzartikel zum Einbauen:
    ${post.reference_articles.join('\n')}

    Originalartikel:
    ${post.full_article}

    Bitte optimiere den Artikel nach folgenden Kriterien:

    1. **Verwendung von Zahlen und Statistiken:**
        - **Verwende ausschließlich Zahlen, Daten und Statistiken, die direkt in den Referenzartikeln enthalten sind.**
        - **Erfundene Zahlen oder Schätzungen sind strengstens untersagt.**
        - Jede Zahl oder Statistik muss direkt aus den Referenzartikeln stammen und mit einem Hyperlink versehen sein.
        - Falls keine relevanten Zahlen vorhanden sind, **lass die Stelle weg oder markiere sie als „weitere Recherche erforderlich"**.
        - **Beispiel:**  
            - Statt: „75 % der Unternehmen nutzen KI."  
            - Mit Link: „[75 % der Unternehmen](https://example.com) nutzen KI."  

    2. **Quellenangaben und Hyperlinks:**
        - Jede Zahl und jede Statistik muss unmittelbar nach der Erwähnung mit einer Quellenangabe und einem Hyperlink versehen sein.
        - Verwende die Markdown-Syntax \`[Ankertext](URL)\` für Hyperlinks.
        - Falls keine Zahlen im Referenzartikel vorhanden sind, füge stattdessen allgemeine Aussagen ohne Zahlen ein.

    3. **Natürlichkeit und Authentizität:**
        - Text soll wie von einem Menschen geschrieben wirken, nicht KI-generiert.
        - Verwende Formulierungen, die nicht von KI-Detektoren erkannt werden.
        - Integriere rhetorische Fragen wie: „Hast du dich auch schon einmal gefragt, warum…?".
        - Nutze idiomatische Ausdrücke wie „den Nagel auf den Kopf treffen".
        - Mische kurze, mittellange und lange Sätze.
        - Verwende gelegentlich Füllwörter wie "eigentlich", "tatsächlich", "interessanterweise".
        - Setze auf direkte Anrede („du") für eine persönliche Note.

    4. **Struktur und Inhalt:**
        - Behalte die bestehende Struktur und Überschriften bei.
        - **Integriere mindestens 3-5 spezifische Informationen, Zahlen oder Zitate aus jedem Referenzartikel.**
        - Füge neue Inhalte harmonisch in vorhandene Abschnitte ein.
        - Markiere die hinzugefügten Inhalte aus den Referenzartikeln mit Hyperlinks im Markdown-Format.

    5. **Hervorhebungen und Formatierung:**
        - Nutze Blockquotes (>) für zentrale Aussagen und Zitate.
        - Verwende **fett** für wichtige Begriffe und *kursiv* für bemerkenswerte Informationen.
        - Trenne Themenbereiche mit horizontalen Linien (---).
        - Strukturiere mit Überschriften (#, ##, ###).

    6. **SEO-Optimierung:**
        - Integriere Keywords natürlich ohne Stuffing.
        - Optimiere Bildunterschriften: ![Alt-Text](Bild-URL).
        - Erstelle bei Bedarf eine Meta-Beschreibung.

    7. **Call-to-Action (CTA):**
        - Füge spezifische, motivierende CTAs ein.
        - Vermeide generische Aufforderungen.
        - Nutze "du" anstatt "Sie" in der direkten Ansprache.

    8. **Qualitätssicherung:**
        - Korrigiere Grammatik und Rechtschreibung.
        - Achte auf einheitliche Begriffe und Formulierungen.
        - Passe den Schreibstil an den Originalartikel an.

    9. **Code-Formatierung:**
        - Nutze Backticks (\`) für Inline-Code.
        - Verwende dreifache Backticks (\`\`\`) für Code-Blöcke.

    **Wichtig:**
    - **Falls keine echten Zahlen in den Referenzartikeln vorhanden sind, verwende stattdessen keine Zahlen!**  
    - **Es dürfen keine Zahlen erfunden werden – auch keine Schätzungen.**  
    - Der Text soll authentisch und natürlich klingen, aber die fachliche Qualität und Kernaussagen des Originals beibehalten.`;

    console.log('Generating improved content with OpenAI...');
    const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4",
        temperature: 0.7
    });

    const improvedArticle = completion.choices[0].message.content;

    if (!improvedArticle) {
        throw new Error('No content received from OpenAI');
    }

    console.log('Content generated successfully');
    console.log(`Original length: ${post.full_article.length}`);
    console.log(`Improved length: ${improvedArticle.length}`);

    const { error: updateError } = await supabase
        .from('blog_posts')
        .update({ article_long: improvedArticle })
        .eq('id', post.id);

    if (updateError) {
        throw new Error(`Failed to update post: ${updateError.message}`);
    }

    console.log(`Successfully updated post ${post.id}`);
    return true;
}

async function main() {
    try {
        const { data: posts, error: fetchError } = await supabase
            .from('blog_posts')
            .select('id, full_article, reference_articles')
            .is('article_long', null);

        if (fetchError) {
            throw new Error(`Failed to fetch posts: ${fetchError.message}`);
        }

        console.log(`Found ${posts.length} posts to enrich`);

        const postsToProcess = posts.filter(post => 
            post.reference_articles && 
            Array.isArray(post.reference_articles) && 
            post.reference_articles.length > 0 &&
            post.full_article
        );

        console.log(`${postsToProcess.length} posts have reference articles`);

        for (const post of postsToProcess) {
            try {
                await enrichBlogPost(post);
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error processing post ${post.id}:`, error.message);
                continue;
            }
        }

        console.log('\nAll done!');
    } catch (error) {
        console.error('Error:', error);
    }
}

main(); 