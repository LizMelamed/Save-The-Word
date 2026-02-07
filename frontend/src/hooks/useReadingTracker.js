import { useRef } from "react";

export function useReadingTracker() {
  const hoverTimes = useRef({});
  const savedWords = useRef(new Set());
  const restoreCount = useRef(0);

  function startHover(id) {
    hoverTimes.current[id] ??= { total: 0, lastStart: 0 };
    hoverTimes.current[id].lastStart = performance.now();
  }

  function endHover(id) {
    const entry = hoverTimes.current[id];
    if (!entry || !entry.lastStart) return;
    entry.total += performance.now() - entry.lastStart;
    entry.lastStart = 0;
  }

  function getData() {
    return hoverTimes.current;
  }

  function saveWord(id) {
    if (!savedWords.current.has(id)) {
      savedWords.current.add(id);
      restoreCount.current += 1;
    }
  }

  function isSaved(id) {
    return savedWords.current.has(id);
  }

  function getSavedWords() {
    return Array.from(savedWords.current);
  }

  function getSavedCount() {
    return savedWords.current.size;
  }

  function getRestoreCount() {
    return restoreCount.current;
  }

  function computeMetrics(numWords, age) {
    const now = performance.now();
    let totalHover = 0;
    for (const entry of Object.values(hoverTimes.current)) {
      if (!entry) continue;
      const active = entry.lastStart ? now - entry.lastStart : 0;
      totalHover += entry.total + active;
    }
    const safeNumWords = Math.max(1, numWords);
    return {
      age: Number(age) || 8,
      avg_hover_ms: totalHover / safeNumWords,
      total_hover_ms: totalHover,
      num_words: safeNumWords,
      num_restores: restoreCount.current,
    };
  }

  function reset() {
    hoverTimes.current = {};
    savedWords.current = new Set();
    restoreCount.current = 0;
  }

  return {
    startHover,
    endHover,
    getData,
    saveWord,
    isSaved,
    getSavedWords,
    getSavedCount,
    getRestoreCount,
    computeMetrics,
    reset,
  };
}
