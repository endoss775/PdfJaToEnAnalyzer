import { useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

type WordBox = {
  pageNumber: number;
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DetectedWordInfo = {
  pageNumber: number;
  original: string;
  normalized: string;
  lemmas: string[];
  x: number;
  y: number;
};

type PdfViewerProps = {
  file: File;
  onWordDetected: (info: DetectedWordInfo | null) => void;
};

function normalizeWord(rawWord: string) {
  return rawWord.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function getLemmaCandidates(word: string): string[] {
  const candidates = new Set<string>();

  if (!word) return [];

  candidates.add(word);

  const irregular: Record<string, string> = {
    running: "run",
    ran: "run",
    studies: "study",
    studied: "study",
    went: "go",
    gone: "go",
    children: "child",
    mice: "mouse",
    better: "good",
    best: "good",
  };

  if (irregular[word]) {
    candidates.add(irregular[word]);
    return [...candidates];
  }

  if (word.endsWith("ies") && word.length > 3) {
    candidates.add(word.slice(0, -3) + "y");
  }

  if (word.endsWith("ing") && word.length > 5) {
    const base = word.slice(0, -3);

    candidates.add(base);

    if (base.length > 2 && base.at(-1) === base.at(-2)) {
      candidates.add(base.slice(0, -1));
    }

    candidates.add(base + "e");
  }

  if (word.endsWith("ied") && word.length > 4) {
    candidates.add(word.slice(0, -3) + "y");
  } else if (word.endsWith("ed") && word.length > 3) {
    const base = word.slice(0, -2);

    // walked -> walk
    candidates.add(base);

    // liked -> like, used -> use, saved -> save
    candidates.add(base + "e");

    // stopped -> stop
    if (base.length > 2 && base.at(-1) === base.at(-2)) {
      candidates.add(base.slice(0, -1));
    }
  }

  if (
    word.length > 4 &&
    (
      word.endsWith("ches") ||
      word.endsWith("shes") ||
      word.endsWith("sses") ||
      word.endsWith("xes") ||
      word.endsWith("zes") ||
      word.endsWith("oes")
    )
  ) {
    candidates.add(word.slice(0, -2));
  }

  if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) {
    candidates.add(word.slice(0, -1));
  }

  return [...candidates];
}

function PdfViewer({ file, onWordDetected }: PdfViewerProps) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const wordBoxesRef = useRef<WordBox[]>([]);

  useEffect(() => {
    const renderPdf = async () => {
      if (!viewerRef.current) return;

      const viewer = viewerRef.current;
      viewer.innerHTML = "";
      wordBoxesRef.current = [];

      const data = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdfDoc = await loadingTask.promise;

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });

        const pageWrapper = document.createElement("div");
        pageWrapper.className = "page";
        pageWrapper.style.width = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;
        pageWrapper.dataset.pageNumber = String(pageNum);

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) continue;

        pageWrapper.appendChild(canvas);
        viewer.appendChild(pageWrapper);

        await page.render({
          canvas,
          canvasContext,
          viewport,
        }).promise;

        const textContent = await page.getTextContent();

        for (const item of textContent.items as any[]) {
          if (!item?.str) continue;

          const rawText = String(item.str);
          if (!/[A-Za-z]/.test(rawText)) continue;

          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const baseX = tx[4];
          const baseY = tx[5];

          const height =
            Math.abs(item.height ? item.height * viewport.scale : tx[3]) || 12;

          const totalWidth =
            typeof item.width === "number"
              ? item.width * viewport.scale
              : rawText.length * height * 0.5;

          const parts = rawText
            .split(/(\s+)/)
            .filter((part: string) => part.length > 0);

          const totalChars = parts.reduce(
            (sum: number, part: string) => sum + part.length,
            0
          );

          let cursorX = baseX;

          for (const part of parts) {
            const partWidth =
              totalChars > 0 ? (totalWidth * part.length) / totalChars : 0;

            const cleaned = part.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");

            if (cleaned && /[A-Za-z]/.test(cleaned)) {
              wordBoxesRef.current.push({
                pageNumber: pageNum,
                str: cleaned,
                x: cursorX,
                y: baseY - height,
                width: partWidth,
                height,
              });
            }

            cursorX += partWidth;
          }
        }
      }
    };

    renderPdf().catch((error) => {
      console.error("PDF render error:", error);
      alert("PDFの表示に失敗しました。");
    });
  }, [file]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const pageElement = target.closest(".page") as HTMLDivElement | null;

    if (!pageElement) {
      onWordDetected(null);
      return;
    }

    const pageNumber = Number(pageElement.dataset.pageNumber ?? "0");
    const rect = pageElement.getBoundingClientRect();

    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    const candidates = wordBoxesRef.current.filter(
      (box) =>
        box.pageNumber === pageNumber &&
        localX >= box.x &&
        localX <= box.x + box.width &&
        localY >= box.y &&
        localY <= box.y + box.height
    );

    if (candidates.length === 0) {
      onWordDetected(null);
      return;
    }

    const hit = candidates.sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      return areaA - areaB;
    })[0];

    const normalized = normalizeWord(hit.str);
    const lemmas = getLemmaCandidates(normalized);

    const popupX = rect.left + hit.x + hit.width / 2;
    const popupY = rect.top + hit.y;

    onWordDetected({
      pageNumber,
      original: hit.str,
      normalized,
      lemmas,
      x: Math.round(popupX),
      y: Math.round(popupY),
    });
  };

  return (
    <div className="pdf-viewer" ref={viewerRef} onClick={handleClick}></div>
  );
}

export default PdfViewer;