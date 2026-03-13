import fs from 'fs/promises';
import { marked } from 'marked';

const DOMAIN = "https://kanito.de";

async function build() {
    const TEMPLATE = await fs.readFile('template.html', 'utf-8');
    const PROJECTS = JSON.parse(await fs.readFile('projects.json', 'utf-8'));
    const YEAR = new Date().getFullYear().toString();

    await fs.rm('dist', { recursive: true, force: true }).catch(() => { });
    await fs.mkdir('dist', { recursive: true });

    try {
        await fs.copyFile('logo.png', 'dist/logo.png');
    } catch (e) {
        console.log("Hinweis: Keine logo.png gefunden.");
    }

    let indexCardsHtml = '';

    // Für die Sitemap
    let sitemapUrls = `<url><loc>${DOMAIN}/</loc><priority>1.0</priority></url>\n`;

    for (const repo of PROJECTS) {
        console.log(`Verarbeite ${repo}...`);

        const headers = process.env.GITHUB_TOKEN
            ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
            : { 'Accept': 'application/vnd.github.v3+json' };

        const apiRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const data = await apiRes.json();

        const branch = data.default_branch || 'main';
        // Kürzere, menschlichere Fallback-Beschreibung
        const desc = data.description || `Ein technisches Hobby-Projekt: ${data.name}.`;
        const title = data.name;
        const slug = title;

        const readmeRes = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/README.md`);
        let md = readmeRes.ok ? await readmeRes.text() : 'Keine README gefunden.';

        let imageUrl = null;
        const mdMatch = md.match(/!\[.*?\]\((.*?)\)/);
        if (mdMatch) {
            imageUrl = mdMatch[1].split(' ')[0];
        } else {
            const htmlMatch = md.match(/<img[^>]+src=["'](.*?)["']/);
            if (htmlMatch) imageUrl = htmlMatch[1];
        }

        if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${imageUrl.replace(/^\.\//, '')}`;
        }

        md = md.replace(/!\[([^\]]*)\]\((?!http)(.*?)\)/g, `![$1](https://raw.githubusercontent.com/${repo}/${branch}/$2)`);

        // --- MATHE FIX START ---
        // 1. GitHubs $`math`$ Syntax zu normalem $math$ konvertieren
        md = md.replace(/\$`(.*?)`\$/g, '$$$1$$');

        // 2. Mathe-Blöcke vor marked verstecken
        const mathBlocks = [];
        md = md.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
            mathBlocks.push(match);
            return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
        });
        md = md.replace(/\$((?!\$).+?)\$/g, (match) => {
            mathBlocks.push(match);
            return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
        });

        // 3. Parsen und Mathe wieder einfügen
        let readmeHtml = marked.parse(md);
        readmeHtml = readmeHtml.replace(/__MATH_BLOCK_(\d+)__/g, (match, i) => mathBlocks[i]);
        // --- MATHE FIX ENDE ---

        const imageDiv = imageUrl ? `<div class="card-image" style="background-image: url('${imageUrl}');" title="Vorschau von ${title}"></div>` : '';
        indexCardsHtml += `
            <a href="/${slug}/" class="project-card" title="Mehr über ${title} erfahren">
                ${imageDiv}
                <h3>${title}</h3>
                <p>${desc}</p>
                <span class="btn-card">Read Docs</span>
            </a>
        `;

        const subpageContent = `
            <div style="width: 100%; max-width: 800px; margin: 0 auto;">
                <div class="view-controls">
                    <a href="/" class="btn-back" title="Zurück zur Startseite">← Back</a>
                    <a href="https://github.com/${repo}" target="_blank" class="btn-repo" title="Quellcode auf GitHub ansehen">View Repository</a>
                </div>
                <article>${readmeHtml}</article>
            </div>
        `;

        // SEO für die Unterseite: Minimalistisch ("Projektname | Kanito")
        let pageHtml = TEMPLATE
            .replace(/{{TITLE}}/g, `${title} | Kanito`)
            .replace(/{{DESCRIPTION}}/g, desc.replace(/"/g, '&quot;'))
            .replace(/{{IMAGE}}/g, imageUrl || `${DOMAIN}/logo.png`)
            .replace(/{{URL}}/g, `${DOMAIN}/${slug}/`)
            .replace(/{{YEAR}}/g, YEAR)
            .replace('{{CONTENT}}', subpageContent);

        await fs.mkdir(`dist/${slug}`, { recursive: true });
        await fs.writeFile(`dist/${slug}/index.html`, pageHtml);

        sitemapUrls += `<url><loc>${DOMAIN}/${slug}/</loc><priority>0.8</priority></url>\n`;
    }

    // SEO für die Startseite: Menschlich, minimalistisch
    const indexContent = `
        <section class="hero">
            <h1>Projects.</h1>
            <p class="sr-only">Kanito - Hier sammle ich meine technischen Hobby-Projekte, Tools und Code-Experimente. Fokus auf Funktionalität und saubere Architektur.</p>
        </section>
        <section class="projects">
            <h2 class="sr-only">Alle Projekte in der Übersicht</h2>
            ${indexCardsHtml}
        </section>
    `;

    // Titel exakt "Kanito"
    let finalIndex = TEMPLATE
        .replace(/{{TITLE}}/g, 'Kanito')
        .replace(/{{DESCRIPTION}}/g, 'Hi, hier ist Kanito. Auf dieser Seite sammle ich meine technischen Hobby-Projekte, Hardware-Tools und Code-Experimente.')
        .replace(/{{IMAGE}}/g, `${DOMAIN}/logo.png`)
        .replace(/{{URL}}/g, `${DOMAIN}/`)
        .replace(/{{YEAR}}/g, YEAR)
        .replace('{{CONTENT}}', indexContent);

    await fs.writeFile('dist/index.html', finalIndex);

    // Generiere Sitemap für Google (hilft extrem für Sitelinks!)
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}</urlset>`;
    await fs.writeFile('dist/sitemap.xml', sitemap);

    console.log('Build erfolgreich! ✅');
}

build();