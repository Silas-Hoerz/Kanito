import fs from 'fs/promises';
import { marked } from 'marked';

const DOMAIN = "https://kanito.de";

async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = `${src}/${entry.name}`;
        const destPath = `${dest}/${entry.name}`;
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function build() {
    console.log('Starting Kanito portfolio build...');
    const TEMPLATE = await fs.readFile('template.html', 'utf-8');
    const PROJECTS = JSON.parse(await fs.readFile('projects.json', 'utf-8'));
    const YEAR = new Date().getFullYear().toString();

    let PHOTOS = [];
    let GALLERY_SETTINGS = { show_likes: true };
    try {
        const rawJson = JSON.parse(await fs.readFile('photos.json', 'utf-8'));
        if (Array.isArray(rawJson)) {
            PHOTOS = rawJson;
        } else if (rawJson && typeof rawJson === 'object') {
            PHOTOS = rawJson.photos || [];
            GALLERY_SETTINGS = { ...GALLERY_SETTINGS, ...(rawJson.settings || {}) };
        }
    } catch (e) {
        console.warn('Note: Could not parse photos.json, defaulting to empty list.');
    }

    await fs.rm('dist', { recursive: true, force: true }).catch(() => { });
    await fs.mkdir('dist', { recursive: true });

    // --- CNAME FOR GITHUB PAGES ---
    await fs.writeFile('dist/CNAME', 'kanito.de\n');

    // --- LEGAL & PRIVACY PAGES ---
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
                .replace('{{JSON_LD}}', '')
                .replace('{{CONTENT}}', content);

            await fs.writeFile(`dist/${page.slug}`, finalHtml);
            console.log(`Generated themed ${page.slug}`);
        } catch (e) {
            console.log(`Note: Could not generate ${page.file}`);
        }
    }

    // Static assets
    try { await fs.copyFile('logo.png', 'dist/logo.png'); } catch (e) { }
    try { await fs.copyFile('logo.png', 'dist/favicon.png'); } catch (e) { }
    try { await fs.copyFile('logo.png', 'dist/favicon.ico'); } catch (e) { }
    try { await copyDir('logo', 'dist/logo'); } catch (e) { }

    // Copy photos.json so admin and client can query it
    try { await fs.copyFile('photos.json', 'dist/photos.json'); } catch (e) { }

    // Copy binary photo storage
    try {
        await copyDir('photos/data', 'dist/photos/data');
        console.log('Synchronized secure photos/data to dist/photos/data');
    } catch (e) {
        console.warn('Note: No photos/data folder found to copy.');
    }

    let indexCardsHtml = '';
    let sitemapUrls = `<url><loc>${DOMAIN}/</loc><priority>1.0</priority></url>\n`;

    // --- GITHUB PROJECT PAGES ---
    for (const repo of PROJECTS) {
        console.log(`Processing project ${repo}...`);

        const headers = process.env.GITHUB_TOKEN
            ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
            : { 'Accept': 'application/vnd.github.v3+json' };

        const apiRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        const data = await apiRes.json();

        const branch = data.default_branch || 'main';
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
                    <a href="/projects/" class="btn-back" title="Return to projects">← Back to Projects</a>
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

    // --- PROJECTS PAGE (kanito.de/projects/) ---
    const projectsContent = `
        <section class="hero">
            <h1>Projects.</h1>
            <p class="sr-only">Development and distribution of electronic assemblies, microcontroller accessories, and prototyping components.</p>
        </section>
        <section class="projects">
            <h2 class="sr-only">Project Index</h2>
            ${indexCardsHtml}
        </section>
    `;

    const projectsJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Kanito Projects",
        "url": `${DOMAIN}/projects/`,
        "description": "Development and distribution of electronic assemblies, microcontroller accessories, and prototyping components for hardware projects."
    };

    let finalProjects = TEMPLATE
        .replace(/{{TITLE}}/g, 'Projects | Kanito')
        .replace(/{{DESCRIPTION}}/g, 'Development and distribution of electronic assemblies, microcontroller accessories, and prototyping components for hardware projects.')
        .replace(/{{IMAGE}}/g, `${DOMAIN}/logo.png`)
        .replace(/{{URL}}/g, `${DOMAIN}/projects/`)
        .replace(/{{YEAR}}/g, YEAR)
        .replace('{{JSON_LD}}', `<script type="application/ld+json">\n${JSON.stringify(projectsJsonLd)}\n</script>`)
        .replace('{{CONTENT}}', projectsContent);

    await fs.mkdir('dist/projects', { recursive: true });
    await fs.writeFile('dist/projects/index.html', finalProjects);
    console.log('Generated Projects Page (dist/projects/index.html)');

    sitemapUrls += `<url><loc>${DOMAIN}/projects/</loc><priority>0.9</priority></url>\n`;

    // --- NEW MINIMALIST LANDING PAGE (kanito.de/) ---
    const landingContent = `
        <section class="landing-hero">
            <div class="landing-tag">[ ARCHIVE &amp; PORTFOLIO ]</div>
            <h1 class="landing-title">Kanito.</h1>
            <p class="landing-lead">Hardware engineering, embedded systems prototyping, and curated monochrome architectural photography by Silas Hörz.</p>
        </section>

        <section class="hub-grid">
            <!-- Photos Card -->
            <a href="/photos/" class="hub-card" id="hub-card-photos" title="Explore Photography Portfolio">
                <div class="hub-card-header">
                    <span class="hub-tag">[01 / VISUALS]</span>
                    <span class="hub-badge">PHOTOGRAPHY</span>
                </div>
                <div class="hub-visual hub-visual-photos">
                    <div class="hub-frame-preview"></div>
                </div>
                <h2 class="hub-card-title">photos.</h2>
                <p class="hub-card-desc">Curated architectural, structural, and monochrome photography portfolio exploring brutalism, high-contrast light geometry, and fine-art framing.</p>
                <div class="hub-card-meta">
                    <span class="hub-meta-item">ARCHITECTURAL</span>
                    <span class="hub-meta-item">MONOCHROME</span>
                    <span class="hub-meta-item">LEICA &amp; PRIME</span>
                </div>
                <div class="hub-card-footer">
                    <span class="btn-card">Explore Photos →</span>
                </div>
            </a>

            <!-- Projects Card -->
            <a href="/projects/" class="hub-card" id="hub-card-projects" title="View Hardware Projects & Documentation">
                <div class="hub-card-header">
                    <span class="hub-tag">[02 / ENGINEERING]</span>
                    <span class="hub-badge">HARDWARE &amp; CODE</span>
                </div>
                <div class="hub-visual hub-visual-projects">
                    <div class="hub-code-preview">
                        <span class="hub-code-line-dim">// Embedded Hardware &amp; Firmware</span>
                        <span class="hub-code-line-hi">kanito.prototype.init();</span>
                        <span class="hub-code-line-dim">export const Tally = new Device();</span>
                    </div>
                </div>
                <h2 class="hub-card-title">projects.</h2>
                <p class="hub-card-desc">Development and distribution of electronic assemblies, microcontroller accessories, open-source hardware, and technical schematics.</p>
                <div class="hub-card-meta">
                    <span class="hub-meta-item">MICROCONTROLLERS</span>
                    <span class="hub-meta-item">HARDWARE PROTOTYPES</span>
                    <span class="hub-meta-item">OPEN SOURCE</span>
                </div>
                <div class="hub-card-footer">
                    <span class="btn-card">View Projects →</span>
                </div>
            </a>
        </section>

        <div class="hub-extensible-note">
            <span>More disciplines &amp; archives upcoming</span>
        </div>
    `;

    const indexJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Kanito",
        "url": DOMAIN,
        "description": "Hardware engineering, embedded systems prototyping, and curated monochrome architectural photography by Silas Hörz."
    };

    let finalIndex = TEMPLATE
        .replace(/{{TITLE}}/g, 'Kanito | Engineering & Fine-Art Photography')
        .replace(/{{DESCRIPTION}}/g, 'Hardware engineering, embedded systems prototyping, and curated architectural photography by Silas Hörz.')
        .replace(/{{IMAGE}}/g, `${DOMAIN}/logo.png`)
        .replace(/{{URL}}/g, `${DOMAIN}/`)
        .replace(/{{YEAR}}/g, YEAR)
        .replace('{{JSON_LD}}', `<script type="application/ld+json">\n${JSON.stringify(indexJsonLd)}\n</script>`)
        .replace('{{CONTENT}}', landingContent);

    await fs.writeFile('dist/index.html', finalIndex);
    console.log('Generated Minimalist Landing Page (dist/index.html)');

    // --- PHOTOS GALLERY PAGE (kanito.de/photos) ---
    try {
        const PHOTOS_TEMPLATE = await fs.readFile('photos/template-photos.html', 'utf-8');

        let galleryCardsHtml = '';
        const igSvg = `<svg class="ig-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`;
        for (const p of PHOTOS) {
            const igBadge = p.instagram ? ` <a href="https://instagram.com/${p.instagram.replace(/^@/, '')}" target="_blank" rel="noopener noreferrer" class="photo-ig-badge" onclick="event.stopPropagation();">${igSvg}<span>${p.instagram}</span></a>` : '';
            const likeBtnHtml = (GALLERY_SETTINGS.show_likes !== false) ? `
                            <button type="button" class="photo-card-like-btn" data-id="${p.id}" data-base-likes="${p.likes || 0}" aria-label="Like ${p.title}">
                                <svg class="heart-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                                <span class="like-count">${p.likes || 0}</span>
                            </button>
            ` : '';

            const pFrame = p.frame || GALLERY_SETTINGS.default_frame || 'none';
            const pFrameWidth = (p.frame_width != null && p.frame_width !== '') ? Number(p.frame_width) : Number(GALLERY_SETTINGS.frame_width || 16);
            let frameClass = '';
            let frameAttr = `style="aspect-ratio: ${p.width} / ${p.height};"`;
            if (pFrame === 'white') {
                frameClass = 'frame-white';
                frameAttr = `style="aspect-ratio: ${p.width} / ${p.height}; --frame-w: ${pFrameWidth}px;"`;
            } else if (pFrame === 'black') {
                frameClass = 'frame-black';
                frameAttr = `style="aspect-ratio: ${p.width} / ${p.height}; --frame-w: ${pFrameWidth}px;"`;
            }

            const hasLocName = Boolean(p.location_name && p.location_name.trim() && p.location_name.toLowerCase() !== 'location');
            const locTagHtml = (hasLocName && p.has_location !== false) ? `<div class="photo-location-tag">${p.location_name}</div>` : '';
            const descPart = p.description ? ` ${p.description}` : '';
            const locPart = hasLocName ? ` in ${p.location_name}.` : '.';

            galleryCardsHtml += `
                <figure class="photo-item" data-id="${p.id}" data-author="${p.photographer}" tabindex="0" role="button" aria-label="View photo: ${p.title}">
                    <div class="canvas-container-box ${frameClass}" ${frameAttr}>
                        <canvas width="${p.width}" height="${p.height}" aria-hidden="true"></canvas>
                        <div class="photo-shield" title="View details: ${p.title}"></div>
                    </div>
                    <div class="photo-meta-bar">
                        <div>
                            <div class="photo-title">${p.title}</div>
                            <div class="photo-author">${p.photographer}${igBadge}</div>
                        </div>
                        <div class="photo-meta-right">
                            ${locTagHtml}
                            ${likeBtnHtml}
                        </div>
                    </div>
                    <figcaption class="sr-only">
                        <h3>${p.title}</h3>
                        <p>Fine art monochrome photograph by ${p.photographer} (${p.instagram || ''})${locPart}${descPart} Camera: ${p.camera || 'Leica'}, Lens: ${p.lens || 'Prime'}.</p>
                    </figcaption>
                </figure>
            `;
        }

        const photosJsonLd = {
            "@context": "https://schema.org",
            "@type": "ImageGallery",
            "name": "Kanito Photos",
            "url": `${DOMAIN}/photos/`,
            "description": "Curated architectural and monochrome photography portfolio by Silas Hörz and collaborative photographers.",
            "author": {
                "@type": "Person",
                "name": "Silas Hörz"
            },
            "hasPart": PHOTOS.map(p => ({
                "@type": "Photograph",
                "name": p.title,
                "description": p.description,
                "author": {
                    "@type": "Person",
                    "name": p.photographer,
                    ...(p.instagram ? { "sameAs": `https://instagram.com/${p.instagram.replace(/^@/, '')}` } : {})
                },
                "contentLocation": p.location_name,
                "dateCreated": p.date
            }))
        };

        const finalPhotosHtml = PHOTOS_TEMPLATE
            .replace(/{{TITLE}}/g, 'Photos | Kanito')
            .replace(/{{DESCRIPTION}}/g, 'Curated fine-art architectural and monochrome photography portfolio by Silas Hörz and collaborative photographers.')
            .replace(/{{IMAGE}}/g, `${DOMAIN}/logo.png`)
            .replace(/{{URL}}/g, `${DOMAIN}/photos/`)
            .replace(/{{YEAR}}/g, YEAR)
            .replace('{{JSON_LD}}', `<script type="application/ld+json">\n${JSON.stringify(photosJsonLd, null, 2)}\n</script>`)
            .replace('{{GALLERY_ITEMS}}', galleryCardsHtml)
            .replace('{{PHOTOS_JSON}}', JSON.stringify(PHOTOS))
            .replace('{{SHOW_LIKES}}', GALLERY_SETTINGS.show_likes !== false ? 'true' : 'false')
            .replace('{{SETTINGS_JSON}}', JSON.stringify(GALLERY_SETTINGS));

        await fs.mkdir('dist/photos', { recursive: true });
        await fs.writeFile('dist/photos/index.html', finalPhotosHtml);
        console.log(`Generated Photos Gallery (dist/photos/index.html) with ${PHOTOS.length} frames.`);

        sitemapUrls += `<url><loc>${DOMAIN}/photos/</loc><priority>0.9</priority></url>\n`;
    } catch (e) {
        console.error('Error generating photos gallery:', e);
    }

    // --- CURATOR STUDIO & ADMIN (kanito.de/photos/edit) ---
    try {
        const EDIT_TEMPLATE = await fs.readFile('photos/template-edit.html', 'utf-8');
        const finalEditHtml = EDIT_TEMPLATE.replace(/{{YEAR}}/g, YEAR);
        await fs.mkdir('dist/photos/edit', { recursive: true });
        await fs.writeFile('dist/photos/edit/index.html', finalEditHtml);
        console.log('Generated Curator Studio & Admin (dist/photos/edit/index.html)');

        sitemapUrls += `<url><loc>${DOMAIN}/photos/edit/</loc><priority>0.2</priority></url>\n`;
    } catch (e) {
        console.error('Error generating photos edit page:', e);
    }

    // --- SITEMAP & ROBOTS ---
    sitemapUrls += `<url><loc>${DOMAIN}/legal.html</loc><priority>0.3</priority></url>\n`;
    sitemapUrls += `<url><loc>${DOMAIN}/privacy.html</loc><priority>0.3</priority></url>\n`;

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}</urlset>`;
    await fs.writeFile('dist/sitemap.xml', sitemap);

    const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml`;
    await fs.writeFile('dist/robots.txt', robotsTxt);

    console.log('Build successful! ✅ All pages generated.');
}

build();