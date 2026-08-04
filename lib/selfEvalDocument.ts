import { downloadPdf, printDocument } from "@/lib/printWithPageNumbers";

export const SELF_EVAL_PERIOD = "2026년 3월 1일부터 2027년 2월 28일까지(학년도 단위)";

export type SelfEvalFormLike = Record<string, unknown> | null | undefined;

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blockLines(s: unknown) {
  return (
    String(s ?? "")
      .trim()
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => `<p class="bul">- ${esc(l.trim())}</p>`)
      .join("") || '<p class="bul">- </p>'
  );
}

/** 작성일 표시용 — dateYear/year 등 키 혼용 보정 */
export function formatSelfEvalDate(f: SelfEvalFormLike): string {
  if (!f) return "년 월 일";
  const rawY = f.dateYear ?? (f as { year?: unknown }).year ?? "";
  const rawM = f.dateMonth ?? (f as { month?: unknown }).month ?? "";
  const rawD = f.dateDay ?? (f as { day?: unknown }).day ?? "";
  // 숫자로 저장된 경우·공백·전각 숫자 대비
  const y = String(rawY).replace(/[^\d]/g, "").trim();
  const m = String(rawM).replace(/[^\d]/g, "").trim();
  const d = String(rawD).replace(/[^\d]/g, "").trim();
  return `${y}년 ${m}월 ${d}일`;
}

/** 교사 자기실적평가서 HTML (미리보기·캡처 공용) */
export function buildSelfEvalHtml(f: SelfEvalFormLike): string {
  if (!f) return "";
  const homeroomLabel =
    f.isHomeroom === "예" ? "담임교사" : f.isHomeroom === "아니오" ? "해당 없음" : esc(f.isHomeroom);
  const positionLabel =
    f.isPositionTeacher === "예"
      ? "보직교사"
      : f.isPositionTeacher === "아니오"
        ? "해당 없음"
        : esc(f.isPositionTeacher);
  const sel = (val: unknown, opt: string) => (val === opt ? "○" : "");
  const dateLabel = formatSelfEvalDate(f);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>교사 자기실적평가서</title><style>
      body{font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;font-size:11px;line-height:1.4;max-width:700px;margin:20px auto;padding:18px;color:#000;}
      .outer{border:3px solid #000;padding:20px;overflow:visible;}
      .sub{font-size:10px;color:#333;margin-bottom:4px;}
      h1{text-align:center;font-size:16px;font-weight:bold;margin:0 0 16px 0;}
      .sec{margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #000;}
      .sec:last-of-type{border-bottom:none;}
      .sec h2{font-size:11px;font-weight:bold;margin:0 0 6px 0;}
      .sec p{margin:2px 0;}
      .bul{margin:2px 0 2px 16px;padding:0;}
      .twocol{display:flex;gap:0;border:1px solid #000;}
      .twocol .col{flex:1;padding:8px 10px;border-right:1px solid #000;}
      .twocol .col:last-child{border-right:none;}
      .twocol .row{margin:4px 0;}
      .eval-item{margin:10px 0 6px 0;}
      .eval-item .tit{font-weight:bold;margin-bottom:4px;}
      .eval-item .cap{margin:4px 0 2px 0;}
      table.rating{border-collapse:collapse;width:100%;margin:8px 0;font-size:10px;}
      table.rating th,table.rating td{border:1px solid #000;padding:4px 6px;vertical-align:middle;}
      table.rating th{background:#f5f5f5;}
      table.rating .col-group{width:42px;text-align:center;font-weight:bold;}
      table.rating .col-item{width:90px;}
      table.rating .col-desc{min-width:180px;}
      table.rating .col-opt{width:42px;text-align:center;}
      .footer{margin-top:20px;padding-top:14px;overflow:visible;}
      .footer-date{margin-bottom:10px;text-align:right;white-space:nowrap;overflow:visible;padding-right:2px;}
      .footer-row{display:flex;align-items:center;flex-wrap:wrap;gap:4px 0;}
      .footer .label{font-weight:normal;}
      .footer .line{display:inline-block;min-width:100px;border-bottom:1px solid #000;margin-left:4px;}
    </style></head><body><div class="outer">
      <p class="sub">교육공무원 승진규정 [별지 제3호의2서식]</p>
      <h1>교사 자기실적평가서</h1>
      <div class="sec">
        <h2>1. 평가 지침</h2>
        <p>근무성적평정의 신뢰성과 타당성이 보장되도록 객관적 근거에 따라 종합적으로 평가하여야 한다.</p>
      </div>
      <div class="sec">
        <h2>2. 평가 기간:</h2>
        <p>${esc(SELF_EVAL_PERIOD)}</p>
      </div>
      <div class="sec">
        <h2>3. 평가자 인적사항</h2>
        <p>○ 소속: ${esc(f.affiliation)} &nbsp; ○ 직위: ${esc(f.position)} &nbsp; ○ 성명: ${esc(f.evaluatorName)}</p>
      </div>
      <div class="sec">
        <h2>4. 평가자 기초 자료</h2>
        <div class="twocol">
          <div class="col">
            <div class="row">○ 담당 학년 및 학급: ${esc(f.gradeClass)}</div>
            <div class="row">○ 담당 과목: ${esc(f.subject)}</div>
            <div class="row">○ 담임 여부: ${homeroomLabel}</div>
            <div class="row">○ 담당 업무: ${esc(f.assignedDuties)}</div>
            <div class="row">○ 보직교사 여부: ${positionLabel}</div>
            <div class="row">○ 주당 수업시간 수: ${esc(f.hoursPerWeek)}</div>
          </div>
          <div class="col">
            <div class="row">○ 연간 수업공개 실적: ${esc(f.openClassResult)}</div>
            <div class="row">○ 연간 학생 상담 실적: ${esc(f.studentCounselResult)}</div>
            <div class="row">○ 연간 학부모 상담 실적: ${esc(f.parentCounselResult)}</div>
            <div class="row">○ 그 밖의 실적 사항: ${esc(f.otherResult)}</div>
          </div>
        </div>
      </div>
      <div class="sec">
        <h2>5. 자기실적 평가</h2>
        <div class="eval-item">
          <p class="tit">가. 학습지도</p>
          <p class="cap">○ 학습지도 추진 목표(학년 초에 계획되었던 학습지도 목표)</p>
          ${blockLines(f.learningGoal)}
          <p class="cap">○ 학습지도 추진 실적(학년 초에 목표한 내용과 대비하여 추진 실적을 구체적으로 작성)</p>
          ${blockLines(f.learningResult)}
        </div>
        <div class="eval-item">
          <p class="tit">나. 생활지도</p>
          <p class="cap">○ 생활지도 추진 목표</p>
          ${blockLines(f.lifeGoal)}
          <p class="cap">○ 생활지도 추진 실적</p>
          ${blockLines(f.lifeResult)}
        </div>
        <div class="eval-item">
          <p class="tit">다. 전문성계발</p>
          <p class="cap">○ 전문성개발 추진 목표:</p>
          ${blockLines(f.professionalGoal)}
          <p class="cap">○ 전문성개발 추진 실적:</p>
          ${blockLines(f.professionalResult)}
        </div>
        <div class="eval-item">
          <p class="tit">라. 담당 업무</p>
          <p class="cap">○ 담당 업무 추진 목표:</p>
          ${blockLines(f.dutyGoal)}
          <p class="cap">○ 담당 업무 추진 실적:</p>
          ${blockLines(f.dutyResult)}
          <p class="cap">○ 창의적 업무개선 사항:</p>
          ${blockLines(f.creativeImprovement)}
        </div>
      </div>
      <div class="sec">
        <h2>※ 자기 평가 종합 상황</h2>
        <table class="rating">
          <thead>
            <tr><th class="col-group"></th><th class="col-item">평가 항목</th><th class="col-desc">세부 내용</th><th class="col-opt">만족</th><th class="col-opt">보통</th><th class="col-opt">미흡</th></tr>
          </thead>
          <tbody>
            <tr><td class="col-group" rowspan="4">자기<br>평가</td><td class="col-item">목표달성도</td><td class="col-desc">설정한 목표에 대한 달성 정도</td><td class="col-opt">${sel(f.goalAchievement, "만족")}</td><td class="col-opt">${sel(f.goalAchievement, "보통")}</td><td class="col-opt">${sel(f.goalAchievement, "미흡")}</td></tr>
            <tr><td class="col-item">창의성</td><td class="col-desc">학습지도, 생활지도, 전문성계발, 담당 업무 등의 창의적인 수행 정도</td><td class="col-opt">${sel(f.creativity, "만족")}</td><td class="col-opt">${sel(f.creativity, "보통")}</td><td class="col-opt">${sel(f.creativity, "미흡")}</td></tr>
            <tr><td class="col-item">적시성</td><td class="col-desc">학습지도, 생활지도, 전문성계발, 담당 업무 등을 기한 내에 효과적으로 처리한 정도</td><td class="col-opt">${sel(f.timeliness, "만족")}</td><td class="col-opt">${sel(f.timeliness, "보통")}</td><td class="col-opt">${sel(f.timeliness, "미흡")}</td></tr>
            <tr><td class="col-item">노력도</td><td class="col-desc">목표 달성을 위한 노력, 공헌도</td><td class="col-opt">${sel(f.effort, "만족")}</td><td class="col-opt">${sel(f.effort, "보통")}</td><td class="col-opt">${sel(f.effort, "미흡")}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="footer">
        <div class="footer-date">${esc(dateLabel)}</div>
        <div class="footer-row">
          <span class="label">작성자(본인) 성명</span><span class="line">${esc(f.preparerName)}</span>
          <span class="label" style="margin-left:20px">서명(인)</span><span class="line"></span>
        </div>
      </div>
    </div></body></html>`;
}

function mountSelfEvalForCapture(html: string): { host: HTMLElement; cleanup: () => void } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const styleText = (doc.querySelector("style")?.textContent ?? "")
    .replace(/@page\s*\{[\s\S]*?\n\s*\}/g, "")
    .replace(/\bbody\s*\{/g, ".self-eval-print-root{");

  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-self-eval-print", "1");
  styleEl.textContent = styleText;
  document.head.appendChild(styleEl);

  const host = document.createElement("div");
  host.className = "print-content-area self-eval-print-root";
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:190mm;max-width:190mm;background:#fff;z-index:-1;pointer-events:none;margin:0;padding:8mm 6mm;overflow:visible;";

  const outer = doc.querySelector(".outer");
  if (outer) {
    host.appendChild(document.importNode(outer, true));
  } else {
    host.innerHTML = doc.body.innerHTML;
  }
  document.body.appendChild(host);

  return {
    host,
    cleanup: () => {
      host.remove();
      document.querySelectorAll("[data-self-eval-print='1']").forEach((el) => el.remove());
    },
  };
}

async function withMountedSelfEval(
  form: SelfEvalFormLike,
  run: (host: HTMLElement) => Promise<void>
): Promise<void> {
  const html = buildSelfEvalHtml(form);
  if (!html) {
    alert("저장된 자기실적평가서 데이터가 없습니다.");
    return;
  }
  const { host, cleanup } = mountSelfEvalForCapture(html);
  try {
    await new Promise<void>((r) => window.setTimeout(r, 120));
    await run(host);
  } finally {
    cleanup();
  }
}

/** 다른 보고서와 동일: 캡처 PDF 다운로드(쪽번호·여백 포함) */
export async function downloadSelfEvalPdf(
  form: SelfEvalFormLike,
  filename = "교사_자기실적평가서.pdf"
): Promise<void> {
  await withMountedSelfEval(form, (host) => downloadPdf({ element: host, filename }));
}

/** 다른 보고서와 동일: 캡처본으로 인쇄 대화상자 */
export async function printSelfEvalDocument(form: SelfEvalFormLike): Promise<void> {
  await withMountedSelfEval(form, (host) => printDocument({ element: host }));
}
