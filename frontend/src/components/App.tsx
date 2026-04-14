import { useMemo, useState } from "react";
import "./App.css";
import PdfViewer from "./PdfViewer";

type DetectedWordInfo = {
  pageNumber: number;
  original: string;
  normalized: string;
  lemmas: string[];
  x: number;
  y: number;
} | null;

type PopupState = {
  visible: boolean;
  x: number;
  y: number;
  pageNumber: number;
  original: string;
  normalized: string;
  lemmas: string[];
  meaning: string;
};

function App() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");

  const [popup, setPopup] = useState<PopupState>({
    visible: false,
    x: 0,
    y: 0,
    pageNumber: 0,
    original: "",
    normalized: "",
    lemmas: [],
    meaning: "",
  });

  const dropZoneClassName = useMemo(() => {
    return isDragOver ? "drop-zone drag-over" : "drop-zone";
  }, [isDragOver]);

  const viewerContainerClassName = useMemo(() => {
    return selectedFile ? "viewer-container" : "viewer-container hidden";
  }, [selectedFile]);

  const handleFileSelected = (file?: File | null) => {
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("PDFファイルを選択してください。");
      return;
    }

    setSelectedFile(file);
    setSelectedFileName(file.name);
    setPopup((prev) => ({ ...prev, visible: false }));
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    handleFileSelected(file);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const file = event.dataTransfer.files?.[0] ?? null;
    handleFileSelected(file);
  };

  const fetchMeaning = async (word: string) => {
    try {
      const res = await fetch(
        `http://localhost:3001/lookup?word=${encodeURIComponent(word)}`
      );
      const data = await res.json();
      return data.meaning ?? null;
    } catch (error) {
      console.error("lookup error:", error);
      return null;
    }
  };

  const handleWordDetected = async (info: DetectedWordInfo) => {
    if (!info) {
      setPopup((prev) => ({ ...prev, visible: false }));
      return;
    }

    const searchCandidates = [
      info.original,
      info.normalized,
      ...info.lemmas,
    ]
      .map((word) => word.trim().toLowerCase())
      .filter((word, index, arr) => word && arr.indexOf(word) === index);

    let meaning = "辞書に登録されていません";

    for (const candidate of searchCandidates) {
      const result = await fetchMeaning(candidate);
      if (result) {
        meaning = result;
        break;
      }
    }

    setPopup({
      visible: true,
      x: info.x,
      y: info.y,
      pageNumber: info.pageNumber,
      original: info.original,
      normalized: info.normalized,
      lemmas: info.lemmas,
      meaning,
    });
  };

  const handleClosePopup = () => {
    setPopup((prev) => ({ ...prev, visible: false }));
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>PDF 英単語クリック翻訳</h1>
        <p>PDF内の英単語をクリックすると日本語訳を表示します。</p>
      </header>

      <section
        id="dropZone"
        className={dropZoneClassName}
        aria-label="PDF drop area"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p>ここに PDF をドラッグ＆ドロップ</p>
        <p>または</p>

        <label className="file-label">
          ローカルファイルを選択
          <input
            id="fileInput"
            type="file"
            accept="application/pdf"
            onChange={handleInputChange}
          />
        </label>

        {selectedFileName && (
          <p className="selected-file-name">選択中: {selectedFileName}</p>
        )}
      </section>

      <section id="viewerContainer" className={viewerContainerClassName}>
        {selectedFile && (
          <PdfViewer file={selectedFile} onWordDetected={handleWordDetected} />
        )}
      </section>

      {popup.visible && (
        <div
          className="word-popup"
          style={{
            left: `${popup.x}px`,
            top: `${popup.y - 16}px`,
            transform: "translate(-50%, -100%)",
          }}
          onClick={handleClosePopup}
        >
          <div>
            <strong>{popup.original}</strong>
          </div>
          <div>Normalized: {popup.normalized || "(空)"}</div>
          <div>
            Lemmas: {popup.lemmas.length > 0 ? popup.lemmas.join(", ") : "(空)"}
          </div>
          <div>訳: {popup.meaning}</div>
          <div>Page: {popup.pageNumber}</div>
        </div>
      )}
    </main>
  );
}

export default App;