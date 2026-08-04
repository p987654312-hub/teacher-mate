import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

export type PrintWithPageNumbersOptions = {
  saveAsPdf?: boolean;
  filename?: string;
  element?: HTMLElement | null;
};

const STYLE_ID = "tm-print-page-style";
/** A4 본문 폭(px, 96dpi) — 좌우 여백 6mm×2 */
const A4_CONTENT_WIDTH_PX = Math.round(((210 - 12) * 96) / 25.4);

const PRINT_PAGE_CSS = `
@page {
  size: A4;
  margin: 20mm 7mm 16mm 7mm;
}
@page {
  @bottom-center {
    content: counter(page) "/" counter(pages);
    font-family: "Malgun Gothic", "Noto Sans KR", sans-serif;
    font-size: 10pt;
    font-weight: 600;
    color: #000;
    vertical-align: bottom;
    padding-bottom: 2mm;
  }
}
`;

function ensurePrintPageStyle() {
  if (typeof document === "undefined") return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.setAttribute("media", "print");
    document.head.appendChild(style);
  }
  style.textContent = PRINT_PAGE_CSS;
}

function showPrintBusyOverlay(message: string): () => void {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(255,255,255,0.72);font-family:'Malgun Gothic','Noto Sans KR',sans-serif;" +
    "font-size:14px;font-weight:600;color:#1e293b;";
  el.textContent = message;
  document.body.appendChild(el);
  return () => {
    el.remove();
  };
}

async function preparePdfDocument(element?: HTMLElement | null): Promise<jsPDF> {
  const target = resolveTarget(element);
  const restoreUi = hideNonPrintUi();
  const restoreLayout = applyPrintLikeLayout(target);

  try {
    window.dispatchEvent(new Event("resize"));
    await wait(500);
    window.dispatchEvent(new Event("resize"));
    await wait(700);
    return await buildPdfFromElement(target);
  } finally {
    restoreLayout();
    restoreUi();
    window.dispatchEvent(new Event("resize"));
  }
}

async function printPdfBlob(pdf: jsPDF): Promise<void> {
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "print-frame");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  try {
    // PDF iframe은 onload가 불안정한 경우가 있어 타임아웃과 병행
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      iframe.onload = () => finish();
      iframe.src = url;
      window.setTimeout(finish, 1200);
    });
    await wait(400);
    const win = iframe.contentWindow;
    if (!win) throw new Error("print iframe unavailable");
    win.focus();
    win.print();
  } finally {
    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  }
}

function resolveTarget(element?: HTMLElement | null): HTMLElement {
  return (
    element ||
    (document.querySelector(".print-content-area") as HTMLElement | null) ||
    (document.querySelector(".result-report-inner") as HTMLElement | null) ||
    (document.querySelector("main") as HTMLElement | null) ||
    document.body
  );
}

function hideNonPrintUi(): () => void {
  const hidden: { el: HTMLElement; display: string }[] = [];
  document.querySelectorAll("[class]").forEach((node) => {
    const el = node as HTMLElement;
    const cls = typeof el.className === "string" ? el.className : "";
    if (!cls.includes("print:hidden") && !cls.includes("print-hidden")) return;
    hidden.push({ el, display: el.style.display });
    el.style.display = "none";
  });
  document.querySelectorAll("footer").forEach((node) => {
    const el = node as HTMLElement;
    if (hidden.some((h) => h.el === el)) return;
    hidden.push({ el, display: el.style.display });
    el.style.display = "none";
  });
  return () => {
    hidden.forEach(({ el, display }) => {
      el.style.display = display;
    });
  };
}

/** 인쇄와 동일한 레이아웃으로 화면을 잠깐 맞춘 뒤 복구 */
function applyPrintLikeLayout(target: HTMLElement): () => void {
  const html = document.documentElement;
  const prev = {
    htmlClass: html.className,
    targetWidth: target.style.width,
    targetMaxWidth: target.style.maxWidth,
    targetMargin: target.style.margin,
  };

  html.classList.add("pdf-export");
  target.style.width = `${A4_CONTENT_WIDTH_PX}px`;
  target.style.maxWidth = `${A4_CONTENT_WIDTH_PX}px`;
  target.style.margin = "0 auto";

  return () => {
    html.className = prev.htmlClass;
    target.style.width = prev.targetWidth;
    target.style.maxWidth = prev.targetMaxWidth;
    target.style.margin = prev.targetMargin;
  };
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** 한 가로줄의 '잉크'(비흰색) 비율 — 낮을수록 줄 사이 공백에 가깝다 */
function rowInkRatio(ctx: CanvasRenderingContext2D, y: number, width: number): number {
  const safeY = Math.max(0, Math.min(y, ctx.canvas.height - 1));
  const data = ctx.getImageData(0, safeY, width, 1).data;
  let ink = 0;
  const step = 4; // 샘플링
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a > 20 && (r < 248 || g < 248 || b < 248)) ink++;
  }
  return ink / (width / step);
}

/**
 * idealY 근처에서 텍스트 줄이 잘리지 않도록
 * 잉크가 적은(빈) 가로줄을 찾아 페이지 나눔 위치로 사용.
 */
function findTextSafeBreakY(
  ctx: CanvasRenderingContext2D,
  idealY: number,
  canvasHeight: number,
  searchUp: number,
  minBreakY: number
): number {
  const width = ctx.canvas.width;
  const start = Math.max(minBreakY, idealY - searchUp);
  const end = Math.min(canvasHeight - 1, idealY);

  let bestY = idealY;
  let bestScore = Number.POSITIVE_INFINITY;

  // 이상적 위치에서 위로 탐색 (줄을 다음 페이지로 넘기는 쪽 선호)
  for (let y = end; y >= start; y -= 2) {
    const s0 = rowInkRatio(ctx, y, width);
    const s1 = rowInkRatio(ctx, Math.max(0, y - 1), width);
    const score = s0 + s1;
    if (score < bestScore) {
      bestScore = score;
      bestY = y;
      if (score < 0.02) break;
    }
  }

  return Math.max(minBreakY, Math.min(bestY, idealY));
}

function addPageNumbers(pdf: jsPDF, marginBottom: number) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, pageHeight - marginBottom, pageWidth, marginBottom, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    // 하단에서 ~4mm (기존 10mm보다 약 6~10mm 아래)
    pdf.text(`${i}/${total}`, pageWidth / 2, pageHeight - 4, { align: "center" });
  }
}

/** 괄호 앞이 붙은 텍스트만 일반 공백으로 보정 (자간/마진 조작 금지 — 기준선 깨짐 방지) */
function fixParenSpacingInClone(clonedDoc: Document, element: HTMLElement) {
  const walker = clonedDoc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) textNodes.push(node as Text);
  for (const textNode of textNodes) {
    const t = textNode.textContent ?? "";
    const fixed = t.replace(/([^\s([{（])([(（])/g, "$1 $2");
    if (fixed !== t) textNode.textContent = fixed;
  }
}

async function buildPdfFromElement(target: HTMLElement): Promise<jsPDF> {
  // windowWidth를 md(768) 이상으로 둬 인쇄 미리보기와 같이 2열 그리드가 유지되게 함
  // (실제 캡처 폭은 width/A4 본문으로 고정)
  const captureWindowWidth = Math.max(A4_CONTENT_WIDTH_PX, 900);
  const canvas = await html2canvas(target, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    width: A4_CONTENT_WIDTH_PX,
    windowWidth: captureWindowWidth,
    windowHeight: Math.max(target.scrollHeight, target.offsetHeight),
    scrollX: 0,
    scrollY: 0,
    onclone: fixParenSpacingInClone,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 6;
  const marginTop = 14;
  const marginBottom = 16;
  const contentWidth = pageWidth - marginX * 2;
  const contentHeightMm = pageHeight - marginTop - marginBottom;

  // mm 본문 높이 → 캔버스 픽셀 높이
  const pxPerMm = canvas.width / contentWidth;
  const pageContentHeightPx = Math.floor(contentHeightMm * pxPerMm);
  const searchUp = Math.floor(pageContentHeightPx * 0.22); // 페이지 하단 22% 구간에서 줄바꿈 탐색

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas context unavailable");

  const sliceCanvas = document.createElement("canvas");
  const sliceCtx = sliceCanvas.getContext("2d");
  if (!sliceCtx) throw new Error("slice canvas context unavailable");

  let srcY = 0;
  let pageIndex = 0;

  while (srcY < canvas.height - 2) {
    const remaining = canvas.height - srcY;
    let sliceH: number;

    if (remaining <= pageContentHeightPx + 8) {
      sliceH = remaining;
    } else {
      const idealBreak = srcY + pageContentHeightPx;
      const minBreakY = srcY + Math.floor(pageContentHeightPx * 0.55);
      const breakY = findTextSafeBreakY(ctx, idealBreak, canvas.height, searchUp, minBreakY);
      sliceH = breakY - srcY;
    }

    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceH;
    sliceCtx.fillStyle = "#ffffff";
    sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceCtx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    const sliceMmH = sliceH / pxPerMm;
    const imgData = sliceCanvas.toDataURL("image/png");

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, "PNG", marginX, marginTop, contentWidth, sliceMmH);

    srcY += sliceH;
    pageIndex += 1;

    // 안전장치
    if (pageIndex > 80) break;
  }

  addPageNumbers(pdf, marginBottom);
  return pdf;
}

/**
 * 인쇄: PDF와 동일한 캡처본(여백·쪽번호 포함)을 만들어 인쇄 대화상자를 연다.
 * (브라우저 기본 인쇄는 여백/쪽번호가 설정·엔진에 따라 자주 무시됨)
 */
export async function printDocument(options: PrintWithPageNumbersOptions = {}): Promise<void> {
  ensurePrintPageStyle();
  const hideBusy = showPrintBusyOverlay("인쇄 준비 중…");
  try {
    const pdf = await preparePdfDocument(options.element);
    await printPdfBlob(pdf);
  } catch (err) {
    console.error("인쇄 실패:", err);
    alert("인쇄 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    hideBusy();
  }
}

/** PDF: 인쇄와 같은 레이아웃으로 캡처 후, 텍스트 줄 단위로 페이지 나눔 → 다운로드 */
export async function downloadPdf(options: PrintWithPageNumbersOptions = {}): Promise<void> {
  const filename = options.filename || "document.pdf";
  const hideBusy = showPrintBusyOverlay("PDF 저장 중…");
  try {
    const pdf = await preparePdfDocument(options.element);
    pdf.save(filename);
  } catch (err) {
    console.error("PDF 저장 실패:", err);
    alert("PDF 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    hideBusy();
  }
}

/** @deprecated 호환용 */
export function printWithPageNumbers(options: PrintWithPageNumbersOptions = {}): void {
  if (options.saveAsPdf) {
    void downloadPdf(options);
    return;
  }
  void printDocument(options);
}
