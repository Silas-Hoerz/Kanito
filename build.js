import fs from 'fs/promises';
import { marked } from 'marked';

async function build() {
    const TEMPLATE = await fs.readFile('template.html', 'utf-8');
    const PROJECTS = JSON.parse(await fs.readFile('projects.json', 'utf-8'));
    const YEAR = new Date().getFullYear().toString();

    // Erstelle den Ausgabe-Ordner
    await fs.rm('dist', { recursive: true, force: true }).catch(() => { });
    await fs.mkdir('dist', { recursive: true });

    let indexCardsHtml = '';

    for (const repo of PROJECTS) {
        console.log(`Verarbeite ${repo}...`);

        // Nutze GitHub Token falls vorhanden (verhindert Rate-Limits beim Bauen)
        const headers = process.env.GITHUB_TOKEN
            ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
            : { 'Accept': 'application/vnd.github.v3+json' };

        // 1. Hole Projekt Info
        const apiRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const data = await apiRes.json();

        const branch = data.default_branch || 'main';
        const desc = data.description || "Technical project repository.";
        const title = data.name;
        const slug = title; // Der Ordner/Link heißt wie das Projekt (z.B. "Scrollwheel")

        // 2. Hole README
        const readmeRes = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/README.md`);
        let md = readmeRes.ok ? await readmeRes.text() : 'Keine README gefunden.';

        // 3. Erstes Bild extrahieren (Regex)
        let imageUrl = null;
        const mdMatch = md.match(/!\[.*?\]\((.*?)\)/);
        if (mdMatch) {
            imageUrl = mdMatch[1].split(' ')[0];
        } else {
            const htmlMatch = md.match(/<img[^>]+src=["'](.*?)["']/);
            if (htmlMatch) imageUrl = htmlMatch[1];
        }

        // Wenn relativer Pfad, mach eine absolute GitHub Raw URL daraus
        if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${imageUrl.replace(/^\.\//, '')}`;
        }

        // 4. Relative Bildpfade innerhalb der README für die Projektseite anpassen
        md = md.replace(/!\[([^\]]*)\]\((?!http)(.*?)\)/g, `![$1](https://raw.githubusercontent.com/${repo}/${branch}/$2)`);
        const readmeHtml = marked.parse(md);

        // 5. Baue die HTML Karte für die Startseite
        const imageDiv = imageUrl ? `<div class="card-image" style="background-image: url('${imageUrl}');"></div>` : '';
        indexCardsHtml += `
            <a href="/${slug}/" class="project-card">
                ${imageDiv}
                <h3>${title}</h3>
                <p>${desc}</p>
                <span class="btn-card">Read Docs</span>
            </a>
        `;

        // 6. Baue die individuelle Unterseite für dieses Projekt
        const subpageContent = `
            <div style="width: 100%; max-width: 800px; margin: 0 auto;">
                <div class="view-controls">
                    <a href="/" class="btn-back">← Back</a>
                    <a href="https://github.com/${repo}" target="_blank" class="btn-repo">View Repository</a>
                </div>
                <article>${readmeHtml}</article>
            </div>
        `;

        let pageHtml = TEMPLATE
            .replace(/{{TITLE}}/g, `Kanito | ${title}`)
            .replace(/{{DESCRIPTION}}/g, desc)
            .replace(/{{IMAGE}}/g, imageUrl || '')
            .replace(/{{YEAR}}/g, YEAR)
            .replace('{{CONTENT}}', subpageContent);

        // Speichere unter dist/Projektname/index.html (ermöglicht URLs wie /Scrollwheel/)
        await fs.mkdir(`dist/${slug}`, { recursive: true });
        await fs.writeFile(`dist/${slug}/index.html`, pageHtml);
    }

    // 7. Baue die Startseite
    const indexContent = `
        <section class="hero"><h1>Projects.</h1></section>
        <section class="projects">${indexCardsHtml}</section>
    `;

    let finalIndex = TEMPLATE
        .replace(/{{TITLE}}/g, 'Kanito | Engineering & Code')
        .replace(/{{DESCRIPTION}}/g, 'Portfolio of technical projects, tools, and experiments.')
        .replace(/{{IMAGE}}/g, '') // Hier ggf. Link zu deinem Profilbild rein
        .replace(/{{YEAR}}/g, YEAR)
        .replace('{{CONTENT}}', indexContent);

    await fs.writeFile('dist/index.html', finalIndex);
    console.log('Build erfolgreich! ✅');
}

build();