const pptxgen = require('pptxgenjs');
const path = require('path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa');
const { applyTheme } = require('/mnt/skills/public/pptx/scripts/apply_theme.js');

const THEME = {
  name: 'IE Bao cao may',
  headFontFace: 'Calibri',
  bodyFontFace: 'Calibri',
  colors: { dk1: '1B2430', lt1: 'FFFFFF', dk2: '17324D', lt2: 'F3F6FA', accent1: '1F6FEB', accent2: 'E8A317', accent3: '2E8B57',
            accent4: 'C4202B', accent5: '0B7A75', accent6: '6B7A90', hlink: '1F6FEB', folHlink: '6B7A90' }
};
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';                    // 10 x 5.625 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = 'IE Báo cáo máy - Hướng dẫn sử dụng';
pres.author = 'IE';
const C = pres.SchemeColor;
// tints and the colours used by the tool's own screens (mock-ups)
const MUTED = '5B6878', LINE = 'D9DEE5', T_BLUE = 'E6F0FF', T_GREEN = 'E7F6EC', T_AMBER = 'FFF3D6', T_RED = 'FDE8E8', T_TEAL = 'E3F4F3', SEL = 'EAF1FF';
const OK = '15803D', WARN = '8A5A00', BAD = 'C4202B', INFO = '0B5CAD';
const W = 10;

// ---------- layouts ----------
const tagPh = (color) => ({ placeholder: { options: { name: 'tag', type: 'body', x: 0.5, y: 0.2, w: 6, h: 0.25, fontSize: 10, bold: true, color, margin: 0, charSpacing: 2 }, text: '' } });
pres.defineSlideMaster({
  title: 'CONTENT', background: { color: C.background1 }, margin: [0.5, 0.5, 0.5, 0.5],
  objects: [
    tagPh(C.accent1),
    { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.45, w: 9, h: 0.75, fontSize: 30, bold: true, color: C.text2, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
    { text: { text: 'IE Báo cáo máy · Hướng dẫn sử dụng', options: { x: 0.5, y: 5.3, w: 6, h: 0.22, fontSize: 10, color: MUTED, margin: 0 } } },
  ],
  slideNumber: { x: 9.0, y: 5.3, w: 0.5, h: 0.22, color: MUTED, fontSize: 10, align: 'right' },
});
pres.defineSlideMaster({
  title: 'TITLE', background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.3, w: 5.5, h: 1.25, fontSize: 44, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'sub', type: 'body', x: 0.6, y: 2.7, w: 5.5, h: 0.95, fontSize: 20, color: 'CADCFC', valign: 'top', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'meta', type: 'body', x: 0.6, y: 4.6, w: 5.5, h: 0.45, fontSize: 12, color: 'AFC2D8', valign: 'top', margin: 0 }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'DARK', background: { color: C.text2 }, margin: [0.5, 0.5, 0.5, 0.5],
  objects: [
    tagPh('CADCFC'),
    { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.45, w: 9, h: 0.75, fontSize: 30, bold: true, color: C.background1, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
    { text: { text: 'IE Báo cáo máy · Hướng dẫn sử dụng', options: { x: 0.5, y: 5.3, w: 6, h: 0.22, fontSize: 10, color: 'AFC2D8', margin: 0 } } },
  ],
  slideNumber: { x: 9.0, y: 5.3, w: 0.5, h: 0.22, color: 'AFC2D8', fontSize: 10, align: 'right' },
});

// ---------- helpers ----------
const shadow = () => ({ type: 'outer', color: '000000', opacity: 0.12, blur: 6, offset: 2, angle: 90 });
async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}
function txt(s, text, o) { s.addText(text, Object.assign({ isTextBox: true, margin: 0, valign: 'top', color: C.text1, fontSize: 14 }, o)); }
function card(s, x, y, w, h, o = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, Object.assign({ x, y, w, h, rectRadius: 0.08, fill: { color: C.background1 }, line: { color: LINE, width: 0.75 }, shadow: shadow() }, o));
}
function box(s, x, y, w, h, fill, o = {}) { s.addShape(pres.shapes.ROUNDED_RECTANGLE, Object.assign({ x, y, w, h, rectRadius: 0.06, fill: { color: fill }, line: { color: fill, width: 0.5 } }, o)); }
function num(s, n, x, y, d, color, o = {}) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { color }, objectName: 'Số ' + n });
  s.addText(String(n), { x, y, w: d, h: d, align: 'center', valign: 'middle', margin: 0, bold: true, color: C.background1, fontSize: o.fontSize || 14, isTextBox: true });
}
async function iconCircle(s, Comp, x, y, d, bg, fg) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg } });
  const k = d * 0.5;
  s.addImage({ data: await icon(Comp, fg), x: x + (d - k) / 2, y: y + (d - k) / 2, w: k, h: k, altText: '' });
}
function chip(s, text, x, y, w, h, fill, color, o = {}) {
  box(s, x, y, w, h, fill);
  s.addText(text, Object.assign({ x, y, w, h, align: 'center', valign: 'middle', margin: 0, fontSize: 11, color, isTextBox: true }, o));
}
function notes(s, t) { s.addNotes(t); }
let secOpen = {};
function slide(master, section, tag) {
  if (!secOpen[section]) { pres.addSection({ title: section }); secOpen[section] = 1; }
  const s = pres.addSlide({ masterName: master, sectionTitle: section });
  if (tag) s.addText(tag, { placeholder: 'tag' });
  return s;
}

(async () => {
  const I = {};
  const need = { db: fa.FaDatabase, chart: fa.FaChartLine, swap: fa.FaExchangeAlt, check: fa.FaCheckCircle, folder: fa.FaFolderOpen, xls: fa.FaFileExcel, sync: fa.FaSyncAlt,
    lock: fa.FaLock, send: fa.FaPaperPlane, bell: fa.FaBell, tick: fa.FaCheck, x: fa.FaTimes, pen: fa.FaPen, user: fa.FaUserCog, tools: fa.FaTools, info: fa.FaInfoCircle, arrow: fa.FaChevronRight };
  const cols = { w: 'FFFFFF', b: '1F6FEB', g: '2E8B57', t: '0B7A75', a: '8A5A00', d: '17324D', r: 'C4202B', m: '5B6878' };
  for (const k of Object.keys(need)) for (const c of Object.keys(cols)) I[k + '_' + c] = await icon(need[k], cols[c]);

  // ===== 1. Title =====
  {
    const s = slide('TITLE', 'Giới thiệu');
    s.addText('IE Báo cáo máy', { placeholder: 'title' });
    s.addText([{ text: 'Hướng dẫn sử dụng', options: { breakLine: true } }, { text: 'Phiên bản v7.7 (cập nhật v7.5–v7.7 so với v7.4)', options: { fontSize: 14, color: 'AFC2D8' } }], { placeholder: 'sub' });
    s.addText('Chrome hoặc Edge · chạy không cần mạng · dữ liệu chỉ đọc trên máy', { placeholder: 'meta' });
    // motif: the by-day grid of the tool
    const gx = 6.55, gy = 1.35, cs = 0.52, gap = 0.08;
    const rows = [['6', '6', '6', '6', ''], ['', '3', '3', '3', ''], ['', '', '', '', '8'], ['6', '9', '9', '9', '8']];
    const kind = [['n', 'n', 'n', 'n', 'e'], ['e', 'p', 'p', 'p', 'e'], ['e', 'e', 'e', 'e', 'n'], ['t', 't', 't', 't', 't']];
    rows.forEach((r, i) => r.forEach((v, j) => {
      const k = kind[i][j]; if (k === 'e') return;
      const fill = k === 'p' ? C.accent2 : (k === 't' ? '2A4A6E' : '27476B');
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: gx + j * (cs + gap), y: gy + i * (cs + gap), w: cs, h: cs, rectRadius: 0.06, fill: { color: fill }, line: { color: fill }, objectName: 'Ô lưới' });
      s.addText(v, { x: gx + j * (cs + gap), y: gy + i * (cs + gap), w: cs, h: cs, align: 'center', valign: 'middle', margin: 0, bold: true, fontSize: 16, color: k === 'p' ? C.text2 : C.background1, isTextBox: true });
    }));
    txt(s, 'Sản xuất + chuẩn bị theo ngày', { x: gx, y: 3.78, w: 3.0, h: 0.3, fontSize: 12, color: 'AFC2D8' });
    notes(s, 'Giới thiệu công cụ IE Báo cáo máy: một file HTML dùng cho hai vai trò, IE Báo cáo máy và IE Tech.');
  }

  // ===== 2. Công cụ làm gì =====
  {
    const s = slide('CONTENT', 'Giới thiệu', 'GIỚI THIỆU');
    s.addText('Công cụ này làm gì', { placeholder: 'title' });
    const items = [
      [fa.FaDatabase, C.accent1, 'Cập nhật CSDL máy', 'Quét layout, đối chiếu MACHINE DATABASE, duyệt từng thay đổi và lưu.'],
      [fa.FaChartLine, C.accent4, 'Phát hiện thiếu máy', 'So nhu cầu theo ngày với máy có sẵn của từng loại máy.'],
      [fa.FaExchangeAlt, C.accent5, 'Chuẩn bị máy', 'Tính máy chuẩn bị khi đổi mã hàng; IE Tech duyệt, chỉnh hoặc bỏ.'],
    ];
    for (let i = 0; i < 3; i++) {
      const x = 0.5 + i * 3.1, [Comp, col, h, d] = items[i];
      card(s, x, 1.4, 2.8, 2.55, { objectName: 'Thẻ ' + (i + 1) });
      s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 1.65, w: 0.6, h: 0.6, fill: { color: col }, line: { color: col } });
      s.addImage({ data: await icon(Comp, 'FFFFFF'), x: x + 0.40, y: 1.80, w: 0.3, h: 0.3, altText: h });
      txt(s, h, { x: x + 0.25, y: 2.4, w: 2.3, h: 0.35, fontSize: 16, bold: true, color: C.text2 });
      txt(s, d, { x: x + 0.25, y: 2.8, w: 2.3, h: 1.05 });
    }
    box(s, 0.5, 4.15, 4.4, 0.7, T_BLUE); box(s, 5.1, 4.15, 4.4, 0.7, T_TEAL);
    txt(s, [{ text: 'IE Báo cáo máy: ', options: { bold: true, color: INFO } }, { text: 'nạp dữ liệu, cập nhật CSDL, gửi và nhận kết quả' }], { x: 0.65, y: 4.2, w: 4.1, h: 0.6, valign: 'middle' });
    txt(s, [{ text: 'IE Tech: ', options: { bold: true, color: C.accent5 } }, { text: 'duyệt chuẩn bị máy của PU mình' }], { x: 5.25, y: 4.2, w: 4.1, h: 0.6, valign: 'middle' });
    txt(s, 'Nhân viên IE vẫn kiểm tra và lưu Đạt trong Layout Check; công cụ này không thay bước đó.', { x: 0.5, y: 4.95, w: 9, h: 0.25, fontSize: 11, color: MUTED });
    notes(s, 'Ba việc chính của công cụ. Hai vai trò dùng chung một file HTML, chọn vai trò ở góc trên bên phải.');
  }

  // ===== 3. Quy trình hàng tuần =====
  {
    const s = slide('CONTENT', 'Giới thiệu', 'GIỚI THIỆU');
    s.addText('Quy trình hàng tuần', { placeholder: 'title' });
    const st = [
      ['Nạp dữ liệu', 'IE Báo cáo máy', 'Kết nối lại, chọn kế hoạch mới.'],
      ['Cập nhật CSDL', 'IE Báo cáo máy', 'Quét layout, duyệt, lưu, dán Table1.'],
      ['Tìm loại máy thiếu', 'IE Báo cáo máy', 'Chọn nhóm máy, mở bảng theo ngày.'],
      ['Gửi IE Tech', 'IE Báo cáo máy', 'Gửi đề xuất chuẩn bị theo PU.'],
      ['IE Tech duyệt', 'IE Tech', 'Giữ, chỉnh, bỏ; báo sai lệch; hoàn tất.'],
      ['Chốt báo cáo', 'IE Báo cáo máy', 'Xử lý sai lệch, chốt, xuất Excel.'],
    ];
    for (let i = 0; i < 6; i++) {
      const col = i % 3, row = Math.floor(i / 3), x = 0.5 + col * 3.1, y = 1.4 + row * 1.7;
      const tech = st[i][1] === 'IE Tech', color = tech ? C.accent5 : C.accent1;
      card(s, x, y, 2.8, 1.5, { objectName: 'Bước ' + (i + 1) });
      num(s, i + 1, x + 0.2, y + 0.22, 0.42, color, { fontSize: 15 });
      txt(s, st[i][0], { x: x + 0.75, y: y + 0.2, w: 1.95, h: 0.3, fontSize: 15, bold: true, color: C.text2 });
      txt(s, st[i][1], { x: x + 0.75, y: y + 0.5, w: 1.95, h: 0.22, fontSize: 11, bold: true, color });
      txt(s, st[i][2], { x: x + 0.75, y: y + 0.78, w: 1.95, h: 0.62 });
    }
    s.addShape(pres.shapes.OVAL, { x: 0.5, y: 4.9, w: 0.16, h: 0.16, fill: { color: C.accent1 }, line: { color: C.accent1 } });
    txt(s, 'IE Báo cáo máy', { x: 0.75, y: 4.84, w: 1.5, h: 0.28, fontSize: 12, valign: 'middle' });
    s.addShape(pres.shapes.OVAL, { x: 2.35, y: 4.9, w: 0.16, h: 0.16, fill: { color: C.accent5 }, line: { color: C.accent5 } });
    txt(s, 'IE Tech', { x: 2.6, y: 4.84, w: 1.0, h: 0.28, fontSize: 12, valign: 'middle' });
    txt(s, 'Song song: Nhân viên IE kiểm tra Đạt trong Layout Check.', { x: 3.7, y: 4.84, w: 5.8, h: 0.28, fontSize: 12, color: MUTED, valign: 'middle' });
    notes(s, 'Sáu bước trong một tuần. Bước 5 do IE Tech thực hiện, các bước còn lại do IE Báo cáo máy.');
  }

  // ===== 4. Chuẩn bị trước khi dùng =====
  {
    const s = slide('CONTENT', 'Giới thiệu', 'GIỚI THIỆU');
    s.addText('Chuẩn bị trước khi dùng', { placeholder: 'title' });
    const rows = [
      'Chrome hoặc Edge (Firefox không dùng được).',
      'File IE_BaoCaoMay.html: chạy không cần mạng, file chỉ đọc trên máy.',
      'MC Report có sheet MACHINE DATABASE, MACHINE GROUP, MACHINE BY LINE, MC STATUS, PU LIST.',
      'Master plan (sheet MasterPlan-Full), mới mỗi tuần.',
      'Thư mục layout gốc và thư mục data dùng chung với Layout Check.',
    ];
    rows.forEach((r, i) => {
      const y = 1.4 + i * 0.7;
      s.addImage({ data: I.check_g, x: 0.5, y: y + 0.03, w: 0.28, h: 0.28, altText: '' });
      txt(s, r, { x: 0.95, y, w: 4.6, h: 0.62 });
    });
    card(s, 5.9, 1.4, 3.6, 3.1, { objectName: 'Mô phỏng vai trò' });
    txt(s, '1. Chọn vai trò', { x: 6.1, y: 1.55, w: 3.2, h: 0.3, bold: true, color: C.text2 });
    chip(s, 'IE Báo cáo máy', 6.1, 1.95, 1.45, 0.34, C.accent1, 'FFFFFF', { bold: true, fontSize: 12 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.65, y: 1.95, w: 0.95, h: 0.34, rectRadius: 0.06, fill: { color: C.background1 }, line: { color: LINE, width: 1 } });
    txt(s, 'IE Tech', { x: 7.65, y: 1.95, w: 0.95, h: 0.34, fontSize: 12, align: 'center', valign: 'middle' });
    chip(s, 'VI', 8.75, 1.95, 0.32, 0.34, C.accent1, 'FFFFFF', { bold: true, fontSize: 12 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.1, y: 1.95, w: 0.32, h: 0.34, rectRadius: 0.06, fill: { color: C.background1 }, line: { color: LINE, width: 1 } });
    txt(s, 'EN', { x: 9.1, y: 1.95, w: 0.32, h: 0.34, fontSize: 12, align: 'center', valign: 'middle' });
    txt(s, 'IE Tech chỉ thấy màn hình duyệt.', { x: 6.1, y: 2.4, w: 3.2, h: 0.3 });
    txt(s, '2. Các tab của IE Báo cáo máy', { x: 6.1, y: 2.9, w: 3.3, h: 0.3, bold: true, color: C.text2 });
    chip(s, 'Dữ liệu', 6.1, 3.3, 0.9, 0.34, SEL, C.accent1, { bold: true, fontSize: 12 });
    chip(s, 'Cập nhật CSDL', 7.1, 3.3, 1.4, 0.34, C.background2, MUTED, { bold: true, fontSize: 12 });
    chip(s, 'Thiếu máy & chuẩn bị', 6.1, 3.75, 1.95, 0.34, C.background2, MUTED, { bold: true, fontSize: 12 });
    chip(s, 'Báo sai lệch', 8.15, 3.75, 1.2, 0.34, C.background2, MUTED, { bold: true, fontSize: 12 });
    notes(s, 'Năm thứ cần có. Nhắc người dùng chọn vai trò ở góc trên bên phải trước khi làm việc.');
  }

  // ===== 5. Tab Dữ liệu =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · TAB DỮ LIỆU');
    s.addText('Tab Dữ liệu: nạp một lần', { placeholder: 'title' });
    const st = [['MC Report… (ghi nhớ)', 'Chọn MC Report một lần, lần sau tự nhớ.'], ['Thư mục layout… (ghi nhớ)', 'Thư mục gốc; quét cả thư mục con, bỏ Old layout.'],
      ['Thư mục data của Layout Check', 'Kết nối và nhập họ tên.'], ['Chọn file Excel…', 'Master plan mới mỗi tuần.']];
    st.forEach((r, i) => {
      const y = 1.4 + i * 0.88;
      num(s, i + 1, 0.5, y + 0.05, 0.4, C.accent1);
      txt(s, [{ text: r[0], options: { bold: true, color: C.text2, breakLine: true } }, { text: r[1] }], { x: 1.1, y, w: 4.4, h: 0.8 });
    });
    card(s, 5.8, 1.4, 3.7, 3.45, { objectName: 'Mô phỏng tab Dữ liệu' });
    box(s, 5.95, 1.55, 3.4, 0.45, T_BLUE);
    txt(s, 'Đã ghi nhớ', { x: 6.05, y: 1.55, w: 1.2, h: 0.45, fontSize: 12, bold: true, color: INFO, valign: 'middle' });
    box(s, 7.65, 1.62, 1.6, 0.31, C.accent1);
    s.addImage({ data: I.sync_w, x: 7.74, y: 1.7, w: 0.15, h: 0.15, altText: '' });
    txt(s, 'Kết nối lại', { x: 7.95, y: 1.62, w: 1.25, h: 0.31, fontSize: 12, bold: true, color: 'FFFFFF', valign: 'middle' });
    const slots = [['MC Report', '1435 mã hàng'], ['Master plan', '806 mã hàng'], ['Thư mục layout', '2 file layout'], ['Layout Check', 'Đã kết nối']];
    slots.forEach((r, i) => {
      const y = 2.15 + i * 0.5;
      txt(s, r[0], { x: 6.0, y, w: 1.3, h: 0.4, fontSize: 12, bold: true, valign: 'middle' });
      txt(s, '✓ ' + r[1], { x: 7.3, y, w: 2.1, h: 0.4, fontSize: 12, color: OK, valign: 'middle' });
    });
    box(s, 5.95, 4.2, 3.4, 0.5, T_AMBER);
    txt(s, 'Lần sau: bấm Kết nối lại, chỉ chọn lại Master plan.', { x: 6.05, y: 4.2, w: 3.2, h: 0.5, fontSize: 14, valign: 'middle', color: '5E4300' });
    notes(s, 'Tab đầu tiên. MC Report, thư mục layout và thư mục data được trình duyệt ghi nhớ; mỗi tuần chỉ cần chọn lại Master plan.');
  }

  // ===== 6. Quét layout =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · CẬP NHẬT CSDL');
    s.addText('Cập nhật CSDL: quét layout', { placeholder: 'title' });
    const lad = [['Layout', 'Bulk trước Initial, rồi OBD cao hơn, rồi file mới hơn.', C.accent3], ['Costing', 'Khi chưa có layout và chưa có dữ liệu. Hệ số 48 cho mã 48HC, còn lại 24.', C.accent1],
      ['Dữ liệu nhập tay', 'IETL, SMS, PDF, tt, E: bị khóa, chỉ thay khi bạn chọn.', C.accent6]];
    lad.forEach((r, i) => {
      const y = 1.4 + i * 1.2;
      card(s, 0.5, y, 4.8, 1.05, { objectName: 'Ưu tiên ' + (i + 1) });
      num(s, i + 1, 0.7, y + 0.3, 0.45, r[2], { fontSize: 16 });
      txt(s, [{ text: r[0], options: { bold: true, color: C.text2, fontSize: 16, breakLine: true } }, { text: r[1] }], { x: 1.35, y: y + 0.12, w: 3.8, h: 0.85, valign: 'middle' });
    });
    txt(s, 'Công cụ tự xử lý', { x: 5.7, y: 1.4, w: 3.8, h: 0.3, bold: true, color: C.text2, fontSize: 16 });
    const auto = ['Mã hàng ghép: 3801.3802, 00115_116', 'Mã đặc biệt SP…, S27… giữ nguyên', 'Bỏ sheet ẩn và sheet F T S C', 'Biến thể 48HC, 16HC, ln', 'So sánh theo nhóm máy'];
    auto.forEach((r, i) => { const y = 1.82 + i * 0.46; s.addImage({ data: I.check_g, x: 5.7, y: y + 0.04, w: 0.24, h: 0.24, altText: '' }); txt(s, r, { x: 6.05, y, w: 3.45, h: 0.4 }); });
    box(s, 5.7, 4.25, 3.8, 0.6, T_BLUE);
    txt(s, 'Bấm Bắt đầu và chờ thanh tiến độ chạy xong.', { x: 5.85, y: 4.25, w: 3.5, h: 0.6, valign: 'middle', color: C.text2 });
    notes(s, 'Thứ tự ưu tiên nguồn dữ liệu: layout, costing, dữ liệu nhập tay. Nhóm máy là khóa so sánh.');
  }

  // ===== 7. Sáu mục =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · CẬP NHẬT CSDL');
    s.addText('Sáu mục trong tab Cập nhật CSDL', { placeholder: 'title' });
    const v = [['Cần duyệt', C.accent1, 'Mã hàng có dữ liệu mới hoặc khác CSDL. Tick rồi lưu.'], ['Còn thiếu dữ liệu', C.accent4, 'Có trong kế hoạch nhưng chưa có layout, costing, CSDL.'],
      ['Lỗi dữ liệu', C.accent2, 'Cần sửa tại nguồn; dòng dán trùng có thể sửa tại đây.'], ['Không thay đổi', C.accent3, 'Layout khớp CSDL, không cần làm gì.'],
      ['Đã kiểm tra', C.accent5, 'IE đã lưu Đạt trong Layout Check, layout không đổi, CSDL khớp.'], ['Nhật ký quét', C.accent6, 'Kết quả từng file: lỗi, thay đổi, bỏ qua.']];
    v.forEach((r, i) => {
      const x = 0.5 + (i % 3) * 3.1, y = 1.4 + Math.floor(i / 3) * 1.8;
      card(s, x, y, 2.8, 1.6, { objectName: 'Mục ' + r[0] });
      s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: y + 0.2, w: 0.2, h: 0.2, fill: { color: r[1] }, line: { color: r[1] } });
      txt(s, r[0], { x: x + 0.5, y: y + 0.12, w: 2.2, h: 0.4, fontSize: 15, bold: true, color: C.text2, valign: 'middle' });
      txt(s, r[2], { x: x + 0.2, y: y + 0.6, w: 2.45, h: 0.9 });
    });
    notes(s, 'Sáu mục tóm tắt kết quả quét. Dấu tick chỉ có ở mục Cần duyệt.');
  }

  // ===== 8. Đọc một dòng cần duyệt =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · CẬP NHẬT CSDL');
    s.addText('Đọc một dòng cần duyệt', { placeholder: 'title' });
    const cx = [0.5, 2.8, 4.2, 7.2], cw = [2.3, 1.4, 3.0, 2.3];
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.35, w: 9, h: 0.34, fill: { color: C.background2 }, line: { color: LINE, width: 0.75 } });
    ['Mã hàng', 'Vào chuyền', 'Nguồn dữ liệu', 'Máy (mới so với hiện tại)'].forEach((h, i) => txt(s, h, { x: cx[i] + 0.1, y: 1.35, w: cw[i] - 0.5, h: 0.34, fontSize: 11, bold: true, color: MUTED, valign: 'middle' }));
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.69, w: 9, h: 1.3, fill: { color: C.background1 }, line: { color: LINE, width: 0.75 } });
    txt(s, 'VSS25-00612-3801(XX)48HC', { x: 0.6, y: 1.78, w: 2.2, h: 0.28, fontSize: 12, bold: true });
    chip(s, 'Costing → Layout', 0.6, 2.15, 1.45, 0.27, T_BLUE, INFO);
    txt(s, '20/11/26', { x: 2.9, y: 1.78, w: 1.2, h: 0.28, fontSize: 12, bold: true });
    txt(s, 'D41, D64', { x: 2.9, y: 2.05, w: 1.2, h: 0.25, fontSize: 11, color: MUTED });
    s.addShape(pres.shapes.RECTANGLE, { x: 4.3, y: 1.78, w: 2.8, h: 0.3, fill: { color: C.background1 }, line: { color: '9AA6B5', width: 0.75 } });
    txt(s, '…3801_3802_3803.xlsx · Bulk · OBD 9  ▾', { x: 4.36, y: 1.78, w: 2.7, h: 0.3, fontSize: 11, valign: 'middle' });
    txt(s, 'sửa 06/11/2026 14:20', { x: 4.3, y: 2.1, w: 2.8, h: 0.22, fontSize: 10, color: MUTED });
    [['Man-Machine-Prep (7 máy)', 2.37], ['Man-Machine-Ass (3 máy)', 2.65]].forEach(([t, y]) => {
      s.addShape(pres.shapes.RECTANGLE, { x: 4.3, y: y + 0.03, w: 0.16, h: 0.16, fill: { color: C.accent1 }, line: { color: C.accent1 } });
      s.addImage({ data: I.tick_w, x: 4.325, y: y + 0.055, w: 0.11, h: 0.11, altText: '' });
      txt(s, t, { x: 4.55, y, w: 2.5, h: 0.22, fontSize: 10 });
    });
    chip(s, '+1SLN 6', 7.3, 1.78, 0.8, 0.28, T_GREEN, OK); chip(s, '1SLM 10→12', 8.2, 1.78, 1.1, 0.28, T_AMBER, WARN, { bold: true });
    chip(s, 'BT1M 5→6', 7.3, 2.15, 1.0, 0.28, T_AMBER, WARN, { bold: true }); chip(s, '4OLM 3', 8.4, 2.15, 0.8, 0.28, T_RED, BAD, { strike: true });
    [0.5 + 1.9, 2.8 + 1.0, 4.2 + 2.65, 9.5 - 0.35].forEach((x, i) => num(s, i + 1, x, 1.38, 0.28, C.accent2, { fontSize: 11 }));
    const ex = [['Lý do', 'Mới, Layout thay đổi, Costing → Layout, Dữ liệu nhập tay.'], ['Ngày vào chuyền', 'Ngày sớm nhất theo kế hoạch, kèm chuyền. Duyệt mã gấp trước.'],
      ['Nguồn dữ liệu', 'Đổi file, chọn costing hoặc giữ hiện tại. Tick sheet cần cộng; có ngày sửa file.'], ['Máy', 'Xanh: thêm. Vàng: đổi số lượng. Đỏ gạch: bỏ.']];
    ex.forEach((r, i) => {
      const x = 0.5 + i * 2.3;
      num(s, i + 1, x, 3.3, 0.3, C.accent2, { fontSize: 12 });
      txt(s, r[0], { x: x + 0.4, y: 3.3, w: 1.75, h: 0.3, bold: true, color: C.text2, valign: 'middle' });
      txt(s, r[1], { x, y: 3.7, w: 2.1, h: 1.3 });
    });
    notes(s, 'Mỗi dòng có bốn phần cần đọc: lý do, ngày vào chuyền, nguồn dữ liệu và thay đổi máy.');
  }

  // ===== 9. Lưu và đưa vào MC Report =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · CẬP NHẬT CSDL');
    s.addText('Lưu và đưa vào MC Report', { placeholder: 'title' });
    const st = [['Tick', 'Đánh dấu dòng đồng ý, hoặc Duyệt tất cả mục đang hiển thị.'], ['Lưu', 'Bấm Lưu MACHINE DATABASE ở thanh dưới cùng.'], ['Dán', 'Dán sheet MACHINE DATABASE vào Table1, thay toàn bộ.'], ['Làm mới', 'Refresh All trong MC Report.']];
    for (let i = 0; i < 4; i++) {
      const x = 0.5 + i * 2.3;
      card(s, x, 1.4, 2.1, 1.75, { objectName: 'Bước ' + (i + 1) });
      num(s, i + 1, x + 0.18, 1.55, 0.4, C.accent1);
      txt(s, st[i][0], { x: x + 0.7, y: 1.55, w: 1.3, h: 0.4, fontSize: 16, bold: true, color: C.text2, valign: 'middle' });
      txt(s, st[i][1], { x: x + 0.18, y: 2.1, w: 1.8, h: 1.0 });
      if (i < 3) s.addImage({ data: I.arrow_m, x: x + 2.12, y: 2.15, w: 0.14, h: 0.14, altText: '' });
    }
    txt(s, 'File lưu gồm 6 sheet', { x: 0.5, y: 3.4, w: 5.2, h: 0.3, bold: true, color: C.text2 });
    const sh = ['MACHINE DATABASE', 'CHANGES', 'EXCEPTIONS', 'LAYOUT DATA', 'NEW CHANGED', 'SCAN STATE'];
    sh.forEach((n, i) => chip(s, n, 0.5 + (i % 3) * 1.75, 3.8 + Math.floor(i / 3) * 0.45, 1.65, 0.34, i === 0 ? SEL : C.background2, i === 0 ? INFO : MUTED, { bold: true, fontSize: 11 }));
    box(s, 5.95, 3.4, 3.55, 1.15, T_AMBER);
    s.addImage({ data: I.info_a, x: 6.1, y: 3.55, w: 0.28, h: 0.28, altText: '' });
    txt(s, 'Ghi chú Đã duyệt được gửi sang Layout Check, nhưng mã hàng chỉ hoàn tất khi Nhân viên IE lưu Đạt.', { x: 6.5, y: 3.5, w: 2.85, h: 0.95, color: '5E4300' });
    notes(s, 'Sau khi lưu phải dán vào Table1 và Refresh All thì báo cáo mới dùng dữ liệu mới.');
  }

  // ===== 10. Chọn loại máy =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · THIẾU MÁY & CHUẨN BỊ');
    s.addText('Chọn loại máy có nguy cơ thiếu', { placeholder: 'title' });
    const st = ['Đặt khoảng xem: Từ ngày, Số tuần, Cộng chung 10%.', 'Đọc bảng xếp hạng: Còn lại thấp nhất âm là có nguy cơ thiếu.', 'Tick nhóm máy, nhập Tỷ lệ % và Số ngày chuẩn bị.', 'Bấm Mở chi tiết các nhóm đã chọn.'];
    st.forEach((r, i) => { const y = 1.4 + i * 0.86; num(s, i + 1, 0.5, y + 0.03, 0.36, C.accent1, { fontSize: 13 }); txt(s, r, { x: 1.0, y, w: 2.55, h: 0.8 }); });
    const H = (t) => ({ text: t, options: { bold: true, fill: { color: C.background2 }, color: MUTED, fontSize: 11 } });
    const R = (a, b, c, d, e, f, sel) => [a, b, c, d, e, f].map((t, i) => ({ text: t, options: { fontSize: 12, bold: i === 1 || (i === 4), color: i === 4 ? BAD : C.text1, align: i === 1 ? 'left' : 'center', fill: { color: sel ? SEL : C.background1 } } }));
    s.addTable([[H('Chọn'), H('Nhóm máy'), H('Máy có sẵn'), H('Nhu cầu cao nhất'), H('Còn lại thấp nhất'), H('Tỷ lệ %')].map((c, i) => { c.options.align = i === 1 ? 'left' : 'center'; return c; }),
      R('', '1CHM', '18', '70', '−52', '', false), R('✓', 'BT1M', '1462', '1514', '−52', '50', true), R('', 'OLFH', '82', '106', '−24', '', false), R('', 'ZZF', '325', '332', '−7', '', false)],
      { x: 3.9, y: 1.4, w: 5.6, colW: [0.55, 1.0, 1.0, 1.25, 1.1, 0.7], rowH: [0.42, 0.38, 0.38, 0.38, 0.38], border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0, 0.05, 0, 0.05], objectName: 'Bảng xếp hạng (ví dụ)' });
    txt(s, 'Số liệu minh họa', { x: 3.9, y: 3.4, w: 3, h: 0.22, fontSize: 10, color: MUTED });
    box(s, 3.9, 3.75, 2.75, 1.1, T_BLUE); box(s, 6.75, 3.75, 2.75, 1.1, T_BLUE);
    txt(s, 'Máy có sẵn lấy từ cột MC used for PDN của MC STATUS.', { x: 4.05, y: 3.8, w: 2.45, h: 1.0, valign: 'middle', color: C.text2 });
    txt(s, 'Mặc định chỉ hiện nhóm có thể thiếu; tick Hiện tất cả nhóm để xem hết.', { x: 6.9, y: 3.8, w: 2.45, h: 1.0, valign: 'middle', color: C.text2 });
    notes(s, 'Chỉ nhóm máy được tick mới tính chuẩn bị. Tỷ lệ mặc định: BT1M 50%, các nhóm khác 0%.');
  }

  // ===== 11. Bảng chi tiết theo ngày =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · THIẾU MÁY & CHUẨN BỊ');
    s.addText('Đọc bảng chi tiết theo ngày', { placeholder: 'title' });
    const days = ['T2 16/11', 'T3 17/11', 'T4 18/11', 'T5 19/11', 'T6 20/11', 'T7 21/11', 'T2 23/11'];
    const c = (t, o = {}) => ({ text: t, options: Object.assign({ fontSize: 11, align: 'center', fill: { color: C.background1 } }, o) });
    const L = (t, o = {}) => c(t, Object.assign({ align: 'left' }, o));
    const hdr = [L('Chuyền', { bold: true, color: MUTED, fill: { color: C.background2 } }), L('Mã hàng', { bold: true, color: MUTED, fill: { color: C.background2 } })].concat(days.map(d => c(d, { bold: true, color: MUTED, fontSize: 10, fill: { color: C.background2 } })));
    const e = (n) => Array(n).fill(0).map(() => c(''));
    const am = (t) => c(t, { bold: true, color: WARN, fill: { color: 'FFF1C7' } });
    const sum = (lbl, vals, o = {}) => [L('', Object.assign({ fill: { color: C.background2 } }, o)), L(lbl, Object.assign({ bold: true, fill: { color: C.background2 } }, o))].concat(vals.map(v => c(String(v), Object.assign({ fill: { color: C.background2 } }, o))));
    const bal = [0, 0, 1, -4, 1, 6, 5];
    const rows = [hdr,
      [L('G17', { bold: true }), L('HMM26-00118-3801(XX)')].concat([6, 6, 6, 6, 6, 6].map(v => c(String(v))), [c('')]),
      [L(''), L('↳ chuẩn bị HMM26-00118-3804(XX)', { color: WARN })].concat([c(''), c(''), c(''), am('3'), am('3'), am('3'), c('')]),
      [L(''), L('HMM26-00118-3804(XX)')].concat(e(6), [c('6')]),
      sum('PU2 — Sản xuất', [120, 118, 121, 119, 120, 118, 125]), sum('PU2 — Chuẩn bị', [10, 12, 8, 15, 9, 6, 0]), sum('PU2 — Tổng sử dụng', [130, 130, 129, 134, 129, 124, 125], { bold: true }),
      sum('Máy có sẵn', [130, 130, 130, 130, 130, 130, 130], { bold: true }),
      [L('', { fill: { color: C.background2 } }), L('Còn lại', { bold: true, fill: { color: C.background2 } })].concat(bal.map(v => c(String(v < 0 ? '−' + Math.abs(v) : v), { bold: true, fill: { color: v < 0 ? T_RED : C.background2 }, color: v < 0 ? BAD : C.text1 })))];
    s.addTable(rows, { x: 0.5, y: 1.35, w: 9.0, colW: [0.65, 3.3, 0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 0.73], rowH: 0.3, border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0, 0.05, 0, 0.05], objectName: 'Bảng chi tiết (ví dụ)' });
    box(s, 0.5, 4.22, 0.28, 0.2, 'FFF1C7'); txt(s, 'Chuẩn bị', { x: 0.88, y: 4.2, w: 1.0, h: 0.25, fontSize: 12 });
    txt(s, [{ text: '3', options: { strike: true, color: MUTED } }, { text: '  Đã bỏ' }], { x: 2.1, y: 4.2, w: 1.2, h: 0.25, fontSize: 12 });
    box(s, 3.5, 4.22, 0.28, 0.2, T_RED); txt(s, 'Thiếu máy', { x: 3.88, y: 4.2, w: 1.1, h: 0.25, fontSize: 12 });
    txt(s, 'Không có cột Chủ nhật · số liệu minh họa', { x: 5.2, y: 4.2, w: 4.3, h: 0.25, fontSize: 12, color: MUTED, align: 'right' });
    txt(s, 'Cuối bảng: tổng theo PU, tổng chung, máy có sẵn (kèm chi tiết + / − theo MC STATUS) và số còn lại.', { x: 0.5, y: 4.62, w: 9, h: 0.55 });
    notes(s, 'Số còn lại âm (màu đỏ) là ngày thiếu máy. Chi tiết máy có sẵn gồm các cột cộng và trừ trong công thức MC STATUS.');
  }

  // ===== 12. Quy tắc tính máy chuẩn bị =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · THIẾU MÁY & CHUẨN BỊ');
    s.addText('Quy tắc tính máy chuẩn bị', { placeholder: 'title' });
    box(s, 0.5, 1.35, 9, 0.85, T_BLUE);
    txt(s, [{ text: 'Máy chuẩn bị = làm tròn lên (Tỷ lệ × SL máy của mã sau)', options: { bold: true, fontSize: 18, color: C.text2, breakLine: true } },
      { text: 'Ví dụ: BT1M 50% × 10 máy = 5 máy. Tỷ lệ và số ngày đặt theo từng nhóm máy.', options: { fontSize: 14 } }], { x: 0.7, y: 1.4, w: 8.6, h: 0.75, valign: 'middle' });
    const d = ['T3 17/11', 'T4 18/11', 'T5 19/11', 'T6 20/11', 'T7 21/11', 'CN 22/11', 'T2 23/11'];
    d.forEach((t, i) => {
      const x = 0.5 + i * 1.3;
      txt(s, t, { x, y: 2.4, w: 1.2, h: 0.22, fontSize: 11, color: MUTED, align: 'center' });
      const kind = i >= 2 && i <= 4 ? 'p' : (i === 5 ? 's' : (i === 6 ? 'l' : 'n'));
      const fill = kind === 'p' ? C.accent2 : (kind === 's' ? C.background2 : (kind === 'l' ? C.accent1 : C.background1));
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.65, w: 1.2, h: 0.6, rectRadius: 0.06, fill: { color: fill }, line: { color: kind === 'n' || kind === 's' ? LINE : (kind === 'p' ? C.accent2 : C.accent1), width: 0.75 }, objectName: 'Ngày ' + t });
      const label = kind === 'p' ? '5 máy' : (kind === 's' ? 'bỏ CN' : (kind === 'l' ? 'Vào chuyền' : ''));
      if (label) txt(s, label, { x, y: 2.65, w: 1.2, h: 0.6, fontSize: 13, bold: true, align: 'center', valign: 'middle', color: kind === 'p' ? C.text2 : (kind === 'l' ? 'FFFFFF' : MUTED) });
    });
    txt(s, '3 ngày làm việc trước ngày vào chuyền (bỏ Chủ nhật)', { x: 3.1, y: 3.3, w: 3.8, h: 0.28, fontSize: 12, bold: true, align: 'center', color: WARN });
    txt(s, 'Không chuẩn bị khi', { x: 0.5, y: 3.7, w: 4, h: 0.3, bold: true, color: C.text2 });
    const no = ['Hai mã dùng chung một file layout.', 'Cặp mã nằm trong danh sách Dùng chung layout.', 'IE Tech bỏ dòng chuẩn bị đó.'];
    no.forEach((t, i) => { const x = 0.5 + i * 3.1; card(s, x, 4.05, 2.8, 0.85, { objectName: 'Không chuẩn bị ' + (i + 1) }); txt(s, t, { x: x + 0.15, y: 4.05, w: 2.5, h: 0.85, valign: 'middle' }); });
    notes(s, 'Ví dụ vào chuyền thứ Hai: chuẩn bị thứ Năm, thứ Sáu, thứ Bảy. Chủ nhật không tính.');
  }

  // ===== 13. Gửi IE Tech, báo sai lệch, xuất Excel =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · THIẾU MÁY & CHUẨN BỊ');
    s.addText('Gửi IE Tech, nhận báo sai lệch', { placeholder: 'title' });
    const cards = [[fa.FaPaperPlane, C.accent1, 'Gửi IE Tech', ['Nút Gửi IE Tech duyệt chuẩn bị.', 'Gửi lại khi kế hoạch đổi.', 'Xem ai đã Hoàn tất, còn bao nhiêu dòng chưa duyệt.']],
      [fa.FaBell, C.accent2, 'Báo sai lệch', ['Tab Báo sai lệch của IE Tech.', 'Đối chiếu CSDL lúc báo, layout, CSDL hiện tại.', 'Bấm Đã sửa CSDL hoặc Không đúng.']],
      [fa.FaFileExcel, C.accent3, 'Xuất Excel', ['Mỗi nhóm máy một sheet, ô vàng là chuẩn bị.', 'PREP BY PU như TTL DEMAND BY PU.', 'Chuẩn bị đã bỏ ghi 0, không bị cộng nhầm.']]];
    for (let i = 0; i < 3; i++) {
      const x = 0.5 + i * 3.1, [Comp, col, h, bl] = cards[i];
      card(s, x, 1.4, 2.8, 2.95, { objectName: 'Thẻ ' + h });
      s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: 1.58, w: 0.5, h: 0.5, fill: { color: col }, line: { color: col } });
      s.addImage({ data: await icon(Comp, 'FFFFFF'), x: x + 0.33, y: 1.71, w: 0.24, h: 0.24, altText: h });
      txt(s, h, { x: x + 0.85, y: 1.58, w: 1.8, h: 0.5, fontSize: 16, bold: true, color: C.text2, valign: 'middle' });
      txt(s, bl.map((b, k) => ({ text: b, options: { bullet: true, breakLine: k < bl.length - 1, paraSpaceAfter: 6 } })), { x: x + 0.2, y: 2.3, w: 2.45, h: 1.95 });
    }
    box(s, 0.5, 4.5, 9, 0.5, T_BLUE);
    txt(s, 'Sau khi IE Tech duyệt: mở lại chi tiết để thấy số đã chỉnh, rồi xuất Excel.', { x: 0.65, y: 4.5, w: 8.7, h: 0.5, valign: 'middle', color: C.text2 });
    notes(s, 'Ba việc IE Báo cáo máy làm sau khi mở chi tiết: gửi, nhận báo sai lệch, xuất Excel.');
  }

  // ===== 14. Chốt báo cáo =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · THIẾU MÁY & CHUẨN BỊ');
    s.addText('Chốt báo cáo', { placeholder: 'title' });
    const st = ['Mở tab Thiếu máy & chuẩn bị (dòng IE Tech hoàn tất tự cập nhật).', 'Bấm Chốt báo cáo…: xem bảng theo từng PU.', 'Đọc dòng cuối: dòng chưa duyệt, sai lệch, PU chưa hoàn tất.', 'Ghi chú (nếu cần), bấm Chốt báo cáo; còn tồn vẫn chốt được.', 'Xuất Excel: sheet TRẠNG THÁI, tên file có CHOT.'];
    st.forEach((r, i) => { const y = 1.4 + i * 0.72; num(s, i + 1, 0.5, y + 0.03, 0.36, C.accent1, { fontSize: 13 }); txt(s, r, { x: 1.0, y, w: 3.65, h: 0.66 }); });
    card(s, 4.9, 1.35, 4.6, 3.6, { objectName: 'Mô phỏng chốt báo cáo' });
    txt(s, [{ text: 'Chốt báo cáo chuẩn bị máy', options: { bold: true, color: C.text2 } }, { text: '   ví dụ', options: { fontSize: 10, color: MUTED } }], { x: 5.05, y: 1.45, w: 4.3, h: 0.3, fontSize: 13 });
    const H = (t) => ({ text: t, options: { bold: true, fontSize: 10, color: MUTED, fill: { color: C.background2 }, align: 'center' } });
    const R = (a, b, c, d, o = {}) => [a, b, c, d].map((t, i) => ({ text: t, options: { fontSize: 11, align: i === 2 ? 'left' : 'center', bold: i === 0 || (i === 1 && t !== '0') || o.bold, color: (i === 1 && t !== '0' && !o.plain) || (i === 2 && o.bad) ? BAD : C.text1, fill: { color: o.fill || C.background1 } } }));
    s.addTable([[H('PU'), H('Chưa duyệt'), Object.assign(H('IE Tech hoàn tất'), {}), H('Sai lệch')], R('PU1', '12', 'Hoa · 13/11 10:20', '0'), R('PU2', '0', 'Lan · 13/11 09:05', '1'), R('PU3', '35', 'Chưa hoàn tất', '0', { bad: true }), R('Tổng', '47', '1 PU chưa hoàn tất', '1', { fill: C.background2, bold: true, plain: true })],
      { x: 5.05, y: 1.8, w: 4.3, colW: [0.65, 0.95, 1.9, 0.8], rowH: 0.3, border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0, 0.05, 0, 0.05], objectName: 'Bảng chốt (ví dụ)' });
    txt(s, 'Còn: 47 dòng chưa duyệt · 1 sai lệch chưa xử lý · 1 PU chưa hoàn tất.', { x: 5.05, y: 3.4, w: 4.3, h: 0.42, fontSize: 11, color: BAD });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.05, y: 3.92, w: 2.2, h: 0.36, rectRadius: 0.05, fill: { color: C.background1 }, line: { color: '9AA6B5', width: 0.75 } });
    txt(s, 'Ghi chú khi chốt', { x: 5.13, y: 3.92, w: 2.0, h: 0.36, fontSize: 11, color: MUTED, valign: 'middle' });
    box(s, 7.4, 3.92, 1.95, 0.36, C.accent1);
    s.addImage({ data: I.lock_w, x: 7.52, y: 4.02, w: 0.15, h: 0.16, altText: '' });
    txt(s, 'Chốt báo cáo', { x: 7.75, y: 3.92, w: 1.55, h: 0.36, fontSize: 12, bold: true, color: 'FFFFFF', valign: 'middle' });
    box(s, 5.05, 4.4, 4.3, 0.44, T_AMBER);
    txt(s, 'Đã chốt bởi Tuan lúc 13/11 11:00 · có 2 thay đổi sau khi chốt', { x: 5.15, y: 4.4, w: 4.1, h: 0.44, fontSize: 11, color: '5E4300', valign: 'middle' });
    notes(s, 'Chốt không khóa dữ liệu: nếu có thay đổi sau khi chốt, tool báo số thay đổi và cần chốt lại. Cần kết nối thư mục data và nhập họ tên.');
  }

  // ===== 15. Tab Nhật ký =====
  {
    const s = slide('CONTENT', 'IE Báo cáo máy', 'IE BÁO CÁO MÁY · NHẬT KÝ');
    s.addText('Tab Nhật ký: theo loại máy và chuyền', { placeholder: 'title' });
    [['Từ 14/10/2026', 0.5, 1.45], ['Mọi PU', 2.05, 0.95], ['Mọi người', 3.1, 1.1], ['Mọi hành động', 4.3, 1.45], ['Chuyền: K | K,J | K05', 5.85, 2.15]].forEach(([t, x, w]) => {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.35, w, h: 0.32, rectRadius: 0.05, fill: { color: C.background1 }, line: { color: '9AA6B5', width: 0.75 } });
      txt(s, t, { x: x + 0.08, y: 1.35, w: w - 0.1, h: 0.32, fontSize: 11, color: MUTED, valign: 'middle' });
    });
    chip(s, 'Xuất Excel', 8.15, 1.35, 1.35, 0.32, C.accent1, 'FFFFFF', { bold: true, fontSize: 11 });
    chip(s, 'Tất cả loại máy', 0.5, 1.8, 1.45, 0.3, SEL, C.accent1, { bold: true, fontSize: 11 }); chip(s, 'BT1M  8', 2.05, 1.8, 0.95, 0.3, C.background2, MUTED, { bold: true, fontSize: 11 }); chip(s, 'ZZM  2', 3.1, 1.8, 0.85, 0.3, C.background2, MUTED, { bold: true, fontSize: 11 });
    chip(s, 'Chi tiết', 0.5, 2.2, 0.95, 0.3, SEL, C.accent1, { bold: true, fontSize: 11 }); chip(s, 'Theo loại máy', 1.55, 2.2, 1.35, 0.3, C.background2, MUTED, { bold: true, fontSize: 11 }); chip(s, 'Theo chuyền', 3.0, 2.2, 1.15, 0.3, C.background2, MUTED, { bold: true, fontSize: 11 });
    const H = (t) => ({ text: t, options: { bold: true, fontSize: 10, color: MUTED, fill: { color: C.background2 } } });
    const A = (t, col) => ({ text: t, options: { fontSize: 11, bold: true, color: col } });
    const c = (t) => ({ text: t, options: { fontSize: 11 } });
    s.addTable([[H('Thời gian'), H('Người'), H('Hành động'), H('Loại máy'), H('Chuyền'), H('Chi tiết')],
      [c('13/11 10:20'), c('Hoa'), A('Giữ', OK), c('BT1M'), c('D41'), c('VSS24-00248-3801 → 3803')],
      [c('13/11 10:21'), c('Hoa'), A('Cùng layout', INFO), c('BT1M'), c('D14'), c('VSS26-00555-1108 → 1103')],
      [c('13/11 10:22'), c('Hoa'), A('Giữ', OK), c('BT1M'), c('D34'), c('SL layout 2 (CSDL 18) · 5 ngày chuẩn bị')],
      [c('13/11 10:25'), c('Hoa'), A('Báo sai lệch', WARN), c('BT1M'), c('D34'), c('CSDL 18, layout 2')],
      [c('13/11 10:40'), c('Tuan'), A('Chốt báo cáo', OK), c(''), c(''), c('977 dòng, 973 chưa duyệt · Tuần 46 chốt lần 1')]],
      { x: 0.5, y: 2.62, w: 9.0, colW: [1.05, 0.6, 1.3, 0.8, 0.7, 4.55], rowH: 0.29, border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0, 0.05, 0, 0.05], objectName: 'Bảng nhật ký (ví dụ)' });
    txt(s, 'Nguồn: đề xuất đã gửi, quyết định IE Tech, báo sai lệch, hoàn tất, ghi nhớ cùng layout, chốt báo cáo, duyệt CSDL. Số liệu minh họa.', { x: 0.5, y: 4.45, w: 9.0, h: 0.4, fontSize: 11, color: MUTED });
    txt(s, 'Ở hai cách xem tổng hợp, bấm một dòng để xem chi tiết của loại máy hoặc chuyền đó.', { x: 0.5, y: 4.85, w: 9.0, h: 0.3 });
    notes(s, 'Nhật ký đọc từ thư mục data. Mặc định hiển thị 30 ngày gần nhất; chuyền lọc theo đầu mã (K, K,J, K05).');
  }

  // ===== 16. IE Tech: kết nối và phạm vi =====
  {
    const s = slide('CONTENT', 'IE Tech', 'IE TECH');
    s.addText('IE Tech: kết nối và phạm vi', { placeholder: 'title' });
    const st = ['Chọn vai trò IE Tech ở góc trên bên phải.', 'Chọn thư mục data…: đúng thư mục IE Báo cáo máy dùng để gửi. Dùng lại nếu không đổi.', 'Chọn thư mục layout…; nhập đường dẫn mạng để mở file gốc.', 'Nhập Họ tên, PU, Chuyền phụ trách.'];
    st.forEach((r, i) => { const y = 1.4 + i * 0.86; num(s, i + 1, 0.5, y + 0.03, 0.38, C.accent5, { fontSize: 14 }); txt(s, r, { x: 1.05, y, w: 3.95, h: 0.8 }); });
    box(s, 5.4, 1.4, 4.1, 0.62, T_GREEN);
    txt(s, '✓ Thư mục "data": 1 đề xuất, mới nhất 11-11 10:28 (Tuan)', { x: 5.55, y: 1.4, w: 3.85, h: 0.62, fontSize: 12, color: OK, valign: 'middle' });
    box(s, 5.4, 2.12, 4.1, 0.78, T_RED);
    txt(s, 'Thư mục "wrong" chưa có đề xuất chuẩn bị. Hãy chọn đúng thư mục data mà IE Báo cáo máy dùng khi gửi.', { x: 5.55, y: 2.12, w: 3.85, h: 0.78, fontSize: 12, color: BAD, valign: 'middle' });
    txt(s, 'Chuyền phụ trách: gõ đầu mã chuyền', { x: 5.4, y: 3.1, w: 4.1, h: 0.3, bold: true, color: C.text2 });
    [['K', 'Mọi chuyền K (K01, K02…)'], ['K,J', 'Chuyền K và chuyền J'], ['K05', 'Chuyền K05']].forEach((r, i) => {
      const y = 3.5 + i * 0.46;
      chip(s, r[0], 5.4, y, 0.8, 0.36, C.background2, C.text2, { bold: true, fontSize: 13 });
      txt(s, r[1], { x: 6.35, y, w: 3.15, h: 0.36, valign: 'middle' });
    });
    notes(s, 'Hộp chọn thư mục luôn mở để người dùng tự chọn. Dòng trạng thái cho biết thư mục đã chọn có đề xuất hay chưa.');
  }

  // ===== 15. IE Tech: duyệt chuẩn bị =====
  {
    const s = slide('CONTENT', 'IE Tech', 'IE TECH');
    s.addText('IE Tech: duyệt chuẩn bị', { placeholder: 'title' });
    chip(s, 'BT1M  58', 0.5, 1.4, 1.1, 0.34, SEL, C.accent1, { bold: true, fontSize: 12 }); chip(s, 'ZZM  48', 1.7, 1.4, 1.0, 0.34, C.background2, MUTED, { bold: true, fontSize: 12 });
    const gx = [0.5, 1.15, 4.1, 4.75, 5.4], gw = [0.65, 2.95, 0.65, 0.65, 0.6];
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.85, w: 5.5, h: 0.3, fill: { color: C.background2 }, line: { color: LINE, width: 0.75 } });
    ['Chuyền', 'Mã hàng', 'T4 18/11', 'T5 19/11', 'T6 20/11'].forEach((h, i) => txt(s, h, { x: gx[i] + 0.06, y: 1.85, w: gw[i], h: 0.3, fontSize: 10, bold: true, color: MUTED, valign: 'middle' }));
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 2.15, w: 5.5, h: 1.45, fill: { color: C.background1 }, line: { color: LINE, width: 0.75 } });
    txt(s, 'B03', { x: 0.56, y: 2.15, w: 0.6, h: 0.38, fontSize: 12, bold: true, valign: 'middle' });
    txt(s, 'NIK25-00025-2901(B2)', { x: 1.21, y: 2.15, w: 2.9, h: 0.38, fontSize: 12, valign: 'middle' });
    [5, 5, 5].forEach((v, i) => txt(s, String(v), { x: gx[2 + i], y: 2.15, w: gw[2 + i], h: 0.38, fontSize: 12, align: 'center', valign: 'middle' }));
    s.addShape(pres.shapes.RECTANGLE, { x: 4.1, y: 2.53, w: 1.9, h: 0.67, fill: { color: 'FFF1C7' }, line: { color: 'FFF1C7' } });
    txt(s, '↳ chuẩn bị ONY26-00053-3802(XX)', { x: 1.21, y: 2.56, w: 2.85, h: 0.28, fontSize: 11, color: WARN });
    chip(s, 'Chờ IE Tech', 1.21, 2.9, 0.95, 0.26, T_AMBER, WARN, { bold: true, fontSize: 10 });
    txt(s, 'vào 21/11', { x: 3.3, y: 2.9, w: 0.75, h: 0.26, fontSize: 10, color: MUTED, valign: 'middle' });
    [['pen', 2.25], ['tick', 2.6], ['x', 2.95]].forEach(([k, x]) => {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.88, w: 0.3, h: 0.26, rectRadius: 0.05, fill: { color: C.background1 }, line: { color: '9AA6B5', width: 0.75 } });
      s.addImage({ data: I[k + '_d'], x: x + 0.09, y: 2.94, w: 0.12, h: 0.14, altText: '' });
    });
    [5, 5, 5].forEach((v, i) => txt(s, String(v === 5 ? 3 : v), { x: gx[2 + i], y: 2.53, w: gw[2 + i], h: 0.67, fontSize: 12, bold: true, color: WARN, align: 'center', valign: 'middle' }));
    s.addShape(pres.shapes.LINE, { x: 0.5, y: 3.2, w: 5.5, h: 0, line: { color: LINE, width: 0.5 } });
    txt(s, 'ONY26-00053-3802(XX)', { x: 1.21, y: 3.2, w: 2.9, h: 0.4, fontSize: 12, valign: 'middle', color: MUTED });
    const ex = [['Nút nhóm máy', 'Bảng, số đếm và tổng PU chỉ còn nhóm đó.'], ['Dấu tick, dấu x', 'Một lần bấm: giữ hoặc bỏ. Không cần nhập lý do.'], ['Cây bút', 'Bấm bút hoặc bấm vào dòng vàng để mở bảng bên phải.']];
    ex.forEach((r, i) => {
      const y = 1.4 + i * 0.98;
      num(s, i + 1, 6.35, y + 0.02, 0.34, C.accent5, { fontSize: 13 });
      txt(s, [{ text: r[0], options: { bold: true, color: C.text2, breakLine: true } }, { text: r[1] }], { x: 6.85, y, w: 2.65, h: 0.92 });
    });
    box(s, 0.5, 3.9, 5.5, 0.9, T_RED);
    txt(s, [{ text: 'Quá hạn: ', options: { bold: true, color: BAD } }, { text: 'đã đến ngày bắt đầu chuẩn bị mà chưa duyệt. Dòng chưa duyệt giữ số đề xuất.' }], { x: 0.65, y: 3.9, w: 5.2, h: 0.9, valign: 'middle' });
    notes(s, 'Màn hình IE Tech giống bảng của IE Báo cáo máy, thêm ba nút trên mỗi dòng chuẩn bị.');
  }

  // ===== 16. IE Tech: bảng bên phải =====
  {
    const s = slide('CONTENT', 'IE Tech', 'IE TECH');
    s.addText('IE Tech: bảng bên phải', { placeholder: 'title' });
    const f = [['Số máy chuẩn bị', 'Chỉ nhập khi khác đề xuất.'], ['SL theo layout', 'Khi layout khác CSDL: số chuẩn bị tự tính lại, IE Báo cáo máy nhận thông báo.'],
      ['Ngày vào chuyền', 'Sớm hơn: mã mới chạy đủ số máy từ ngày mới. Muộn hơn: mã trước chạy tiếp.'], ['Số ngày chuẩn bị', 'Mặc định 3. Tăng cho mã cần chuẩn bị lâu hơn.']];
    f.forEach((r, i) => { const y = 1.4 + i * 0.88; num(s, i + 1, 0.5, y + 0.03, 0.36, C.accent5, { fontSize: 13 }); txt(s, [{ text: r[0], options: { bold: true, color: C.text2, breakLine: true } }, { text: r[1] }], { x: 1.0, y, w: 4.3, h: 0.82 }); });
    card(s, 5.7, 1.35, 3.8, 3.55, { objectName: 'Mô phỏng bảng bên phải' });
    txt(s, 'G16 · BT1M', { x: 5.9, y: 1.45, w: 3.4, h: 0.3, bold: true, color: C.text2, fontSize: 15 });
    txt(s, 'HMM26-00112-3805(XX) → HMM26-00118-3804(XX) · vào chuyền 22/11', { x: 5.9, y: 1.78, w: 3.4, h: 0.45, fontSize: 11, color: MUTED });
    [['Số máy chuẩn bị', '3'], ['SL theo layout', '6'], ['Ngày vào chuyền', '22/11/2026'], ['Số ngày chuẩn bị', '3']].forEach((r, i) => {
      const y = 2.3 + i * 0.4;
      txt(s, r[0], { x: 5.9, y, w: 1.6, h: 0.32, fontSize: 12, valign: 'middle' });
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.6, y, w: 1.7, h: 0.32, rectRadius: 0.05, fill: { color: C.background1 }, line: { color: i === 1 ? C.accent2 : '9AA6B5', width: i === 1 ? 1.5 : 0.75 } });
      txt(s, r[1], { x: 7.68, y, w: 1.55, h: 0.32, fontSize: 12, valign: 'middle', bold: i === 1 });
    });
    chip(s, 'Lưu', 5.9, 4.0, 0.8, 0.34, C.accent1, 'FFFFFF', { bold: true, fontSize: 12 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 6.8, y: 4.0, w: 1.2, h: 0.34, rectRadius: 0.06, fill: { color: C.background1 }, line: { color: '9AA6B5', width: 0.75 } });
    txt(s, 'Bỏ chuẩn bị', { x: 6.8, y: 4.0, w: 1.2, h: 0.34, fontSize: 12, align: 'center', valign: 'middle' });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.9, y: 4.42, w: 3.4, h: 0.34, rectRadius: 0.06, fill: { color: C.background1 }, line: { color: '9AA6B5', width: 0.75 } });
    txt(s, 'Cùng layout (bỏ và ghi nhớ)', { x: 5.9, y: 4.42, w: 3.4, h: 0.34, fontSize: 12, align: 'center', valign: 'middle' });
    notes(s, 'Chỉ cần nhập ô nào khác mặc định. Nút Cùng layout bỏ chuẩn bị và ghi nhớ cặp mã hàng cho các lần sau.');
  }

  // ===== 19. IE Tech: Cùng layout được ghi nhớ =====
  {
    const s = slide('CONTENT', 'IE Tech', 'IE TECH');
    s.addText('IE Tech: Cùng layout được ghi nhớ', { placeholder: 'title' });
    card(s, 0.5, 1.4, 4.1, 2.3, { objectName: 'Bạn bấm' });
    txt(s, 'Bạn bấm một lần', { x: 0.7, y: 1.5, w: 3.7, h: 0.3, bold: true, color: C.text2, fontSize: 15 });
    txt(s, [{ text: 'VSS26-00555-1108 → VSS26-00555-1103', options: { bold: true, breakLine: true } }, { text: 'BT1M · chuyền D14', options: { color: MUTED } }], { x: 0.7, y: 1.95, w: 3.7, h: 0.6, fontSize: 12 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 2.75, w: 3.7, h: 0.4, rectRadius: 0.06, fill: { color: C.background1 }, line: { color: '9AA6B5', width: 0.75 } });
    txt(s, 'Cùng layout (bỏ và ghi nhớ)', { x: 0.7, y: 2.75, w: 3.7, h: 0.4, fontSize: 12, align: 'center', valign: 'middle' });
    s.addImage({ data: I.arrow_m, x: 4.68, y: 2.45, w: 0.2, h: 0.2, altText: '' });
    card(s, 4.95, 1.4, 4.55, 2.3, { objectName: 'Tự động áp dụng' });
    txt(s, 'Tự động bỏ chuẩn bị', { x: 5.15, y: 1.5, w: 4.1, h: 0.3, bold: true, color: C.text2, fontSize: 15 });
    ['ZZM · chuyền D14 (loại máy khác)', 'BT1M · chuyền D22 (chuyền khác)', 'Lần tính sau của IE Báo cáo máy'].forEach((t, i) => {
      const y = 1.95 + i * 0.55;
      txt(s, t, { x: 5.15, y, w: 2.5, h: 0.4, fontSize: 12, valign: 'middle' });
      chip(s, 'Cùng layout — bỏ', 7.75, y + 0.04, 1.55, 0.32, T_GREEN, OK, { bold: true, fontSize: 11 });
    });
    box(s, 0.5, 3.9, 9, 0.45, T_BLUE);
    txt(s, 'Ghi nhớ theo cặp mã hàng (mã trước → mã sau), không theo chuyền hay loại máy.', { x: 0.65, y: 3.9, w: 8.7, h: 0.45, valign: 'middle', color: C.text2 });
    box(s, 0.5, 4.45, 9, 0.5, T_AMBER);
    txt(s, 'Muốn chuẩn bị lại một dòng: bấm Giữ hoặc Chỉnh trên dòng đó, quyết định này được ưu tiên.', { x: 0.65, y: 4.45, w: 8.7, h: 0.5, valign: 'middle', color: '5E4300' });
    notes(s, 'IE Báo cáo máy bấm Mở chi tiết sẽ đọc lại danh sách ghi nhớ, nên các lần tính sau đều bỏ chuẩn bị cho cặp mã hàng này.');
  }

  // ===== 20. IE Tech: xem layout =====
  {
    const s = slide('CONTENT', 'IE Tech', 'IE TECH');
    s.addText('IE Tech: xem layout ngay trong bảng', { placeholder: 'title' });
    const st = ['Tìm layout: gõ một phần tên file, hoặc xem gợi ý theo mã hàng.', 'Bấm file để xem bảng máy; tick các sheet cần cộng.', 'So nhóm máy với CSDL; bấm Dùng … làm SL theo layout.', 'Cần file gốc: Mở bằng Excel hoặc Sao chép đường dẫn.'];
    st.forEach((r, i) => { const y = 1.4 + i * 0.82; num(s, i + 1, 0.5, y + 0.03, 0.36, C.accent5, { fontSize: 13 }); txt(s, r, { x: 1.0, y, w: 3.4, h: 0.78 }); });
    txt(s, 'Sheet ẩn và sheet F T S C không hiển thị.', { x: 0.5, y: 4.75, w: 3.9, h: 0.3, fontSize: 12, color: MUTED });
    card(s, 4.7, 1.35, 4.8, 3.6, { objectName: 'Mô phỏng xem layout' });
    txt(s, [{ text: 'HMM26-00118-3804(XX).xlsx', options: { bold: true } }, { text: '   sửa 11/11/2026 05:50', options: { fontSize: 11, color: MUTED } }], { x: 4.9, y: 1.45, w: 4.4, h: 0.3, fontSize: 13 });
    [['Layout A (18 máy, BT1M: 6)', 1.85], ['Layout B (16 máy, BT1M: 4)', 2.15]].forEach(([t, y]) => {
      s.addShape(pres.shapes.RECTANGLE, { x: 4.9, y: y + 0.04, w: 0.17, h: 0.17, fill: { color: C.accent1 }, line: { color: C.accent1 } });
      s.addImage({ data: I.tick_w, x: 4.93, y: y + 0.07, w: 0.11, h: 0.11, altText: '' });
      txt(s, t, { x: 5.17, y, w: 3.5, h: 0.26, fontSize: 12, bold: true });
    });
    const H = (t) => ({ text: t, options: { bold: true, fontSize: 10, color: MUTED, fill: { color: C.background2 }, align: 'center' } });
    const D = (t, b) => ({ text: t, options: { fontSize: 12, align: 'center', bold: !!b, fill: { color: T_AMBER } } });
    s.addTable([[H('Nhóm máy'), H('M/C'), H('Layout A'), H('Layout B'), H('Tổng đã chọn')], [D('BT1M'), D('BT1M', 1), D('6'), D('4'), D('10', 1)]],
      { x: 4.9, y: 2.6, w: 4.4, colW: [0.9, 0.8, 0.85, 0.85, 1.0], rowH: [0.3, 0.34], border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0, 0.05, 0, 0.05], objectName: 'Bảng máy (ví dụ)' });
    txt(s, 'BT1M theo sheet đã chọn: 10 máy · CSDL: 6', { x: 4.9, y: 3.4, w: 4.4, h: 0.3, bold: true, fontSize: 13, color: C.text2 });
    chip(s, 'Dùng 10 làm SL theo layout', 4.9, 3.8, 2.4, 0.38, C.accent1, 'FFFFFF', { bold: true, fontSize: 12 });
    txt(s, 'Mở bằng Excel · Sao chép đường dẫn · Tải bản sao', { x: 4.9, y: 4.4, w: 4.4, h: 0.28, fontSize: 11, color: C.accent1 });
    notes(s, 'Cách xem layout giống Layout Check: tick sheet, bảng máy theo nhóm, so với CSDL.');
  }

  // ===== 18. IE Tech: hoàn tất =====
  {
    const s = slide('CONTENT', 'IE Tech', 'IE TECH');
    s.addText('IE Tech: hoàn tất và sang tuần sau', { placeholder: 'title' });
    card(s, 0.5, 1.4, 4.4, 3.3, { objectName: 'Hoàn tất duyệt' });
    txt(s, 'Khi duyệt xong', { x: 0.7, y: 1.5, w: 2.2, h: 0.38, fontSize: 16, bold: true, color: C.text2, valign: 'middle' });
    box(s, 3.0, 1.52, 1.7, 0.34, C.accent5);
    txt(s, 'Hoàn tất duyệt', { x: 3.0, y: 1.52, w: 1.7, h: 0.34, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    box(s, 0.7, 2.05, 4.0, 1.05, T_AMBER);
    txt(s, 'Còn 109 dòng chuẩn bị chưa duyệt (trên 22 chuyền). Các dòng này giữ số đề xuất. Vẫn hoàn tất?', { x: 0.82, y: 2.05, w: 3.76, h: 1.05, fontSize: 12, valign: 'middle', color: '5E4300' });
    txt(s, [{ text: 'Bấm khi đã duyệt xong phạm vi đang xem.', options: { bullet: true, breakLine: true, paraSpaceAfter: 6 } }, { text: 'IE Báo cáo máy thấy ai đã hoàn tất và còn bao nhiêu dòng chưa duyệt.', options: { bullet: true } }], { x: 0.7, y: 3.25, w: 4.0, h: 1.5 });
    card(s, 5.1, 1.4, 4.4, 3.3, { objectName: 'Sang tuần sau' });
    txt(s, 'Sang tuần sau', { x: 5.3, y: 1.5, w: 3.9, h: 0.38, fontSize: 16, bold: true, color: C.text2, valign: 'middle' });
    txt(s, [{ text: 'Quyết định được giữ khi trình tự mã hàng trên chuyền không đổi.', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
      { text: 'Ngày đổi: giữ quyết định, hiện nhãn ngày thay đổi.', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
      { text: 'Số máy mã sau trong CSDL đổi: dòng về Chờ duyệt.', options: { bullet: true } }], { x: 5.3, y: 2.05, w: 4.0, h: 2.7 });
    notes(s, 'Có thể bấm Hoàn tất ngay cả khi còn dòng chưa duyệt; hệ thống cảnh báo số dòng và số chuyền.');
  }

  // ===== 19. Lỗi thường gặp =====
  {
    const s = slide('CONTENT', 'Hỗ trợ', 'HỖ TRỢ');
    s.addText('Lỗi thường gặp', { placeholder: 'title' });
    const rows = [['IE Tech không thấy đề xuất', 'Chọn đúng thư mục data mà IE Báo cáo máy dùng khi gửi; gửi lại nếu cần.'],
      ['Mã máy bị chặn, hoặc nhóm máy báo chưa có máy có sẵn', 'Thêm mã máy vào MACHINE GROUP, rồi nạp lại.'],
      ['Dòng Chưa có PU', 'Thêm chuyền vào sheet PU LIST của MC Report.'],
      ['Mã hàng ở mục Còn thiếu dữ liệu', 'Chưa có layout, costing, CSDL: bổ sung layout hoặc nhập CSDL.'],
      ['Không mở được file bằng Excel', 'Dùng Sao chép đường dẫn, hoặc nhập đúng đường dẫn mạng của thư mục layout.'],
      ['Tên PU mới (PU tách) không hiện', 'Cập nhật sheet PU LIST của MC Report; tên PU phải giống Linemapping.xlsx.']];
    const H = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: C.text2 }, fontSize: 13 } });
    s.addTable([[H('Hiện tượng'), H('Cách xử lý')]].concat(rows.map((r, i) => [{ text: r[0], options: { bold: true, fontSize: 14, color: C.text2, fill: { color: i % 2 ? C.background2 : C.background1 } } }, { text: r[1], options: { fontSize: 14, fill: { color: i % 2 ? C.background2 : C.background1 } } }])),
      { x: 0.5, y: 1.35, w: 9, colW: [3.5, 5.5], rowH: [0.36, 0.56, 0.56, 0.56, 0.56, 0.56, 0.56], border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0, 0.1, 0, 0.1], objectName: 'Bảng lỗi thường gặp' });
    notes(s, 'Các lỗi gặp nhiều nhất khi dùng thực tế.');
  }

  // ===== 20. Checklist (dark) =====
  {
    const s = slide('DARK', 'Hỗ trợ', 'HỖ TRỢ');
    s.addText('Checklist hàng tuần', { placeholder: 'title' });
    const lists = [['IE Báo cáo máy', C.accent1, ['Kết nối lại, chọn Master plan mới', 'Quét layout, duyệt và lưu CSDL', 'Dán Table1, Refresh All', 'Chọn nhóm máy thiếu, gửi IE Tech', 'Xử lý báo sai lệch, mở lại chi tiết', 'Chốt báo cáo, xuất Excel']],
      ['IE Tech', C.accent5, ['Chọn đúng thư mục data, PU, chuyền', 'Giữ, chỉnh hoặc bỏ từng dòng', 'Báo sai lệch khi layout khác CSDL', 'Bấm Hoàn tất duyệt']]];
    for (let i = 0; i < 2; i++) {
      const x = 0.5 + i * 4.6, [h, col, it] = lists[i];
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.4, w: 4.4, h: 3.5, rectRadius: 0.08, fill: { color: '21415F' }, line: { color: '2E5278', width: 0.75 }, objectName: 'Danh sách ' + h });
      s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 1.6, w: 0.22, h: 0.22, fill: { color: col }, line: { color: 'FFFFFF', width: 1 } });
      txt(s, h, { x: x + 0.6, y: 1.55, w: 3.5, h: 0.32, fontSize: 16, bold: true, color: 'FFFFFF', valign: 'middle' });
      it.forEach((t, k) => {
        const y = 2.1 + k * 0.46;
        s.addImage({ data: I.check_w, x: x + 0.25, y: y + 0.07, w: 0.24, h: 0.24, altText: '' });
        txt(s, t, { x: x + 0.65, y, w: 3.6, h: 0.38, color: 'FFFFFF', valign: 'middle' });
      });
    }
    notes(s, 'Tóm tắt các việc cần làm mỗi tuần cho từng vai trò.');
  }

  await pres.writeFile({ fileName: path.join(__dirname, 'IE_BaoCaoMay_HuongDan_v7.7.pptx') });
  await applyTheme(path.join(__dirname, 'IE_BaoCaoMay_HuongDan_v7.7.pptx'), THEME);
  console.log('written');
})().catch(e => { console.error(e); process.exit(1); });
