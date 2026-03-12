import fs from 'fs/promises';
import { marked } from 'marked';

const DOMAIN = "https://kanito.de";

async function build() {
    const TEMPLATE = await fs.readFile('template.html', 'utf-8');
    const PROJECTS = JSON.parse(await fs.readFile('projects.json', 'utf-8'));
    const YEAR = new Date().getFullYear().toString();

    await fs.rm('dist', { recursive: true, force: true }).catch(() => { });
    await fs.mkdir('dist', { recursive: true });

    // Kopiere das Logo, falls vorhanden (fängt den Fehler auf, falls keins da ist)
    try {
        await fs.copyFile('logo.png', 'dist/logo.png');
    } catch (e) {
        console.log("Hinweis: Keine logo.png für das Favicon gefunden.");
    }

    let indexCardsHtml = '';

    for (const repo of PROJECTS) {
        console.log(`Verarbeite ${repo}...`);

        const headers = process.env.GITHUB_TOKEN
            ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
            : { 'Accept': 'application/vnd.github.v3+json' };

        const apiRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const data = await apiRes.json();

        const branch = data.default_branch || 'main';
        const desc = data.description || `Dokumentation und Code für das Projekt ${data.name}. Entdecke alle Details, Installation-Guides und Features.`;
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
        const readmeHtml = marked.parse(md);

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

        // SEO für die Unterseite
        let pageHtml = TEMPLATE
            .replace(/{{TITLE}}/g, `Projekt ${title} | Kanito Engineering`)
            .replace(/{{DESCRIPTION}}/g, desc.length > 50 ? desc : `${desc} Erfahre mehr über die technische Umsetzung und Features.`)
            .replace(/{{IMAGE}}/g, imageUrl || `${DOMAIN}/logo.png`)
            .replace(/{{URL}}/g, `${DOMAIN}/${slug}/`)
            .replace(/{{YEAR}}/g, YEAR)
            .replace('{{CONTENT}}', subpageContent);

        await fs.mkdir(`dist/${slug}`, { recursive: true });
        await fs.writeFile(`dist/${slug}/index.html`, pageHtml);
    }

    // SEO für die Startseite (inkl. unsichtbarem H2 für Struktur und mehr Text für die Word-Count)
    const indexContent = `
        <section class="hero">
            <h1>Engineering & Code</h1>
            <p class="sr-only">Ein Portfolio von Open-Source-Projekten, Hardware-Integrationen und Software-Entwicklung.</p>
        </section>
        <section class="projects">
            <h2 class="sr-only">Alle Projekte in der Übersicht</h2>
            ${indexCardsHtml}
        </section>
    `;

    let finalIndex = TEMPLATE
        .replace(/{{TITLE}}/g, 'Kanito | Engineering, Software & Open Source Projekte')
        .replace(/{{DESCRIPTION}}/g, 'Entdecke das Portfolio von Kanito: Technische Projekte, Hardware-Tools, Open-Source Repositories und saubere Code-Architekturen an einem Ort.')
        .replace(/{{IMAGE}}/g, `${DOMAIN}/logo.png`)
        .replace(/{{URL}}/g, `${DOMAIN}/`)
        .replace(/{{YEAR}}/g, YEAR)
        .replace('{{CONTENT}}', indexContent);

    await fs.writeFile('dist/index.html', finalIndex);
    console.log('Build erfolgreich! ✅');
}

build();