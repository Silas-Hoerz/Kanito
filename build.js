import fs from 'fs/promises';
import { marked } from 'marked';

const DOMAIN = "https://kanito.de";

async function build() {
    const TEMPLATE = await fs.readFile('template.html', 'utf-8');
    const PROJECTS = JSON.parse(await fs.readFile('projects.json', 'utf-8'));
    const YEAR = new Date().getFullYear().toString();

    await fs.rm('dist', { recursive: true, force: true }).catch(() => { });
    await fs.mkdir('dist', { recursive: true });

    const legalPages = [
        { file: 'legal.html', title: 'Legal Notice', slug: 'legal.html' },
        { file: 'privacy.html', title: 'Privacy Policy', slug: 'privacy.html' }
    ];

    for (const page of legalPages) {
        try {
            const content = await fs.readFile(page.file, 'utf-8');
            const finalHtml = TEMPLATE
                .replace(/{{TITLE}}/g, `${page.title} | Kanito`)
                .replace(/{{DESCRIPTION}}/g, `Legal information for Kanito.`)
                .replace(/{{IMAGE}}/g, `${DOMAIN}/logo.png`)
                .replace(/{{URL}}/g, `${DOMAIN}/${page.slug}`)
                .replace(/{{YEAR}}/g, YEAR)
                .replace('{{JSON_LD}}', '') // Keine speziellen Schema-Daten hier
                .replace('{{CONTENT}}', content);

            await fs.writeFile(`dist/${page.slug}`, finalHtml);
            console.log(`Generated themed ${page.slug}`);
        } catch (e) {
            console.log(`Note: Could not generate ${page.file}`);
        }
    }


    try { await fs.copyFile('logo.png', 'dist/logo.png'); } catch (e) { }

    let indexCardsHtml = '';

    // Sitemap initialization
    let sitemapUrls = `<url><loc>${DOMAIN}/</loc><priority>1.0</priority></url>\n`;

    for (const repo of PROJECTS) {
        console.log(`Processing ${repo}...`);

        const headers = process.env.GITHUB_TOKEN
            ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
            : { 'Accept': 'application/vnd.github.v3+json' };

        const apiRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const data = await apiRes.json();

        const branch = data.default_branch || 'main';
        // Objective, professional fallback description
        const desc = data.description || `Technical documentation and source code for ${data.name}.`;
        const title = data.name;
        const slug = title;

        const readmeRes = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/README.md`);
        let md = readmeRes.ok ? await readmeRes.text() : 'No README found.';

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

        // --- MATH FIX START ---
        md = md.replace(/\$`(.*?)`\$/g, '$$$1$$');

        const mathBlocks = [];
        md = md.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
            mathBlocks.push(match);
            return `%%%MATH_BLOCK_${mathBlocks.length - 1}%%%`;
        });
        md = md.replace(/\$((?!\$).+?)\$/g, (match) => {
            mathBlocks.push(match);
            return `%%%MATH_BLOCK_${mathBlocks.length - 1}%%%`;
        });

        let readmeHtml = marked.parse(md, { gfm: true, breaks: true });
        readmeHtml = readmeHtml.replace(/%%%MATH_BLOCK_(\d+)%%%/g, (match, i) => mathBlocks[i]);
        // --- MATH FIX END ---

        const imageDiv = imageUrl ? `<div class="card-image" style="background-image: url('${imageUrl}');" title="Preview of ${title}"></div>` : '';
        indexCardsHtml += `
            <a href="/${slug}/" class="project-card" title="View details for ${title}">
                ${imageDiv}
                <h3>${title}</h3>
                <p>${desc}</p>
                <span class="btn-card">Read Docs</span>
            </a>
        `;

        const subpageContent = `
            <div style="width: 100%; max-width: 800px; margin: 0 auto;">
                <div class="view-controls">
                    <a href="/" class="btn-back" title="Return to index">← Back</a>
                    <a href="https://github.com/${repo}" target="_blank" class="btn-repo" title="View source code on GitHub">View Repository</a>
                </div>
                <article>${readmeHtml}</article>
            </div>
        `;

        const jsonLd = {
            "@context": "https://schema.org",
            "@type": "SoftwareSourceCode",
            "name": title,
            "description": desc,
            "codeRepository": `https://github.com/${repo}`,
            "author": {
                "@type": "Person",
                "name": "Kanito"
            }
        };

        // Project Subpage SEO
        let pageHtml = TEMPLATE
            .replace(/{{TITLE}}/g, `${title} | Kanito`)
            .replace(/{{DESCRIPTION}}/g, desc.replace(/"/g, '&quot;'))
            .replace(/{{IMAGE}}/g, imageUrl || `${DOMAIN}/logo.png`)
            .replace(/{{URL}}/g, `${DOMAIN}/${slug}/`)
            .replace(/{{YEAR}}/g, YEAR)
            .replace('{{JSON_LD}}', `<script type="application/ld+json">\n${JSON.stringify(jsonLd)}\n</script>`)
            .replace('{{CONTENT}}', subpageContent);

        await fs.mkdir(`dist/${slug}`, { recursive: true });
        await fs.writeFile(`dist/${slug}/index.html`, pageHtml);

        sitemapUrls += `<url><loc>${DOMAIN}/${slug}/</loc><priority>0.8</priority></url>\n`;
    }

    // Index Page SEO
    const indexContent = `
        <section class="hero">
            <h1>Projects.</h1>
            <p class="sr-only">Portfolio of technical projects, tools, and experiments. Focused on functionality, clean architecture, and performance.</p>
        </section>
        <section class="projects">
            <h2 class="sr-only">Project Index</h2>
            ${indexCardsHtml}
        </section>
    `;

    const indexJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Kanito",
        "url": DOMAIN,
        "description": "Portfolio of technical projects, tools, and experiments."
    };

    let finalIndex = TEMPLATE
        .replace(/{{TITLE}}/g, 'Kanito')
        .replace(/{{DESCRIPTION}}/g, 'Portfolio of technical projects, tools, and experiments. Focused on functionality, clean architecture, and performance.')
        .replace(/{{IMAGE}}/g, `${DOMAIN}/logo.png`)
        .replace(/{{URL}}/g, `${DOMAIN}/`)
        .replace(/{{YEAR}}/g, YEAR)
        .replace('{{JSON_LD}}', `<script type="application/ld+json">\n${JSON.stringify(indexJsonLd)}\n</script>`)
        .replace('{{CONTENT}}', indexContent);

    await fs.writeFile('dist/index.html', finalIndex);

    // Generate Sitemap
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}</urlset>`;
    await fs.writeFile('dist/sitemap.xml', sitemap);

    sitemapUrls += `<url><loc>${DOMAIN}/legal.html</loc><priority>0.3</priority></url>\n`;
    sitemapUrls += `<url><loc>${DOMAIN}/privacy.html</loc><priority>0.3</priority></url>\n`;

    // Generate robots.txt
    const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml`;
    await fs.writeFile('dist/robots.txt', robotsTxt);

    console.log('Build successful! ✅');
}

build();