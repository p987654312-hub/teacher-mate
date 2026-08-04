"use client";

import { useEffect } from "react";

const STYLE_ID = "tm-print-page-style";

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

/** 앱 전역 인쇄 쪽번호·여백 스타일 주입 (Ctrl+P 대비) */
export default function PrintPageNumbers() {
  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.setAttribute("media", "print");
      document.head.appendChild(style);
    }
    style.textContent = PRINT_PAGE_CSS;
  }, []);

  return null;
}
