import { useEffect, useRef, useState } from "react";

export default function WordSpan({
  word,
  wordId,
  wordIndex,
  tracker,
  fadeRate = 0.06,
  minOpacity = 0.35,
  onSaved,
  onAttemptSave,
  isMissed,
}) {
  const [opacity, setOpacity] = useState(1);
  const [isHovering, setIsHovering] = useState(false);
  const [isSaved, setIsSaved] = useState(() => tracker.isSaved?.(wordId) ?? false);
  const hoveringRef = useRef(false);
  const savedRef = useRef(isSaved);

  useEffect(() => {
    savedRef.current = isSaved;
    if (isSaved) {
      setOpacity(1);
      return undefined;
    }
    const id = setInterval(() => {
      setOpacity(o => Math.max(minOpacity, o - fadeRate));
    }, 300);
    return () => clearInterval(id);
  }, [fadeRate, minOpacity, isSaved]);

  function handleEnter() {
    setIsHovering(true);
    hoveringRef.current = true;
    tracker.startHover(wordId);
  }

  function handleLeave() {
    setIsHovering(false);
    hoveringRef.current = false;
    tracker.endHover(wordId);
  }

  function saveWord() {
    if (savedRef.current) return;
    setIsSaved(true);
    savedRef.current = true;
    tracker.saveWord?.(wordId);
    onSaved?.(wordId);
    setOpacity(1);
  }

  function handleClick() {
    if (typeof onAttemptSave === "function") {
      const allowed = onAttemptSave(wordId, wordIndex);
      if (!allowed) return;
    }
    saveWord();
  }

  return (
    <span
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onClick={handleClick}
      style={{ opacity }}
      className={`inline-block select-none cursor-pointer transition-opacity duration-200 px-3 pb-4 pt-1 text-3xl rounded-lg ${
        isMissed && !isSaved
          ? "bg-red-300/70"
          : isSaved
            ? "bg-[#1F2A44]/15"
            : "bg-[#1F2A44]/5 hover:bg-[#1F2A44]/10"
      }`}
    >
      {word}
    </span>
  );
}
