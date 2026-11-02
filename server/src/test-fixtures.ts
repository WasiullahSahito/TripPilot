/** A tiny but well-formed PDF (it ends with %%EOF like every real one), for upload tests. */
export const tinyPdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1')
