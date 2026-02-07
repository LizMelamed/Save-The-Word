import { useEffect, useMemo, useState } from "react";
import ReadingLine from "../components/ReadingLine";
import { useReadingTracker } from "../hooks/useReadingTracker";
import { speakText } from "../utils/speech";
import { apiUrl } from "../utils/api";

const ASSESSMENT_STORIES_COUNT = 2;
const ASSESSMENT_SENTENCES = 4;
const ASSESSMENT_STORAGE_KEY = "save-the-word.assessment";
const STARS_STORAGE_KEY = "save-the-word.stars";

function computeAggregateMetrics(storyMetrics) {
  const totalWords = storyMetrics.reduce((sum, m) => sum + m.num_words, 0);
  const totalHover = storyMetrics.reduce((sum, m) => sum + m.total_hover_ms, 0);
  const totalRestores = storyMetrics.reduce((sum, m) => sum + m.num_restores, 0);
  const avgHover = totalWords > 0 ? totalHover / totalWords : 0;
  return {
    age: storyMetrics[0]?.age || 8,
    avg_hover_ms: avgHover,
    total_hover_ms: totalHover,
    num_words: totalWords,
    num_restores: totalRestores,
  };
}

function buildFeatureMap(wordFeatures, storyIndex) {
  const map = {};
  if (!Array.isArray(wordFeatures)) return map;
  wordFeatures.forEach((sentence, sentenceIdx) => {
    if (!Array.isArray(sentence)) return;
    sentence.forEach((word) => {
      const id = `${storyIndex}-${sentenceIdx}-${word.word_index}`;
      map[id] = {
        length: word.length,
        sentence_length: word.sentence_length,
        word_frequency_surprisal: word.word_frequency_surprisal,
      };
    });
  });
  return map;
}

function isPlaceholderOption(text) {
  if (!text || !String(text).trim()) return true;
  return /^option\s*\d+$/i.test(String(text).trim());
}
export default function Assessment({ profile, interests, onDone }) {
  const tracker = useReadingTracker();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [showQuestions, setShowQuestions] = useState(false);
  const [answers, setAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [storyMetrics, setStoryMetrics] = useState([]);
  const [storyResults, setStoryResults] = useState([]);
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [nextWordIndex, setNextWordIndex] = useState(0);
  const [missedIndices, setMissedIndices] = useState(new Set());

  const currentStory = stories[storyIndex];
  const currentSentences = currentStory?.sentences || [];
  const words = useMemo(() => {
    const line = currentSentences[sentenceIndex] || "";
    return line.trim().split(/\s+/);
  }, [currentSentences, sentenceIndex]);

  useEffect(() => {
    setNextWordIndex(0);
    setMissedIndices(new Set());
  }, [sentenceIndex, storyIndex]);

  async function loadStories(cancelRef) {
    try {
      const loaded = [];
      for (let i = 0; i < ASSESSMENT_STORIES_COUNT; i += 1) {
          const res = await fetch(apiUrl("/generate-story"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            age: Number(profile?.age || 8),
            interests: Array.isArray(interests) ? interests : [],
            reading_level: null,
            reading_speed_wpm: null,
            comprehension_success: null,
            num_sentences: ASSESSMENT_SENTENCES,
          }),
        });
        if (!res.ok) {
          throw new Error("story_fetch_failed");
        }
        const data = await res.json();
        const normalizedQuestions = (data.questions || []).map((q, idx) => {
          const options = Array.isArray(q.options) ? q.options : [];
          const labels = options.map((opt, optIdx) => {
            if (typeof opt === "string") return opt.trim() || "";
            if (opt && typeof opt === "object") {
              const raw = opt.label || opt.text || "";
              return raw.trim() || "";
            }
            return "";
          });
          const invalid =
            !q.text ||
            labels.length < 2 ||
            labels.some((label) => isPlaceholderOption(label));
          if (invalid) {
            throw new Error("question_invalid");
          }
          return {
            text: q.text,
            options: labels.slice(0, 2),
            correct_index:
              typeof q.correct_index === "number" ? q.correct_index : 0,
          };
        });
        loaded.push({ ...data, questions: normalizedQuestions });
      }
      if (!cancelRef.current) {
        setStories(loaded);
        setLoading(false);
        setError(null);
      }
    } catch (err) {
      if (!cancelRef.current) {
        setError("story_fetch_failed");
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const cancelRef = { current: false };
    setLoading(true);
    setError(null);
    loadStories(cancelRef);
    return () => {
      cancelRef.current = true;
    };
  }, [profile, interests]);

  async function logToBackend(payload) {
    try {
      await fetch(apiUrl("/log-session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "assessment", payload }),
      });
    } catch (err) {
      // ignore logging failures in UI
    }
  }

  async function finalizeAssessment(nextStoryMetrics, nextStoryResults) {
    const aggregate = computeAggregateMetrics(nextStoryMetrics);
    const aggregatePerWord = nextStoryResults.flatMap(
      (story) => story.per_word || []
    );
    if (aggregatePerWord.length) {
      aggregate.per_word = aggregatePerWord;
    }
    let predicted = null;
    try {
      const res = await fetch(apiUrl("/predict-reading-skill"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aggregate),
      });
      if (res.ok) {
        const data = await res.json();
        predicted = Number(data?.predicted_reading_skill);
      }
    } catch (err) {
      predicted = null;
    }
    const totalQuestions = nextStoryResults.reduce(
      (sum, r) => sum + (r.total || 0),
      0
    );
    const totalCorrect = nextStoryResults.reduce(
      (sum, r) => sum + (r.correct_count || 0),
      0
    );
    const comprehensionSuccess =
      totalQuestions > 0 ? totalCorrect / totalQuestions : null;
    const readingSpeedWpm =
      aggregate.avg_hover_ms && aggregate.avg_hover_ms > 0
        ? 60000 / aggregate.avg_hover_ms
        : null;
    const result = {
      timestamp: new Date().toISOString(),
      profile: profile || null,
      interests: Array.isArray(interests) ? interests : [],
      stories: nextStoryResults,
      story_metrics: nextStoryMetrics,
      aggregate_metrics: aggregate,
      predicted_reading_skill: predicted,
      comprehension_success: comprehensionSuccess,
      reading_speed_wpm: readingSpeedWpm,
      per_word: nextStoryResults.flatMap((story) => story.per_word || []),
    };
    localStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(result));
    setAssessmentResult(result);
    onDone?.(result);
    logToBackend(result);
    const currentStars = Number(localStorage.getItem(STARS_STORAGE_KEY)) || 0;
    localStorage.setItem(STARS_STORAGE_KEY, String(currentStars + 1));
  }

  function handleAdvanceSentence() {
    if (sentenceIndex < currentSentences.length - 1) {
      setSentenceIndex((cur) => cur + 1);
    } else {
      const metrics = tracker.computeMetrics(
        currentSentences.reduce(
          (sum, line) => sum + line.trim().split(/\s+/).length,
          0
        ),
        profile?.age
      );
      setStoryMetrics((prev) => {
        const next = [...prev];
        next[storyIndex] = metrics;
        return next;
      });
      setShowQuestions(true);
    }
  }

  function handleFinishQuestions() {
    const questions = currentStory?.questions || [];
    const correctCount = questions.filter((q, idx) => {
      const selected = answers[`${storyIndex}-${idx}`];
      return selected === q.correct_index;
    }).length;
    const total = questions.length;
    const featureMap = buildFeatureMap(currentStory?.word_features, storyIndex);
    const perWord = Object.entries(tracker.getData()).map(([id, entry]) => ({
      word_id: id,
      hover_ms: entry.total,
      wpm: entry.total > 0 ? 60000 / entry.total : null,
      ...(featureMap[id] || {}),
    }));
    const result = {
      story_index: storyIndex,
      sentences: currentStory.sentences,
      questions,
      answers: { ...answers },
      correct_count: correctCount,
      total,
      metrics: storyMetrics[storyIndex] || null,
      per_word: perWord,
      word_features: currentStory?.word_features || null,
    };
    const nextResults = [...storyResults, result];
    setStoryResults(nextResults);
    setQuizSubmitted(false);
    setAnswers({});
    setShowQuestions(false);
    setSentenceIndex(0);
    setSavedCount(0);
    tracker.reset();

    if (storyIndex < stories.length - 1) {
      setStoryIndex((cur) => cur + 1);
      return;
    }

    const metricsList = storyMetrics.filter(Boolean);
    finalizeAssessment(metricsList, nextResults);
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#E8FAFD] flex items-center justify-center">
        <div className="text-xl font-semibold text-[#1F2A44]">
          Creating assessment...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-[#E8FAFD] flex flex-col items-center justify-center gap-6">
        <div className="text-xl font-semibold text-[#1F2A44]">
          Oops, there is an issue. Click to try again.
        </div>
        <button
          className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
          onClick={() => {
            setLoading(true);
            setError(null);
            const cancelRef = { current: false };
            loadStories(cancelRef);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const questionInvalid =
    showQuestions &&
    (currentStory?.questions || []).some(
      (q) =>
        !q?.text ||
        !Array.isArray(q.options) ||
        q.options.some((opt) => isPlaceholderOption(opt))
    );

  return (
    <div className="min-h-[100dvh] bg-[#E8FAFD] flex flex-col items-center justify-center px-6 relative">
      {questionInvalid && (
        <div className="absolute inset-0 bg-[#E8FAFD]/90 flex flex-col items-center justify-center gap-6 z-50">
          <div className="text-xl font-semibold text-[#1F2A44] text-center">
            Oops, there is an issue. Click to try again.
          </div>
          <button
            className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
            onClick={() => {
              setLoading(true);
              setError(null);
              const cancelRef = { current: false };
              loadStories(cancelRef);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {!showQuestions && (
        <div className="text-center max-w-3xl">
          <p className="text-base md:text-xl mb-4 text-[#1F2A44] font-semibold">
            Assessment story {storyIndex + 1} of {stories.length}
          </p>
          <div className="flex flex-col items-center gap-2 mt-4">
        {currentSentences
          .slice(0, sentenceIndex + 1)
          .map((sentence, idx) => (
            <ReadingLine
              key={idx}
              text={sentence}
              sentenceId={`${storyIndex}-${idx}`}
              tracker={tracker}
              missedIndices={idx === sentenceIndex ? missedIndices : undefined}
              onAttemptSave={(wordId, wordIndex) => {
                if (idx !== sentenceIndex) return false;
                if (wordIndex === nextWordIndex) {
                  setNextWordIndex((cur) => cur + 1);
                  return true;
                }
                if (wordIndex > nextWordIndex) {
                  setMissedIndices((prevSet) => {
                    const next = new Set(prevSet);
                    for (let i = nextWordIndex; i < wordIndex; i += 1) {
                      next.add(i);
                    }
                    return next;
                  });
                  return false;
                }
                if (missedIndices.has(wordIndex)) {
                  setMissedIndices((prevSet) => {
                    const next = new Set(prevSet);
                    next.delete(wordIndex);
                    return next;
                  });
                  return true;
                }
                return false;
              }}
              onWordSaved={(wordId) => {
                const prefix = `${storyIndex}-${sentenceIndex}-`;
                if (!String(wordId).startsWith(prefix)) return;
                const savedInSentence = tracker
                  .getSavedWords()
                  .filter((id) => String(id).startsWith(prefix)).length;
                setSavedCount(savedInSentence);
                if (savedInSentence >= words.length) {
                  handleAdvanceSentence();
                }
              }}
            />
          ))}
          </div>
        </div>
      )}

      {showQuestions && !questionInvalid && (
        <div className="w-full max-w-4xl relative">
          <p className="text-center text-xl font-semibold text-[#1F2A44] mb-6">
            Answer the questions about the story
          </p>
          <div className="space-y-8">
            {(currentStory?.questions || []).map((q, idx) => (
              <div key={idx} className="text-center">
                <h3 className="text-2xl font-extrabold text-[#1F2A44] mb-4">
                  {q.text}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
                  {q.options.map((label, optIdx) => {
                    const selected =
                      answers[`${storyIndex}-${idx}`] === optIdx;
                    return (
                      <button
                        key={optIdx}
                        className={`rounded-full px-8 py-4 text-xl font-bold transition shadow-md ${
                          selected
                            ? "bg-[#4B50B6] text-yellow-200"
                            : "bg-[#FFE066] text-[#1F2A44] hover:bg-[#FFD84D]"
                        }`}
                        onClick={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [`${storyIndex}-${idx}`]: optIdx,
                          }))
                        }
                        disabled={quizSubmitted}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <button
            className={`mt-10 rounded-full px-16 py-4 text-2xl font-bold shadow-lg transition ${
              Object.keys(answers).filter((k) =>
                k.startsWith(`${storyIndex}-`)
              ).length === (currentStory?.questions?.length || 0)
                ? "bg-[#4B50B6] text-yellow-200 hover:bg-[#4348a3]"
                : "bg-[#8AA1D6] text-yellow-100 opacity-60 cursor-not-allowed"
            }`}
            disabled={
              Object.keys(answers).filter((k) =>
                k.startsWith(`${storyIndex}-`)
              ).length !== (currentStory?.questions?.length || 0)
            }
            onClick={() => {
              setQuizSubmitted(true);
              handleFinishQuestions();
            }}
            style={{ display: "block", marginLeft: "auto", marginRight: "auto" }}
          >
            Continue
          </button>
          <div className="absolute -bottom-16 right-0 md:right-6">
            <img
              src="/read-to-me.png"
              className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
              alt="Read To Me"
              onClick={() => {
                const qs = currentStory?.questions || [];
                const lines = qs.map((q, idx) => {
                  const opts = (q.options || [])
                    .map((opt, optIdx) => `${optIdx + 1}. ${opt}`)
                    .join(" ");
                  return `Question ${idx + 1}. ${q.text}. Options: ${opts}.`;
                });
                speakText(
                  "Answer the questions about the story. " + lines.join(" ")
                );
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
