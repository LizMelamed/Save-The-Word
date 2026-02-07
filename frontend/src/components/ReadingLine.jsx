import WordSpan from "./WordSpan";

export default function ReadingLine({
  text,
  tracker,
  fadeRate,
  onWordSaved,
  onAttemptSave,
  sentenceId,
  missedIndices,
}) {
  const words = text.split(" ");

  return (
    <div className="flex flex-wrap md:flex-nowrap justify-center mt-6 w-full">
      {words.map((w, i) => (
        <WordSpan
          key={i}
          word={w}
          wordId={`${sentenceId}-${i}`}
          wordIndex={i}
          tracker={tracker}
          fadeRate={fadeRate}
          onSaved={onWordSaved}
          onAttemptSave={onAttemptSave}
          isMissed={missedIndices?.has(i)}
        />
      ))}
    </div>
  );
}
