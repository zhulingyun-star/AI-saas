// 设计源文件导出：PDF（每板一页）+ 逐板 PNG
const { chromium, executablePath } = require('./browser-runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');

const SRC = 'C:/Users/zhulingyun02/Desktop/光影云_设计源文件_新增页面_20261120.html';
const OUT_DIR = 'C:/Users/zhulingyun02/Desktop/光影云_设计稿_图片_20261120';
const OUT_PDF = 'C:/Users/zhulingyun02/Desktop/光影云_设计稿_20261120.pdf';

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-gpu'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(20000);
    await page.goto('file:///' + SRC.replace(/\\/g, '/'));
    await page.waitForSelector('.board');
    await page.evaluate(() => document.fonts && document.fonts.ready);

    // 1) 逐板 PNG（保留深色画布，白标题可读）
    const boards = page.locator('.board');
    const count = await boards.count();
    for (let i = 0; i < count; i++) {
      const board = boards.nth(i);
      const code = await board.locator('.board-title').evaluate(el => (el.textContent.match(/^([A-D]\d+)/) || [])[1] || String(i + 1).padStart(2, '0'));
      const name = await board.locator('.board-title').evaluate(el => el.textContent.replace(/\s+(NEW|CHANGED|待拍板)\s*$/i, '').replace(/^[A-D]\d+\s*·\s*/, '').replace(/[\\/:*?"<>|]/g, '').slice(0, 28).trim());
      await board.scrollIntoViewIfNeeded();
      await board.screenshot({ path: path.join(OUT_DIR, `${code}_${name}.png`) });
    }

    // 2) PDF：注入打印样式（白底、每板一页、A3 横版）
    await page.addStyleTag({ content: `
      @media print {
        body { background:#fff !important; padding:0 10mm; }
        .file-head h1, .section h2, .board-title { color:#111 !important; }
        .file-head p, .section p, .toc { color:#444 !important; }
        .annotations { color:#555 !important; }
        .annotations b { color:#9a5b00 !important; }
        .annotations code, .file-head code { background:#f2eadf !important; color:#9a5b00 !important; }
        .board { display:block !important; page-break-after:always; margin:0 0 8mm; }
        .frame { box-shadow:none !important; border:1px solid #ddd; }
        .section { page-break-before:always; margin-top:0; }
        .toc { columns:2; }
      }
      @page { size:A3 landscape; margin:8mm; }
    `});
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: OUT_PDF, printBackground: true, preferCSSPageSize: true });
    console.log(JSON.stringify({ boards: count, pdf: OUT_PDF, dir: OUT_DIR }));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error('export 失败:', error.message); process.exitCode = 1; });
