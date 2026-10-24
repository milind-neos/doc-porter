// Initialize Mermaid (Always crisp light theme for Google Docs / PDF compatibility)
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: { useMaxWidth: true, htmlLabels: true }
});

// Cache DOM Elements
const markdownInput = document.getElementById('markdown-input');
const previewContent = document.getElementById('preview-content');
const copyBtn = document.getElementById('copy-btn');
const pdfBtn = document.getElementById('pdf-btn');
const clearBtn = document.getElementById('clear-btn');
const loadSampleBtn = document.getElementById('load-sample');
const themeToggle = document.getElementById('theme-toggle');
const statusIndicator = document.getElementById('rendering-status');
const toastEl = document.getElementById('toast');
const toastTitle = document.getElementById('toast-title');
const toastDesc = document.getElementById('toast-desc');
const hiddenCanvas = document.getElementById('hidden-canvas');
const fileInput = document.getElementById('file-input');
const openMdBtn = document.getElementById('open-md-btn');
const saveMdBtn = document.getElementById('save-md-btn');
const editorDropZone = document.getElementById('editor-drop-zone');
const docStatsEl = document.getElementById('doc-stats');
const autosaveBadge = document.getElementById('autosave-badge');

// State & Constants
const STORAGE_KEY = 'ag_doc_porter_draft_v2';
let renderTimeout;
let diagramCounter = 0;
let mathCounter = 0;

// Sample Markdown Document
const sampleMarkdown = `---
Title: Architecture & Technical Design Document
Author: Platform Engineering
Status: Approved
Version: 2.0
---

# 🛠️ Architecture & Technical Design Document

This document demonstrates the full rendering capabilities of the **Antigravity Doc Porter**. Any element in this preview—including inline code like \`session_id\` or \`kid\` headers, compact tables, callout boxes, and diagrams—can be seamlessly copied and pasted directly into **Google Docs** or **Confluence**!

---

## 1. System High-Level Architecture
Here is a high-level representation of our real-time synchronization architecture (hover over the diagram to copy or download just the PNG):

\`\`\`mermaid
graph TD
    User([Developer App]) -->|Writes MD + Mermaid| AP[Antigravity Doc Porter]
    AP -->|Compiles Elements| RT[1x1 Table & Rich Text Builder]
    AP -->|Rasterizes SVG| PNG[3x Retina PNG Converter]
    RT & PNG -->|Bundles Payload| Clipboard[System Clipboard]
    Clipboard -->|Perfect Paste Ctrl+V| GDocs[Google Docs / Confluence]
    
    style AP fill:#6366f1,stroke:#4f46e5,color:#ffffff,stroke-width:2px
    style Clipboard fill:#10b981,stroke:#059669,color:#ffffff,stroke-width:2px
    style GDocs fill:#818cf8,stroke:#4f46e5,color:#ffffff,stroke-width:2px
\`\`\`

---

## 2. Dynamic Feature Checklist
- [x] **Inline Code Spacing Fix**: Using \`kid\` or \`access_token\` mid-sentence preserves surrounding spaces in Google Docs.
- [x] **1x1 Table Callouts & Code Boxes**: Callout alerts and code blocks paste as true bordered boxes in Google Docs.
- [x] **Compact Zero-Gap Tables**: Table cells set \`0pt\` before/after paragraph spacing so rows stay sleek.
- [ ] **Per-Diagram Export**: Hover any diagram to copy or download its 3x PNG individually.

---

## 3. Important Notices & Documentation Guidelines

Let's look at how GitHub-style alerts and callout boxes render in the preview and paste as bordered panels into Google Docs:

> [!NOTE]
> This is a standard notice callout. Use the \`Authorization\` header when calling the introspection endpoint.

> [!IMPORTANT]
> Always verify the active \`kid\` value in the JWKS payload before rotating signing keys.

> [!WARNING]
> Do not deprecate the previous signing key until all cached \`access_token\` instances have expired.

---

## 4. Database Schema Overview
Below is a compact layout mapping out key data objects within our storage layer:

| Table Name | Field | Type | Description | Key |
| :--- | :--- | :--- | :--- | :--- |
| **UserSession** | \`session_id\` | VARCHAR(64) | Unique tracking token for active \`kid\` validation | PRIMARY KEY |
| | \`payload_size\` | INT | Buffer size in bytes | |
| | \`created_at\` | TIMESTAMP | System generation time | |
| **DiagramCache** | \`diagram_id\` | VARCHAR(64) | SHA-256 hash of source \`mermaid\` block | PRIMARY KEY |
| | \`image_blob\` | BLOB | Compiled 3x PNG stream | |

---

## 5. Verification Steps (Numbered List with Code Blocks)
1. Call the token generation endpoint to obtain a new \`token.json\` file:
   \`\`\`bash
   curl -X POST "https://api.example.com/oauth/token" -o token.json
   \`\`\`
2. Extract and base64-decode the first segment (\`header\`) of the returned JWT:
   \`\`\`bash
   cat token.json | jq -r '.access_token' | cut -d'.' -f1 | base64 --decode
   \`\`\`
3. Verify that the output returns the expected \`kid\` and \`alg\` values:
   \`\`\`json
   {
     "alg": "RS256",
     "kid": "kid_v2",
     "typ": "JWT"
   }
   \`\`\`

---

## 6. Mathematical Formulations & Scoring Models

LaTeX formulas render as crisp vector elements in the preview and paste as 3x Retina PNG images into Google Docs & Confluence:

### Formula Structure:

$$
\\text{Component Score } S_i \\in [0, 100] = \\min\\left(100, \\; \\sum (\\text{Mapped Metric} \\times \\text{Weight})\\right)
$$

Inline equations like $S_i \\in [0, 100]$ or $E = mc^2$ preserve proper baseline alignment across paragraphs, lists, and table cells!
`;

// Helper: Show Toast Notification
function showToast(title, message, isSuccess = true) {
    toastTitle.innerText = title;
    toastDesc.innerText = message;
    const iconEl = toastEl.querySelector('.toast-icon i');
    if (isSuccess) {
        iconEl.className = 'fa-solid fa-circle-check';
        toastEl.style.borderLeft = '4px solid var(--accent)';
    } else {
        iconEl.className = 'fa-solid fa-circle-exclamation';
        toastEl.style.borderLeft = '4px solid var(--danger)';
    }
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 4000);
}

// Convert SVG to high-res PNG Data URL using Canvas (3x Retina Scale)
function svgToPng(svgElement, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const bbox = svgElement.getBoundingClientRect();
            let width = Math.round(bbox.width);
            let height = Math.round(bbox.height);

            // Compute fallback dimensions if element has 0 bbox (e.g. detached or hidden)
            if (!width || !height) {
                const vb = svgElement.viewBox?.baseVal;
                if (vb && vb.width && vb.height) {
                    const aspect = vb.width / vb.height;
                    height = options.isInline ? 18 : 36;
                    width = Math.round(height * aspect);
                } else {
                    width = 400;
                    height = 50;
                }
            }

            const clonedSvg = svgElement.cloneNode(true);
            const isMath = !!svgElement.closest('.math-block-container, .math-inline-container') || svgElement.classList.contains('MathJax');
            if (isMath) {
                clonedSvg.style.color = '#0f172a';
            }

            const serializer = new XMLSerializer();
            let svgString = serializer.serializeToString(clonedSvg);
            
            if (!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
                svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }

            const svgUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgString);
            const img = new Image();

            img.onload = function() {
                const scale = 3; // 3x scaling for ultra-sharp Retina/4K output in Google Docs
                hiddenCanvas.width = width * scale;
                hiddenCanvas.height = height * scale;
                
                const ctx = hiddenCanvas.getContext('2d');
                ctx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);
                
                if (!options.transparent) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);
                }
                
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0, width, height);

                const pngDataUrl = hiddenCanvas.toDataURL('image/png');
                resolve({ pngDataUrl, width, height });
            };

            img.onerror = function(err) {
                reject(err);
            };

            img.src = svgUrl;
        } catch (e) {
            reject(e);
        }
    });
}

// Parse optional YAML Frontmatter at the top of a Markdown file
function extractYamlFrontmatter(rawMarkdown) {
    const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const match = rawMarkdown.match(fmRegex);
    if (!match) {
        return { frontmatterHtml: '', contentMarkdown: rawMarkdown };
    }

    const yamlBlock = match[1].trim();
    const contentMarkdown = rawMarkdown.slice(match[0].length);
    const lines = yamlBlock.split(/\r?\n/);
    const pairs = [];

    lines.forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (key) {
                pairs.push({ key, val });
            }
        }
    });

    if (pairs.length === 0) {
        return { frontmatterHtml: '', contentMarkdown };
    }

    const rowsHtml = pairs.map(({ key, val }) => {
        const escapedKey = key.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escapedVal = val.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<tr><td class="fm-key">${escapedKey}</td><td class="fm-val">${escapedVal}</td></tr>`;
    }).join('');

    const frontmatterHtml = `<div class="frontmatter-card"><div class="frontmatter-header">Document Metadata</div><table class="frontmatter-table"><tbody>${rowsHtml}</tbody></table></div>`;
    return { frontmatterHtml, contentMarkdown };
}

// Update Document Statistics (Word Count & Diagram/Math Count)
function updateDocumentStats(rawMarkdown) {
    if (!docStatsEl) return;
    const cleanText = rawMarkdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\$\$[\s\S]*?\$\$/g, ' ')
        .replace(/[#>*_`~\-\[\]()!|]/g, ' ')
        .trim();
    const words = cleanText ? cleanText.split(/\s+/).length : 0;
    const mermaidCount = (rawMarkdown.match(/```mermaid\b/gi) || []).length;
    const mathCount = (rawMarkdown.match(/\$\$[\s\S]*?\$\$/g) || []).length + (rawMarkdown.match(/```(math|latex|tex)\b/gi) || []).length;

    const parts = [`${words} words`];
    if (mermaidCount > 0) parts.push(`${mermaidCount} diagram${mermaidCount > 1 ? 's' : ''}`);
    if (mathCount > 0) parts.push(`${mathCount} formula${mathCount > 1 ? 's' : ''}`);
    docStatsEl.textContent = parts.join(' • ');
}

// Tokenizer & Renderer Extensions for LaTeX Formulas
const blockMathExtension = {
    name: 'blockMath',
    level: 'block',
    start(src) {
        const idx1 = src.indexOf('$$');
        const idx2 = src.indexOf('\\[');
        if (idx1 === -1) return idx2;
        if (idx2 === -1) return idx1;
        return Math.min(idx1, idx2);
    },
    tokenizer(src) {
        let match = src.match(/^\$\$([\s\S]*?)\$\$/);
        if (!match) {
            match = src.match(/^\\\[([\s\S]*?)\\\]/);
        }
        if (match) {
            mathCounter++;
            const id = `math-block-${Date.now()}-${mathCounter}`;
            return {
                type: 'blockMath',
                raw: match[0],
                text: match[1].trim(),
                id
            };
        }
    },
    renderer(token) {
        return `
            <div class="math-block-container" data-id="${token.id}">
                <div class="diagram-toolbar math-toolbar" contenteditable="false">
                    <button type="button" class="diagram-action-btn copy-math-btn" data-target-id="${token.id}" title="Copy formula as 3x Retina PNG for Google Docs">
                        <i class="fa-solid fa-copy"></i> Copy PNG
                    </button>
                    <button type="button" class="diagram-action-btn download-math-btn" data-target-id="${token.id}" title="Download formula as 3x PNG">
                        <i class="fa-solid fa-download"></i> PNG
                    </button>
                    <button type="button" class="diagram-action-btn copy-latex-btn" data-target-id="${token.id}" title="Copy raw LaTeX equation">
                        <i class="fa-solid fa-code"></i> TeX
                    </button>
                </div>
                <pre class="math-code-raw" style="display:none;">${token.text}</pre>
                <div class="math-render-target" id="${token.id}">Rendering equation...</div>
            </div>
        `;
    }
};

const inlineMathExtension = {
    name: 'inlineMath',
    level: 'inline',
    start(src) {
        let index = src.indexOf('$');
        while (index !== -1) {
            if (src[index + 1] !== '$' && (index === 0 || src[index - 1] !== '\\')) {
                return index;
            }
            index = src.indexOf('$', index + 1);
        }
        return src.indexOf('\\(');
    },
    tokenizer(src) {
        let match = src.match(/^\$([^\s\$](?:\\\$|[^\$\n])*?[^\s\$]|[^\s\$])\$/);
        if (!match) {
            match = src.match(/^\\\(([\s\S]*?)\\\)/);
        }
        if (match) {
            mathCounter++;
            const id = `math-inline-${Date.now()}-${mathCounter}`;
            return {
                type: 'inlineMath',
                raw: match[0],
                text: match[1].trim(),
                id
            };
        }
    },
    renderer(token) {
        return `<span class="math-inline-container" data-id="${token.id}"><span class="math-code-raw" style="display:none;">${token.text}</span><span class="math-inline-render-target" id="${token.id}">$${token.text}$</span></span>`;
    }
};

// Custom Renderer overrides to isolate and tag Mermaid Code Blocks, Math Blocks, and GitHub Alert Blocks
marked.use({
    extensions: [blockMathExtension, inlineMathExtension],
    renderer: {
        code(codeObj, lang) {
            let text = '';
            let language = '';
            
            if (typeof codeObj === 'object' && codeObj !== null) {
                text = codeObj.text || '';
                language = codeObj.lang || '';
            } else {
                text = codeObj || '';
                language = lang || '';
            }
            
            if (language === 'mermaid') {
                diagramCounter++;
                const id = `mermaid-raw-${diagramCounter}`;
                const diagIndex = diagramCounter;
                return `
                    <div class="mermaid-diagram-container" data-id="${id}" data-diagram-index="${diagIndex}">
                        <div class="diagram-toolbar" contenteditable="false">
                            <button type="button" class="diagram-action-btn copy-diagram-btn" data-target-id="${id}" title="Copy just this diagram as a 3x PNG for Google Docs/Slides">
                                <i class="fa-solid fa-copy"></i> Copy PNG
                            </button>
                            <button type="button" class="diagram-action-btn download-diagram-btn" data-target-id="${id}" data-diagram-index="${diagIndex}" title="Download this diagram as a 3x high-res PNG">
                                <i class="fa-solid fa-download"></i> PNG
                            </button>
                        </div>
                        <pre class="mermaid-code-raw" style="display:none;">${text}</pre>
                        <div class="mermaid-render-target" id="${id}">Rendering diagram...</div>
                    </div>
                `;
            }

            if (['math', 'latex', 'tex'].includes(language.toLowerCase())) {
                mathCounter++;
                const id = `math-block-${Date.now()}-${mathCounter}`;
                return `
                    <div class="math-block-container" data-id="${id}">
                        <div class="diagram-toolbar math-toolbar" contenteditable="false">
                            <button type="button" class="diagram-action-btn copy-math-btn" data-target-id="${id}" title="Copy formula as 3x Retina PNG for Google Docs">
                                <i class="fa-solid fa-copy"></i> Copy PNG
                            </button>
                            <button type="button" class="diagram-action-btn download-math-btn" data-target-id="${id}" title="Download formula as 3x PNG">
                                <i class="fa-solid fa-download"></i> PNG
                            </button>
                            <button type="button" class="diagram-action-btn copy-latex-btn" data-target-id="${id}" title="Copy raw LaTeX equation">
                                <i class="fa-solid fa-code"></i> TeX
                            </button>
                        </div>
                        <pre class="math-code-raw" style="display:none;">${text}</pre>
                        <div class="math-render-target" id="${id}">Rendering equation...</div>
                    </div>
                `;
            }
            
            return false;
        },
        blockquote(quoteObj) {
            let text = '';
            if (typeof quoteObj === 'object' && quoteObj !== null) {
                text = quoteObj.text || '';
                if (!text && quoteObj.raw) {
                    text = quoteObj.raw.replace(/^>\s?/gm, '');
                }
            } else {
                text = quoteObj || '';
            }
            
            const cleanText = text.replace(/^<p>/i, '').replace(/<\/p>\s*$/i, '').trim();
            const match = cleanText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*|<br\s*\/?>|<\/p>\s*<p>)*(.*)/is);
            
            if (match) {
                const type = match[1].toUpperCase();
                const rawMarkdownBody = match[2].trim();
                const parsedBody = marked.parse(rawMarkdownBody);
                let icon = 'fa-info-circle';
                let emoji = 'ℹ️';
                
                if (type === 'TIP') {
                    icon = 'fa-lightbulb';
                    emoji = '💡';
                } else if (type === 'IMPORTANT') {
                    icon = 'fa-circle-exclamation';
                    emoji = '🟣';
                } else if (type === 'WARNING') {
                    icon = 'fa-triangle-exclamation';
                    emoji = '⚠️';
                } else if (type === 'CAUTION') {
                    icon = 'fa-circle-xmark';
                    emoji = '🛑';
                }
                
                return `
                    <div class="alert-block alert-${type.toLowerCase()}" data-alert-type="${type}" data-alert-emoji="${emoji}">
                        <div class="alert-title">
                            <i class="fa-solid ${icon}"></i> <span class="alert-title-text">${type}</span>
                        </div>
                        <div class="alert-body">${parsedBody}</div>
                    </div>
                `;
            }
            
            return false;
        }
    }
});

// Bind Per-Diagram Copy & Download Actions
function bindDiagramToolbarEvents() {
    previewContent.querySelectorAll('.copy-diagram-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target-id');
            const svgEl = previewContent.querySelector(`#${targetId} svg`);
            if (!svgEl) {
                showToast('Diagram Not Ready', 'Wait for the diagram to finish rendering.', false);
                return;
            }
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Copying...';
            btn.disabled = true;
            try {
                const { pngDataUrl } = await svgToPng(svgEl);
                const res = await fetch(pngDataUrl);
                const pngBlob = await res.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': pngBlob })
                ]);
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                showToast('Diagram Copied!', 'Paste (Ctrl+V) the 3x PNG directly into Google Docs or Slides.');
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }, 1800);
            } catch (err) {
                console.error('Failed to copy diagram PNG:', err);
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast('Copy Failed', 'Could not copy PNG image to clipboard.', false);
            }
        });
    });

    previewContent.querySelectorAll('.download-diagram-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target-id');
            const diagIndex = btn.getAttribute('data-diagram-index') || '1';
            const svgEl = previewContent.querySelector(`#${targetId} svg`);
            if (!svgEl) return;

            try {
                const { pngDataUrl } = await svgToPng(svgEl);
                const link = document.createElement('a');
                link.download = `mermaid-diagram-${diagIndex}.png`;
                link.href = pngDataUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast('PNG Downloaded', `Saved mermaid-diagram-${diagIndex}.png at 3x resolution.`);
            } catch (err) {
                console.error('Failed to download diagram PNG:', err);
                showToast('Download Failed', 'Could not export diagram PNG.', false);
            }
        });
    });

    // Bind Per-Math-Formula Actions
    previewContent.querySelectorAll('.copy-math-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target-id');
            const svgEl = previewContent.querySelector(`#${targetId} svg`);
            if (!svgEl) {
                showToast('Equation Not Ready', 'Wait for the equation to finish rendering.', false);
                return;
            }
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Copying...';
            btn.disabled = true;
            try {
                const { pngDataUrl } = await svgToPng(svgEl, { transparent: false });
                const res = await fetch(pngDataUrl);
                const pngBlob = await res.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': pngBlob })
                ]);
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                showToast('Formula Copied!', 'Paste (Ctrl+V) the 3x PNG directly into Google Docs or Slides.');
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }, 1800);
            } catch (err) {
                console.error('Failed to copy formula PNG:', err);
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                showToast('Copy Failed', 'Could not copy PNG image to clipboard.', false);
            }
        });
    });

    previewContent.querySelectorAll('.download-math-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target-id');
            const svgEl = previewContent.querySelector(`#${targetId} svg`);
            if (!svgEl) return;

            try {
                const { pngDataUrl } = await svgToPng(svgEl, { transparent: false });
                const link = document.createElement('a');
                link.download = `formula-${targetId}.png`;
                link.href = pngDataUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast('PNG Downloaded', 'Saved formula at 3x Retina resolution.');
            } catch (err) {
                console.error('Failed to download formula PNG:', err);
                showToast('Download Failed', 'Could not export formula PNG.', false);
            }
        });
    });

    previewContent.querySelectorAll('.copy-latex-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target-id');
            const container = previewContent.querySelector(`.math-block-container[data-id="${targetId}"]`);
            const rawCode = container?.querySelector('.math-code-raw')?.textContent || '';
            if (!rawCode) return;

            try {
                await navigator.clipboard.writeText(rawCode);
                showToast('LaTeX Copied!', 'Formula source code copied to clipboard.');
            } catch (err) {
                console.error('Failed to copy LaTeX:', err);
                showToast('Copy Failed', 'Could not copy LaTeX to clipboard.', false);
            }
        });
    });
}

// Live Compilation of Markdown and Diagrams
async function renderDocument() {
    statusIndicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rendering...';
    statusIndicator.style.color = 'var(--text-secondary)';
    
    diagramCounter = 0;
    mathCounter = 0;
    const rawMarkdown = markdownInput.value;
    updateDocumentStats(rawMarkdown);
    
    // Extract optional YAML frontmatter and parse body Markdown
    const { frontmatterHtml, contentMarkdown } = extractYamlFrontmatter(rawMarkdown);
    const htmlContent = frontmatterHtml + marked.parse(contentMarkdown);
    previewContent.innerHTML = htmlContent;

    // Run Highlight.js syntax highlighting
    previewContent.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });

    // Render Mermaid diagrams
    const targets = previewContent.querySelectorAll('.mermaid-render-target');
    
    for (const target of targets) {
        const id = target.id;
        const code = target.previousElementSibling.textContent;
        try {
            const { svg } = await mermaid.render(`mermaid-rendered-${id}-${Date.now()}`, code);
            target.innerHTML = svg;
        } catch (error) {
            console.error('Mermaid render error:', error);
            target.innerHTML = `
                <div style="color: var(--danger); padding: 12px; font-family: sans-serif; font-size: 0.9rem; text-align: left; background: rgba(239, 68, 68, 0.05); border: 1px dashed var(--danger); border-radius: 6px;">
                    <strong>⚠️ Mermaid Syntax Error:</strong>
                    <pre style="margin-top: 8px; color: var(--text-primary); font-family: monospace; font-size: 0.8rem; overflow: auto; background: transparent; padding: 0;">${error.message || error}</pre>
                </div>
            `;
            try { mermaid.parseError(); } catch(e) {}
        }
    }

    // Render MathJax LaTeX equations
    if (window.MathJax && MathJax.tex2svg) {
        // Block equations
        const blockTargets = previewContent.querySelectorAll('.math-render-target');
        for (const target of blockTargets) {
            const code = target.previousElementSibling.textContent;
            try {
                const node = MathJax.tex2svg(code, { display: true });
                node.querySelectorAll('mjx-assistive-mml').forEach(el => el.remove());
                target.innerHTML = '';
                target.appendChild(node);
            } catch (error) {
                console.error('MathJax block render error:', error);
                target.innerHTML = `
                    <div class="math-error">
                        <strong>⚠️ LaTeX Formula Error:</strong> ${error.message || error}
                    </div>
                `;
            }
        }

        // Inline equations
        const inlineTargets = previewContent.querySelectorAll('.math-inline-render-target');
        for (const target of inlineTargets) {
            const code = target.previousElementSibling.textContent;
            try {
                const node = MathJax.tex2svg(code, { display: false });
                node.querySelectorAll('mjx-assistive-mml').forEach(el => el.remove());
                target.innerHTML = '';
                target.appendChild(node);
            } catch (error) {
                console.error('MathJax inline render error:', error);
                target.textContent = `$${code}$`;
            }
        }
    }

    bindDiagramToolbarEvents();

    statusIndicator.innerHTML = '<i class="fa-solid fa-circle-check"></i> Synced';
    statusIndicator.style.color = 'var(--accent)';
}

// Save draft to localStorage
function saveDraftToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, markdownInput.value);
        if (autosaveBadge) {
            autosaveBadge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Saved';
        }
    } catch (e) {
        console.warn('Unable to save draft to localStorage:', e);
    }
}

// Handle debounced updates to editor
markdownInput.addEventListener('input', () => {
    statusIndicator.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Typing...';
    statusIndicator.style.color = 'var(--text-muted)';
    if (autosaveBadge) {
        autosaveBadge.innerHTML = '<i class="fa-solid fa-pen"></i> Saving...';
    }
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
        saveDraftToStorage();
        renderDocument();
    }, 400);
});

// Open .md File Picker
if (openMdBtn && fileInput) {
    openMdBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            markdownInput.value = ev.target.result;
            saveDraftToStorage();
            renderDocument();
            showToast('File Loaded', `Loaded "${file.name}" into editor.`);
        };
        reader.readAsText(file);
        fileInput.value = '';
    });
}

// Save .md File Download
if (saveMdBtn) {
    saveMdBtn.addEventListener('click', () => {
        const content = markdownInput.value;
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const h1Match = content.match(/^#\s+(.+)$/m);
        const slug = h1Match
            ? h1Match[1].replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 50)
            : 'document';
        a.href = url;
        a.download = `${slug || 'document'}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Saved Markdown', `Downloaded ${slug || 'document'}.md`);
    });
}

// Drag & Drop .md File Support
if (editorDropZone) {
    ['dragenter', 'dragover'].forEach(evtName => {
        editorDropZone.addEventListener(evtName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            editorDropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(evtName => {
        editorDropZone.addEventListener(evtName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            editorDropZone.classList.remove('drag-over');
        });
    });

    editorDropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            markdownInput.value = ev.target.result;
            saveDraftToStorage();
            renderDocument();
            showToast('File Dropped', `Loaded "${file.name}" into editor.`);
        };
        reader.readAsText(file);
    });
}

// Load Sample Document
loadSampleBtn.addEventListener('click', () => {
    markdownInput.value = sampleMarkdown;
    saveDraftToStorage();
    renderDocument();
    showToast('Loaded', 'Technical template loaded into editor.');
});

// Clear Document
clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear your current document?')) {
        markdownInput.value = '';
        saveDraftToStorage();
        renderDocument();
        showToast('Cleared', 'Document cleared successfully.');
    }
});

// Theme Switching
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    document.body.classList.toggle('dark-theme');
    
    const isLight = document.body.classList.contains('light-theme');
    themeToggle.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    
    renderDocument();
});

// Helper: Convert code block DOM text nodes so spaces become non-breaking spaces (\u00A0)
// and newlines become <br>, preserving 100% of indentation and attribute spacing in Google Docs
function convertCodeDomForGoogleDocs(rootNode) {
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
        textNodes.push(currentNode);
        currentNode = walker.nextNode();
    }

    // Strip a single trailing newline at the very end of the code block if present
    if (textNodes.length > 0) {
        const lastNode = textNodes[textNodes.length - 1];
        lastNode.nodeValue = lastNode.nodeValue.replace(/\r?\n$/, '');
    }

    textNodes.forEach(textNode => {
        const raw = textNode.nodeValue.replace(/\r\n/g, '\n');
        const lines = raw.split('\n');
        const frag = document.createDocumentFragment();

        lines.forEach((line, idx) => {
            if (idx > 0) {
                frag.appendChild(document.createElement('br'));
            }
            if (line.length > 0) {
                // Convert tabs to 4 non-breaking spaces and ASCII spaces to \u00A0 so Google Docs never collapses code spaces
                const preserved = line.replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0').replace(/ /g, '\u00A0');
                frag.appendChild(document.createTextNode(preserved));
            }
        });

        textNode.parentNode.replaceChild(frag, textNode);
    });
}

// Core Command: Export to Google Doc & Confluence Clipboard
copyBtn.addEventListener('click', async () => {
    copyBtn.disabled = true;
    copyBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Preparing Copy...';
    
    try {
        // Create an offline copy of the document content
        const offlineRoot = document.createElement('div');
        offlineRoot.innerHTML = previewContent.innerHTML;

        // Remove interactive diagram hover toolbars so button text isn't copied
        offlineRoot.querySelectorAll('.diagram-toolbar').forEach(el => el.remove());

        // Convert Markdown task list checkboxes (<input type="checkbox">) into crisp Unicode symbols for Google Docs
        offlineRoot.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const marker = document.createElement('span');
            marker.textContent = cb.checked ? '☑️\u00A0' : '☐\u00A0';
            cb.parentNode.replaceChild(marker, cb);
        });
        
        // Unwrap <p> elements inside list items (<li>) so Google Docs detects list numbers perfectly and doesn't split bullets
        offlineRoot.querySelectorAll('li p').forEach(p => {
            const parent = p.parentNode;
            while (p.firstChild) {
                parent.insertBefore(p.firstChild, p);
            }
            parent.removeChild(p);
        });

        // BUG #1 FIX (Part A): Only trim leading whitespace on the VERY FIRST child node
        // and trailing whitespace on the VERY LAST child node of block elements.
        // Never trim intermediate text nodes, which previously stripped spaces around inline `code` tags!
        offlineRoot.querySelectorAll('h1, h2, h3, h4, td, th, p, li').forEach(el => {
            const nodes = Array.from(el.childNodes);
            if (nodes.length > 0 && nodes[0].nodeType === Node.TEXT_NODE) {
                nodes[0].nodeValue = nodes[0].nodeValue.replace(/^[\s\t\n]+/, '');
            }
            const lastIdx = nodes.length - 1;
            if (lastIdx >= 0 && nodes[lastIdx].nodeType === Node.TEXT_NODE) {
                nodes[lastIdx].nodeValue = nodes[lastIdx].nodeValue.replace(/[\s\t\n]+$/, '');
            }
        });

        // Split lists (ol or ul) containing pre elements into multiple list segments separated by code blocks
        offlineRoot.querySelectorAll('ol, ul').forEach(list => {
            if (!list.querySelector('pre')) return;
            
            const isOrdered = list.tagName.toLowerCase() === 'ol';
            const parent = list.parentNode;
            
            const fragment = document.createDocumentFragment();
            let currentList = document.createElement(list.tagName);
            
            if (list.getAttribute('style')) {
                currentList.setAttribute('style', list.getAttribute('style'));
            }
            fragment.appendChild(currentList);
            
            let itemIndex = 1;
            
            list.querySelectorAll(':scope > li').forEach(li => {
                const liChildren = Array.from(li.childNodes);
                const liHasPre = li.querySelector('pre');
                
                if (!liHasPre) {
                    const clonedLi = li.cloneNode(true);
                    currentList.appendChild(clonedLi);
                    itemIndex++;
                } else {
                    const textLi = document.createElement('li');
                    if (li.getAttribute('style')) {
                        textLi.setAttribute('style', li.getAttribute('style'));
                    }
                    
                    const preElements = [];
                    liChildren.forEach(child => {
                        if (child.nodeName.toLowerCase() === 'pre') {
                            preElements.push(child);
                        } else if (preElements.length === 0) {
                            textLi.appendChild(child.cloneNode(true));
                        }
                    });
                    
                    currentList.appendChild(textLi);
                    itemIndex++;
                    
                    preElements.forEach(pre => {
                        const codeBlock = pre.cloneNode(true);
                        codeBlock.setAttribute('data-list-indent', 'true');
                        fragment.appendChild(codeBlock);
                    });
                    
                    currentList = document.createElement(list.tagName);
                    if (list.getAttribute('style')) {
                        currentList.setAttribute('style', list.getAttribute('style'));
                    }
                    if (isOrdered) {
                        currentList.setAttribute('start', itemIndex);
                    }
                    fragment.appendChild(currentList);
                    
                    const trailingNodes = [];
                    let afterPre = false;
                    liChildren.forEach(child => {
                        if (child.nodeName.toLowerCase() === 'pre') {
                            afterPre = true;
                        } else if (afterPre) {
                            trailingNodes.push(child);
                        }
                    });
                    
                    if (trailingNodes.length > 0 && trailingNodes.some(n => n.textContent.trim() !== '')) {
                        const trailingLi = document.createElement('li');
                        if (li.getAttribute('style')) {
                            trailingLi.setAttribute('style', li.getAttribute('style'));
                        }
                        trailingNodes.forEach(node => {
                            trailingLi.appendChild(node.cloneNode(true));
                        });
                        currentList.appendChild(trailingLi);
                        itemIndex++;
                    }
                }
            });
            
            Array.from(fragment.childNodes).forEach(node => {
                if ((node.tagName.toLowerCase() === 'ol' || node.tagName.toLowerCase() === 'ul') && node.childNodes.length === 0) {
                    fragment.removeChild(node);
                }
            });
            
            parent.replaceChild(fragment, list);
        });
        
        // Helper: Programmatically inline styling on cloned offline nodes
        const inlineStyles = (selector, styleString) => {
            offlineRoot.querySelectorAll(selector).forEach(el => {
                const existing = el.getAttribute('style') || '';
                el.setAttribute('style', existing ? `${existing}; ${styleString}` : styleString);
            });
        };

        // Apply high-fidelity, cross-platform inline styles
        inlineStyles('h1', 'font-family: Arial, sans-serif; font-size: 22pt; font-weight: bold; color: #0f172a; margin-top: 16pt; margin-bottom: 6pt; border-bottom: 1.5pt solid #e2e8f0; padding-bottom: 4pt;');
        inlineStyles('h2', 'font-family: Arial, sans-serif; font-size: 16pt; font-weight: bold; color: #0f172a; margin-top: 14pt; margin-bottom: 5pt; border-bottom: 1pt solid #e2e8f0; padding-bottom: 3pt;');
        inlineStyles('h3', 'font-family: Arial, sans-serif; font-size: 13pt; font-weight: bold; color: #1e293b; margin-top: 12pt; margin-bottom: 4pt;');
        inlineStyles('h4', 'font-family: Arial, sans-serif; font-size: 11.5pt; font-weight: bold; color: #1e293b; margin-top: 10pt; margin-bottom: 3pt;');
        inlineStyles('p', 'font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #334155; margin-top: 0pt; margin-bottom: 8pt;');
        inlineStyles('li', 'font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #334155; margin-top: 0pt; margin-bottom: 3pt;');
        inlineStyles('ul', 'margin-top: 2pt; margin-bottom: 8pt; padding-left: 20pt; list-style-type: disc;');
        inlineStyles('ol', 'margin-top: 2pt; margin-bottom: 8pt; padding-left: 20pt; list-style-type: decimal;');
        
        // Inline GitHub-light-style syntax highlighting colors before converting <pre> blocks
        inlineStyles('.hljs-keyword', 'color: #cf222e; font-weight: bold;');
        inlineStyles('.hljs-string', 'color: #0a3069;');
        inlineStyles('.hljs-comment', 'color: #6e7781; font-style: italic;');
        inlineStyles('.hljs-number', 'color: #0550ae;');
        inlineStyles('.hljs-built_in', 'color: #953800;');
        inlineStyles('.hljs-literal', 'color: #0550ae;');
        inlineStyles('.hljs-type', 'color: #953800; font-weight: bold;');
        inlineStyles('.hljs-variable', 'color: #953800;');
        inlineStyles('.hljs-property', 'color: #0550ae;');
        inlineStyles('.hljs-attr', 'color: #116329;');
        inlineStyles('.hljs-title', 'color: #8250df; font-weight: bold;');

        // BUG #1 FIX (Part B): Lock spaces around and inside inline `code` elements using non-breaking spaces (\u00A0)
        // and convert to styled inline spans so Google Docs never drops boundary spaces when switching fonts!
        offlineRoot.querySelectorAll('code:not(pre code)').forEach(codeEl => {
            const prev = codeEl.previousSibling;
            if (prev && prev.nodeType === Node.TEXT_NODE && /[ \t\r\n]+$/.test(prev.nodeValue)) {
                prev.nodeValue = prev.nodeValue.replace(/[ \t\r\n]+$/, '\u00A0');
            }
            const next = codeEl.nextSibling;
            if (next && next.nodeType === Node.TEXT_NODE && /^[ \t\r\n]+/.test(next.nodeValue)) {
                next.nodeValue = next.nodeValue.replace(/^[ \t\r\n]+/, '\u00A0');
            }

            const span = document.createElement('span');
            span.setAttribute(
                'style',
                'background-color: #f1f5f9; color: #cf222e; font-family: "Courier New", Courier, monospace; font-size: 9.5pt; padding: 1pt 3pt; border-radius: 3pt;'
            );
            // Keep internal spaces breakable so long inline code spans wrap naturally inside table cells
            span.textContent = codeEl.textContent || '';
            codeEl.parentNode.replaceChild(span, codeEl);
        });

        // Convert YAML Frontmatter card if present into compact table styling for Google Docs
        offlineRoot.querySelectorAll('.frontmatter-card').forEach(card => {
            const header = card.querySelector('.frontmatter-header');
            if (header) header.remove();
            const fmTable = card.querySelector('.frontmatter-table');
            if (fmTable) {
                card.parentNode.replaceChild(fmTable, card);
            }
        });

        // Capture live rendered column width proportions from previewContent so Google Docs matches on-screen layout
        const liveTables = previewContent.querySelectorAll('table');

        // BUG #2 FIX: Zero paragraph spacing before/after inside all data table cells (th, td)
        // and preserve live column width ratios via <colgroup><col> + cell width percentages
        offlineRoot.querySelectorAll('table').forEach((table, tableIdx) => {
            table.setAttribute('style', 'border-collapse: collapse; width: 100%; table-layout: fixed; margin-top: 4pt; margin-bottom: 8pt; border: 1pt solid #cbd5e1;');
            // Tighten bottom margin of heading/paragraph immediately preceding a table
            const prevEl = table.previousElementSibling;
            if (prevEl) {
                const prevStyle = prevEl.getAttribute('style') || '';
                prevEl.setAttribute('style', `${prevStyle}; margin-bottom: 4pt;`);
            }

            const liveTable = liveTables[tableIdx];
            const liveFirstRow = liveTable ? liveTable.querySelector('tr') : null;
            const liveTableWidth = liveTable ? liveTable.getBoundingClientRect().width : 0;

            if (liveFirstRow && liveTableWidth > 0) {
                const liveCells = Array.from(liveFirstRow.children);
                const colPercentages = liveCells.map(c => {
                    const w = c.getBoundingClientRect().width;
                    return Math.max(4, Number(((w / liveTableWidth) * 100).toFixed(2)));
                });

                // Inject <colgroup> with explicit pixel and percentage widths for Google Docs / Confluence
                const existingColgroup = table.querySelector('colgroup');
                if (existingColgroup) existingColgroup.remove();
                const colgroup = document.createElement('colgroup');
                colPercentages.forEach(pct => {
                    const col = document.createElement('col');
                    const colPx = Math.max(28, Math.round((pct / 100) * 624)); // 624px = 6.5in standard Google Doc body width
                    col.setAttribute('width', String(colPx));
                    col.setAttribute('style', `width: ${pct}%;`);
                    colgroup.appendChild(col);
                });
                table.insertBefore(colgroup, table.firstChild);

                // Stamp column percentage onto each cell in every row
                table.querySelectorAll('tr').forEach(row => {
                    Array.from(row.children).forEach((cell, colIdx) => {
                        if (colPercentages[colIdx] !== undefined) {
                            cell.setAttribute('data-col-pct', String(colPercentages[colIdx]));
                        }
                    });
                });
            }
        });

        offlineRoot.querySelectorAll('tr:nth-child(even)').forEach(row => {
            const existing = row.getAttribute('style') || '';
            row.setAttribute('style', existing ? `${existing}; background-color: #f8fafc;` : 'background-color: #f8fafc;');
        });

        offlineRoot.querySelectorAll('th, td').forEach(cell => {
            const isHeader = cell.tagName.toLowerCase() === 'th';
            const isFmKey = cell.classList.contains('fm-key');
            const bg = (isHeader || isFmKey) ? 'background-color: #f1f5f9;' : '';
            const fw = (isHeader || isFmKey) ? 'font-weight: bold;' : '';
            const colPct = cell.getAttribute('data-col-pct');
            const widthRule = isFmKey
                ? 'width: 120pt;'
                : (colPct ? `width: ${colPct}%;` : '');
            if (colPct && !isFmKey) {
                cell.setAttribute('width', `${colPct}%`);
                cell.removeAttribute('data-col-pct');
            }
            const rawAlign = (cell.getAttribute('align') || (cell.style && cell.style.textAlign) || 'left').toLowerCase().trim();
            const cellAlign = ['left', 'center', 'right', 'justify'].includes(rawAlign) ? rawAlign : 'left';
            const txtColor = (isHeader || isFmKey) ? '#0f172a' : '#334155';
            const fontSize = isHeader ? '9.5pt' : '9.5pt';

            cell.setAttribute(
                'style',
                `${bg} ${widthRule} border: 1pt solid #cbd5e1; padding: 3pt 6pt; text-align: ${cellAlign}; vertical-align: middle; line-height: 1.15; font-family: Arial, sans-serif; font-size: ${fontSize}; color: ${txtColor}; ${fw}`
            );

            // Wrap cell contents in an explicit zero-margin <p> so Google Docs sets Before: 0pt, After: 0pt, Line-spacing: 1.15
            const pStyle = `margin: 0pt; margin-top: 0pt; margin-bottom: 0pt; padding: 0pt; text-align: ${cellAlign}; line-height: 1.15; font-family: Arial, sans-serif; font-size: ${fontSize}; color: ${txtColor}; ${fw}`;
            const existingPs = cell.querySelectorAll('p');
            if (existingPs.length > 0) {
                existingPs.forEach(p => p.setAttribute('style', pStyle));
            } else {
                const wrapperP = document.createElement('p');
                wrapperP.setAttribute('style', pStyle);
                while (cell.firstChild) {
                    wrapperP.appendChild(cell.firstChild);
                }
                cell.appendChild(wrapperP);
            }
        });

        // 1x1 Table-Backed Alert Callout Boxes (with Unicode Emoji Icons) for 100% Google Docs Box Fidelity
        offlineRoot.querySelectorAll('.alert-block').forEach(el => {
            const type = (el.getAttribute('data-alert-type') || 'NOTE').toUpperCase();
            let emoji = el.getAttribute('data-alert-emoji') || 'ℹ️';
            let color = '#2563eb';
            let bgColor = '#eff6ff';
            let borderColor = '#bfdbfe';
            let txtColor = '#1e3a8a';
            
            if (type === 'TIP') {
                color = '#059669';
                bgColor = '#ecfdf5';
                borderColor = '#a7f3d0';
                txtColor = '#065f46';
                emoji = '💡';
            } else if (type === 'IMPORTANT') {
                color = '#4f46e5';
                bgColor = '#f5f3ff';
                borderColor = '#ddd6fe';
                txtColor = '#3730a3';
                emoji = '🟣';
            } else if (type === 'WARNING') {
                color = '#d97706';
                bgColor = '#fffbeb';
                borderColor = '#fde68a';
                txtColor = '#92400e';
                emoji = '⚠️';
            } else if (type === 'CAUTION') {
                color = '#dc2626';
                bgColor = '#fef2f2';
                borderColor = '#fecaca';
                txtColor = '#991b1b';
                emoji = '🛑';
            }

            const bodyEl = el.querySelector('.alert-body') || el;
            const pEls = bodyEl.querySelectorAll('p');
            if (pEls.length > 0) {
                pEls.forEach((p, idx) => {
                    const isLast = idx === pEls.length - 1;
                    p.setAttribute(
                        'style',
                        `margin: 0pt; margin-top: 0pt; margin-bottom: ${isLast ? '0pt' : '4pt'}; padding: 0pt; line-height: 1.35; font-family: Arial, sans-serif; font-size: 10pt; color: ${txtColor};`
                    );
                });
            }

            const bodyHtml = bodyEl ? bodyEl.innerHTML : '';

            const boxTable = document.createElement('table');
            boxTable.className = 'gdoc-box-table';
            boxTable.setAttribute('style', 'border-collapse: collapse; width: 100%; margin-top: 6pt; margin-bottom: 8pt;');
            boxTable.innerHTML = `<tbody><tr><td style="background-color: ${bgColor}; border-top: 1pt solid ${borderColor}; border-right: 1pt solid ${borderColor}; border-bottom: 1pt solid ${borderColor}; border-left: 4pt solid ${color}; padding: 8pt 12pt; vertical-align: top;"><p style="margin: 0pt; margin-top: 0pt; margin-bottom: 4pt; padding: 0pt; line-height: 1.2; font-family: Arial, sans-serif; font-size: 10pt; font-weight: bold; color: ${color};">${emoji}\u00A0${type}</p><div style="margin: 0pt; padding: 0pt; line-height: 1.35; font-family: Arial, sans-serif; font-size: 10pt; color: ${txtColor};">${bodyHtml}</div></td></tr></tbody>`;
            el.parentNode.replaceChild(boxTable, el);
        });

        // 1x1 Table-Backed Code Blocks (<pre>) so Google Docs renders a real bordered, shaded container box
        offlineRoot.querySelectorAll('pre').forEach(pre => {
            if (pre.classList.contains('mermaid-code-raw')) return;

            const isListIndented = pre.getAttribute('data-list-indent') === 'true';
            const codeEl = pre.querySelector('code') || pre;
            convertCodeDomForGoogleDocs(codeEl);

            const codeBoxTable = document.createElement('table');
            codeBoxTable.className = 'gdoc-box-table';
            const indentStyle = isListIndented
                ? 'margin-left: 24pt; width: calc(100% - 24pt); margin-top: 4pt; margin-bottom: 6pt;'
                : 'width: 100%; margin-top: 6pt; margin-bottom: 8pt;';
            codeBoxTable.setAttribute('style', `border-collapse: collapse; ${indentStyle}`);

            const tbody = document.createElement('tbody');
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.setAttribute(
                'style',
                'background-color: #f6f8fa; border: 1pt solid #d0d7de; padding: 8pt 10pt; font-family: "Courier New", Courier, monospace; font-size: 9.5pt; line-height: 1.3; color: #24292f; vertical-align: top;'
            );

            const p = document.createElement('p');
            p.setAttribute(
                'style',
                'margin: 0pt; margin-top: 0pt; margin-bottom: 0pt; padding: 0pt; line-height: 1.3; font-family: "Courier New", Courier, monospace; font-size: 9.5pt; color: #24292f;'
            );
            p.innerHTML = codeEl.innerHTML;

            td.appendChild(p);
            tr.appendChild(td);
            tbody.appendChild(tr);
            codeBoxTable.appendChild(tbody);

            pre.parentNode.replaceChild(codeBoxTable, pre);
        });

        // Standard inline Quote styling
        inlineStyles('blockquote', 'border-left: 3pt solid #cbd5e1; background-color: #f8fafc; padding: 8pt 12pt; margin: 8pt 0; color: #475569; font-style: italic;');

        // Search for all rendered SVG diagrams and rasterize them to 3x PNG images
        const wrappers = offlineRoot.querySelectorAll('.mermaid-diagram-container');
        
        for (const wrapper of wrappers) {
            const svgElement = wrapper.querySelector('svg');
            
            if (svgElement) {
                const liveId = wrapper.getAttribute('data-id');
                const liveSvgElement = previewContent.querySelector(`[data-id="${liveId}"] svg`);
                
                if (liveSvgElement) {
                    try {
                        const { pngDataUrl, width, height } = await svgToPng(liveSvgElement);
                        wrapper.innerHTML = `<img class="rendered-diagram" src="${pngDataUrl}" width="${width}" height="${height}" alt="Rendered Diagram" style="display: block; margin: 10pt auto; max-width: 100%; height: auto;" />`;
                    } catch (err) {
                        console.error('Error rasterizing diagram to PNG:', err);
                        wrapper.innerHTML = `<p style="color:red; font-weight:bold;">[Diagram Rasterization Error]</p>`;
                    }
                }
            }
        }

        // Search for all rendered MathJax block formulas and rasterize them to 3x PNG images for Google Docs
        const mathBlockWrappers = offlineRoot.querySelectorAll('.math-block-container');
        for (const wrapper of mathBlockWrappers) {
            const liveId = wrapper.getAttribute('data-id');
            const liveSvgElement = previewContent.querySelector(`[data-id="${liveId}"] svg`);
            const rawCode = wrapper.querySelector('.math-code-raw')?.textContent || 'Formula';
            const escapedAlt = rawCode.replace(/"/g, '&quot;');
            
            if (liveSvgElement) {
                try {
                    const { pngDataUrl, width, height } = await svgToPng(liveSvgElement, { transparent: false });
                    wrapper.outerHTML = `
                        <table class="gdoc-math-table" style="border-collapse: collapse; width: 100%; margin: 8pt 0; border: none;">
                            <tbody>
                                <tr>
                                    <td align="center" style="border: none; padding: 4pt 0; text-align: center; vertical-align: middle;">
                                        <p style="margin: 0pt; padding: 0pt; text-align: center;">
                                            <img class="rendered-math-block" src="${pngDataUrl}" width="${width}" height="${height}" alt="${escapedAlt}" style="display: block; margin: 0 auto; max-width: 100%; height: auto;" />
                                        </p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    `;
                } catch (err) {
                    console.error('Error rasterizing block math to PNG:', err);
                    wrapper.innerHTML = `<p style="color:red; font-weight:bold;">[Formula Rasterization Error]</p>`;
                }
            }
        }

        // Search for all rendered MathJax inline formulas and rasterize them to 3x PNG images
        const mathInlineWrappers = offlineRoot.querySelectorAll('.math-inline-container');
        for (const wrapper of mathInlineWrappers) {
            const liveId = wrapper.getAttribute('data-id');
            const liveSvgElement = previewContent.querySelector(`[data-id="${liveId}"] svg`);
            const rawCode = wrapper.querySelector('.math-code-raw')?.textContent || 'Equation';
            const escapedAlt = rawCode.replace(/"/g, '&quot;');
            
            if (liveSvgElement) {
                try {
                    const { pngDataUrl, width, height } = await svgToPng(liveSvgElement, { transparent: true, isInline: true });
                    
                    const prev = wrapper.previousSibling;
                    if (prev && prev.nodeType === Node.TEXT_NODE && /[ \t\r\n]+$/.test(prev.nodeValue)) {
                        prev.nodeValue = prev.nodeValue.replace(/[ \t\r\n]+$/, '\u00A0');
                    }
                    const next = wrapper.nextSibling;
                    if (next && next.nodeType === Node.TEXT_NODE && /^[ \t\r\n]+/.test(next.nodeValue)) {
                        next.nodeValue = next.nodeValue.replace(/^[ \t\r\n]+/, '\u00A0');
                    }

                    const img = document.createElement('img');
                    img.className = 'rendered-math-inline';
                    img.src = pngDataUrl;
                    img.width = width;
                    img.height = height;
                    img.alt = escapedAlt;
                    img.setAttribute('style', 'display: inline-block; vertical-align: middle; max-height: 1.45em; width: auto;');
                    wrapper.parentNode.replaceChild(img, wrapper);
                } catch (err) {
                    console.error('Error rasterizing inline math to PNG:', err);
                }
            }
        }

        // Bundle elements into clean HTML structure and compact it
        const finalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${offlineRoot.innerHTML}</body></html>`;
        
        // Remove line breaks and shrink spaces
        let cleanHtml = finalHtml
            .replace(/\r?\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Safely remove spaces between block-level tags where whitespace is interpreted as tabs/newlines by Google Docs
        const blockTags = ['table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'div', 'h1', 'h2', 'h3', 'h4', 'blockquote'];
        blockTags.forEach(tag => {
            const closingReg = new RegExp(`</${tag}>\\s+<`, 'gi');
            const openingReg = new RegExp(`>\\s+<${tag}\\b`, 'gi');
            cleanHtml = cleanHtml
                .replace(closingReg, `</${tag}><`)
                .replace(openingReg, `><${tag}`);
        });

        // Create standard HTML and Text elements for Clipboard
        const plainText = markdownInput.value;
        const clipboardItems = {
            'text/html': new Blob([cleanHtml], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' })
        };

        const clipboardData = [new ClipboardItem(clipboardItems)];
        await navigator.clipboard.write(clipboardData);
        
        showToast('Copied Successfully!', 'Paste (Ctrl+V) directly into Google Docs or Confluence.');
    } catch (e) {
        console.error('Clipboard copy error:', e);
        showToast('Copy Failed', 'Failed to write to system clipboard. Make sure permissions are enabled.', false);
    } finally {
        copyBtn.disabled = false;
        copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy for Google Doc / Confluence';
    }
});

// Handle Download PDF (triggers browser print interface with styled media query layout)
pdfBtn.addEventListener('click', () => {
    window.print();
});

// Run Initial Setup on Load (Restore saved draft from localStorage if available)
document.addEventListener('DOMContentLoaded', () => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    markdownInput.value = (savedDraft !== null && savedDraft.trim() !== '') ? savedDraft : sampleMarkdown;
    renderDocument();

    // Re-render when MathJax finishes loading if not already ready
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise.then(() => {
            renderDocument();
        });
    }
});
