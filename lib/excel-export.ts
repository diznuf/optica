type ExcelCellValue = string | number | Date | null | undefined;

export type ExcelMetaItem = {
  label: string;
  value: ExcelCellValue;
};

export type ExcelTable = {
  title: string;
  columns: string[];
  rows: ExcelCellValue[][];
};

export type ExcelDocument = {
  title: string;
  subtitle?: string;
  generatedAt?: Date;
  meta?: ExcelMetaItem[];
  tables: ExcelTable[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function formatCell(value: ExcelCellValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    const isMidnightUtc =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    return isMidnightUtc ? formatDate(value) : formatDateTime(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "";
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  const maybeFormula = value.trimStart();
  if (maybeFormula && /^[=+\-@]/.test(maybeFormula)) {
    return `'${value}`;
  }

  return value;
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned || "export";
}

export function buildExcelHtml(document: ExcelDocument): string {
  const generatedAt = document.generatedAt ?? new Date();
  const metaRows =
    document.meta && document.meta.length
      ? document.meta
          .map((item) => `<tr><td class="meta-label">${escapeHtml(item.label)}</td><td>${escapeHtml(formatCell(item.value))}</td></tr>`)
          .join("")
      : "";

  const tablesHtml = document.tables
    .map((table) => {
      const headerHtml = table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
      const rowsHtml = table.rows.length
        ? table.rows
            .map((row) => {
              const cells = table.columns.map((_, index) => {
                const raw = formatCell(row[index]);
                const isNumeric = typeof row[index] === "number" && Number.isFinite(row[index] as number);
                const className = isNumeric ? "num" : "";
                return `<td class="${className}">${escapeHtml(raw)}</td>`;
              });
              return `<tr>${cells.join("")}</tr>`;
            })
            .join("")
        : `<tr><td colspan="${table.columns.length}" class="empty">Aucune donnee</td></tr>`;

      return `
        <section>
          <h2>${escapeHtml(table.title)}</h2>
          <table>
            <thead>
              <tr>${headerHtml}</tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </section>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Calibri, Arial, sans-serif; margin: 20px; color: #1f2937; }
      h1 { margin: 0 0 4px; font-size: 22px; }
      .subtitle { margin: 0 0 16px; color: #4b5563; }
      .meta { border-collapse: collapse; margin: 0 0 18px; min-width: 360px; }
      .meta td { border: 1px solid #d1d5db; padding: 6px 8px; }
      .meta .meta-label { background: #f3f4f6; font-weight: 600; width: 180px; }
      section { margin-top: 20px; }
      h2 { margin: 0 0 8px; font-size: 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 12px; }
      th { background: #eef2f7; font-weight: 700; text-align: left; }
      td.num { text-align: right; }
      .empty { color: #6b7280; text-align: center; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(document.title)}</h1>
    ${document.subtitle ? `<p class="subtitle">${escapeHtml(document.subtitle)}</p>` : ""}
    <table class="meta">
      <tbody>
        <tr>
          <td class="meta-label">Genere le</td>
          <td>${escapeHtml(formatDateTime(generatedAt))}</td>
        </tr>
        ${metaRows}
      </tbody>
    </table>
    ${tablesHtml}
  </body>
</html>
`.trim();
}

export function buildExcelResponse(filename: string, document: ExcelDocument): Response {
  const safeFilename = sanitizeFilename(filename).replace(/\.xls$/i, "");
  const html = buildExcelHtml(document);
  return new Response(`\uFEFF${html}`, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename}.xls"`,
      "Cache-Control": "no-store"
    }
  });
}
