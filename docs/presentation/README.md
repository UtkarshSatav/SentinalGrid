# Presentation Assets

## Files
- `slides.md` — 12-slide deck in Marp format
- `handout.md` — one-page printable summary for the viva
- `../diagrams/*.md` — 4 Mermaid diagrams (architecture, data flow, CI/CD, DR)

## Render slides

The deck is **Marp**-formatted Markdown. Render with:

```bash
# Install once
npm install -g @marp-team/marp-cli

# Export to PDF (best for sharing/submitting)
marp slides.md --pdf --allow-local-files

# Export to PowerPoint
marp slides.md --pptx --allow-local-files

# Export to standalone HTML
marp slides.md --html --allow-local-files

# Live preview during edits
marp slides.md --watch --preview
```

VSCode users: install the **"Marp for VS Code"** extension — gives a live preview pane.

## Render diagrams (optional — they preview natively on GitHub/VSCode)

Diagrams are **Mermaid**. To convert to PNG/SVG for embedding in slides:

```bash
# Install once
npm install -g @mermaid-js/mermaid-cli

# Render each diagram (extracts the mermaid block from the markdown)
for f in ../diagrams/*.md; do
  mmdc -i "$f" -o "${f%.md}.svg" -t dark -b transparent
done
```

The slide deck references `../diagrams/architecture-overview.svg` — generate it
first if you want that image to appear in slide 3.

## Print the handout

```bash
# Markdown → PDF
marp handout.md --pdf
# or use any markdown viewer / pandoc
pandoc handout.md -o handout.pdf
```

Or just print directly from VSCode / Typora / Obsidian preview.

## Suggested viva flow (10–12 min)

| Time | Slide | Talk track |
|---|---|---|
| 0:00 | 1 | Title — say "national cyber defense, multi-region, fully automated" |
| 0:30 | 2 | The problem: scale + adversaries + audit requirements |
| 1:30 | 3 | Solution overview — point at the requirement→tool table |
| 2:30 | 4 | Architecture (open the diagram) — emphasise warm-standby choice |
| 4:00 | 5 | Microservices + data flow — durability boundary at Kafka |
| 5:30 | 6 | Terraform layout — show modules + envs |
| 6:30 | 7 | CI/CD pipeline — emphasise the 3 independent gates |
| 7:30 | 8 | Monitoring — SLO burn-rate strategy, every alert has a runbook |
| 8:30 | 9 | Security — Vault dynamic creds story |
| 9:30 | 10 | DR — RPO/RTO with proof (replication metrics) |
| 10:30 | 11 | Final-eval scenarios — one defense per row |
| 11:30 | 12 | Deliverables map → take questions |
