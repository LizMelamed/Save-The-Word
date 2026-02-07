import { useEffect, useMemo, useRef, useState } from "react";
import ReadingLine from "../components/ReadingLine";
import { useReadingTracker } from "../hooks/useReadingTracker";
import { speakText } from "../utils/speech";
import { apiUrl } from "../utils/api";

const DEFAULT_STORY = [
  "Luna the unicorn lived near a green hill.",
  "She liked to walk slowly and look at the flowers.",
  "One day, she saw a blue butterfly on a pink flower.",
  "Luna stayed very quiet so the butterfly would not fly away.",
  "The butterfly flapped its wings and stayed with her.",
];

const FADE_RATE_STORAGE_KEY = "save-the-word.fadeRate";
const SESSIONS_STORAGE_KEY = "save-the-word.sessions";
const STARS_STORAGE_KEY = "save-the-word.stars";
const SKILL_RANGE = { min: -90.8, max: 70.0 };

const DEFAULT_QUESTIONS = [
  {
    id: "q1",
    text: "Where did Luna the unicorn live?",
    options: [
      { id: "q1a", label: "Near a green hill", correct: true },
      { id: "q1b", label: "On the moon", correct: false },
    ],
  },
  {
    id: "q2",
    text: "Why was Luna quiet?",
    options: [
      { id: "q2a", label: "So the butterfly won’t fly away", correct: true },
      { id: "q2b", label: "Her mom told her to be quiet", correct: false },
    ],
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fadeRateFromSkill(skill) {
  const t = clamp(
    (skill - SKILL_RANGE.min) / (SKILL_RANGE.max - SKILL_RANGE.min),
    0,
    1
  );
  const minRate = 0.008;
  const maxRate = 0.028;
  return minRate + t * (maxRate - minRate);
}

function estimateSkillFromHover(metrics) {
  const ms = metrics.avg_hover_ms || 0;
  const slow = 1200;
  const fast = 250;
  const t = clamp((slow - ms) / (slow - fast), 0, 1);
  return SKILL_RANGE.min + t * (SKILL_RANGE.max - SKILL_RANGE.min);
}

function isPlaceholderOption(text) {
  if (!text || !String(text).trim()) return true;
  return /^option\s*\d+$/i.test(String(text).trim());
}

function getOptionLabel(opt) {
  if (opt && typeof opt === "object") {
    return opt.label || "";
  }
  if (typeof opt === "string") return opt;
  return "";
}

export default function ReadingDemo({
  onBack,
  onRead,
  profile,
  interests,
  story: storyProp,
  questions: questionsProp,
  storyMeta,
  storyLoading,
  storyError,
  onFinishDemo,
}) {
  const tracker = useReadingTracker();
  const [story, setStory] = useState(storyProp || DEFAULT_STORY);
  const [questions, setQuestions] = useState(
    questionsProp || DEFAULT_QUESTIONS
  );
  const [storyWordFeatures, setStoryWordFeatures] = useState(
    storyMeta?.word_features || null
  );
  const [storyLoaded, setStoryLoaded] = useState(false);
  const [storyLocked, setStoryLocked] = useState(false);
  const [storyFetchError, setStoryFetchError] = useState(false);
  const [questionError, setQuestionError] = useState(false);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const words = useMemo(
    () => story[sentenceIndex].trim().split(/\s+/),
    [sentenceIndex, story]
  );
  const totalWords = useMemo(
    () =>
      story.reduce(
        (sum, line) => sum + line.trim().split(/\s+/).length,
        0
      ),
    [story]
  );
  const [savedCount, setSavedCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [fadeRate, setFadeRate] = useState(() => {
    const stored = Number(localStorage.getItem(FADE_RATE_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0.015;
  });
  const [showOverlay, setShowOverlay] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [stars, setStars] = useState(() => {
    const stored = Number(localStorage.getItem(STARS_STORAGE_KEY));
    return Number.isFinite(stored) ? stored : 0;
  });
  const [storyStarAwarded, setStoryStarAwarded] = useState(false);
  const [quizStarAwarded, setQuizStarAwarded] = useState(false);
  const [answers, setAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizAllCorrect, setQuizAllCorrect] = useState(false);
  const [hasStartedReading, setHasStartedReading] = useState(false);
  const [nextWordIndex, setNextWordIndex] = useState(0);
  const [missedIndices, setMissedIndices] = useState(new Set());
  const storyLockRef = useRef(false);

  function fetchStory(force = false) {
    if (!profile?.age || (!force && storyLoaded && !questionError)) return;
    const prev = JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]");
    const lastSkill = prev.length ? prev[prev.length - 1].predicted_reading_skill : null;
    setStoryFetchError(false);
    setQuestionError(false);

    fetch(apiUrl("/generate-story"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age: Number(profile.age),
        interests: Array.isArray(interests) ? interests : [],
        reading_level: Number.isFinite(lastSkill) ? lastSkill : null,
        num_sentences: DEFAULT_STORY.length,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.sentences?.length || !data?.questions?.length) {
          setStoryFetchError(true);
          setStoryLoaded(true);
          return;
        }
        const invalid = data.questions.some(
          (q) =>
            !q ||
            !q.text ||
            !Array.isArray(q.options) ||
            q.options.some((opt) => isPlaceholderOption(getOptionLabel(opt)))
        );
        if (invalid) {
          setQuestionError(true);
          setStoryLoaded(true);
          return;
        }
        if (!storyLockRef.current && !storyLocked && !hasStartedReading) {
          setStory(data.sentences);
          setStoryLocked(true);
          storyLockRef.current = true;
        }
        if (Array.isArray(data.questions)) {
          const normalized = data.questions.map((q, idx) => {
            const rawOptions = Array.isArray(q.options) ? q.options : [];
            const labels = rawOptions.map((label) =>
              typeof label === "string" ? label.trim() : ""
            );
            while (labels.length < 2) {
              labels.push("");
            }
            return {
              id: `q${idx + 1}`,
              text: q.text || "",
              options: labels.slice(0, 2).map((label, optIdx) => ({
                id: `q${idx + 1}o${optIdx + 1}`,
                label,
                correct: optIdx === q.correct_index,
              })),
            };
          });
          setQuestions(normalized);
        }
        if (data?.word_features?.length) {
          setStoryWordFeatures(data.word_features);
        }
        setQuestionError(false);
        setStoryLoaded(true);
      })
      .catch(() => {
        setStoryFetchError(true);
        setStoryLoaded(true);
      });
  }

  useEffect(() => {
    if (sentenceIndex > 0) return;
    if (storyProp?.length) {
      if (!storyLockRef.current && !storyLocked && !hasStartedReading) {
        setStory(storyProp);
        setStoryLocked(true);
        storyLockRef.current = true;
      }
      setStoryLoaded(true);
    }
    if (questionsProp?.length) {
      const normalized = questionsProp.map((q, idx) => {
        const rawOptions = Array.isArray(q.options) ? q.options : [];
        const labels = rawOptions.map((label) =>
          typeof label === "string" ? label.trim() : ""
        );
        while (labels.length < 2) {
          labels.push("");
        }
        return {
          id: `q${idx + 1}`,
          text: q.text || "",
          options: labels.slice(0, 2).map((label, optIdx) => ({
            id: `q${idx + 1}o${optIdx + 1}`,
            label,
            correct: optIdx === q.correct_index,
          })),
        };
      });
      const invalid = normalized.some(
        (q) =>
          !q.text ||
          q.options.some((opt) => isPlaceholderOption(getOptionLabel(opt)))
      );
      if (invalid) {
        setQuestionError(true);
        setStoryLoaded(true);
      } else {
        setQuestionError(false);
        setQuestions(normalized);
      }
    }
    if (storyMeta?.word_features?.length) {
      setStoryWordFeatures(storyMeta.word_features);
    }
  }, [
    storyProp,
    questionsProp,
    storyLocked,
    sentenceIndex,
    hasStartedReading,
    storyMeta,
  ]);

  useEffect(() => {
    if (!profile?.age) return;
    if (storyProp?.length && questionsProp?.length) return;
    if (storyLoaded || storyFetchError || questionError) return;
    fetchStory();
  }, [
    profile,
    storyProp,
    questionsProp,
    storyLoaded,
    storyFetchError,
    questionError,
  ]);

  useEffect(() => {
    setNextWordIndex(0);
    setMissedIndices(new Set());
  }, [sentenceIndex]);

  useEffect(() => {
    if (completed && !showQuestions && !showOverlay && !questionError) {
      setShowOverlay(true);
    }
  }, [completed, showQuestions, showOverlay, questionError]);

  function addStar(reason) {
    setStars((prev) => {
      const next = prev + 1;
      localStorage.setItem(STARS_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function finalizeSession() {
    const metrics = tracker.computeMetrics(totalWords, profile?.age);
    let skill = null;
    const featureById = {};
    if (Array.isArray(storyWordFeatures)) {
      storyWordFeatures.forEach((sentence, sentenceIdx) => {
        if (!Array.isArray(sentence)) return;
        sentence.forEach((word) => {
          const id = `${sentenceIdx}-${word.word_index}`;
          featureById[id] = {
            length: word.length,
            sentence_length: word.sentence_length,
            word_frequency_surprisal: word.word_frequency_surprisal,
          };
        });
      });
    }
    const perWord = Object.entries(tracker.getData()).map(([id, entry]) => ({
      word_id: id,
      hover_ms: entry.total,
      wpm: entry.total > 0 ? 60000 / entry.total : null,
      ...(featureById[id] || {}),
    }));
    if (perWord.length) {
      metrics.per_word = perWord;
    }

    try {
      const res = await fetch(apiUrl("/predict-reading-skill"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metrics),
      });
      if (res.ok) {
        const data = await res.json();
        skill = Number(data?.predicted_reading_skill);
      }
    } catch (err) {
      skill = null;
    }

    if (!Number.isFinite(skill)) {
      skill = estimateSkillFromHover(metrics);
    }

    const nextFadeRate = fadeRateFromSkill(skill);
    setFadeRate(nextFadeRate);
    localStorage.setItem(FADE_RATE_STORAGE_KEY, String(nextFadeRate));

    const readingSpeedWpm =
      metrics.avg_hover_ms && metrics.avg_hover_ms > 0
        ? 60000 / metrics.avg_hover_ms
        : null;

    const perWordLogs = perWord.length
      ? perWord
      : Object.entries(tracker.getData()).map(([id, entry]) => ({
          word_id: id,
          hover_ms: entry.total,
          wpm: entry.total > 0 ? 60000 / entry.total : null,
        }));

    const prev = JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]");
    const session = {
      timestamp: new Date().toISOString(),
      profile: profile || null,
      interests: Array.isArray(interests) ? interests : [],
      metrics,
      reading_speed_wpm: readingSpeedWpm,
      model_inputs: {
        age: profile?.age ? Number(profile.age) : null,
        interests: Array.isArray(interests) ? interests : [],
        reading_level: skill,
        reading_speed_wpm: readingSpeedWpm,
        comprehension_success: null,
      },
      model_outputs: {
        predicted_reading_skill: skill,
        fade_rate: nextFadeRate,
      },
      story_generation: storyMeta || null,
      story,
      hover_times: tracker.getData(),
      per_word: perWordLogs,
      saved_words: tracker.getSavedWords(),
      quiz: null,
      questions,
    };
    localStorage.setItem(
      SESSIONS_STORAGE_KEY,
      JSON.stringify([...prev, session])
    );
  }

  function updateLastSessionQuiz(result) {
    const prev = JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]");
    if (!prev.length) return;
    const last = { ...prev[prev.length - 1], quiz: result };
    const next = [...prev.slice(0, -1), last];
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(next));
  }

  return (
    <div className="relative min-h-full bg-[#E8FAFD] flex flex-col items-center justify-center text-[#1F2A44] px-4 py-4">

      <div className="absolute top-3 left-3 md:top-5 md:left-5">
        <img src="/logo.png" className="w-[180px] md:w-[240px]" />
      </div>

      <div className="absolute top-4 right-4 md:top-6 md:right-6 flex flex-col items-center text-[#1F2A44]">
        <div className="text-4xl">⭐</div>
        <div className="text-lg font-bold mt-1">MY STARS</div>
        <div className="text-2xl font-extrabold">{stars}</div>
      </div>

      {storyFetchError && (
        <div className="absolute inset-0 bg-[#E8FAFD]/90 flex flex-col items-center justify-center gap-6 z-50">
          <div className="text-xl font-semibold text-[#1F2A44] text-center">
            Story failed to load.
          </div>
          <button
            className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
            onClick={() => {
              setStoryLoaded(false);
              fetchStory();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {questionError && (
        <div className="absolute inset-0 bg-[#E8FAFD]/90 flex flex-col items-center justify-center gap-6 z-50">
          <div className="text-xl font-semibold text-[#1F2A44] text-center">
            Oops, there is an issue. Click to try again.
          </div>
          <button
            className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
            onClick={() => {
              setStoryLoaded(false);
              setQuestionError(false);
              setShowQuestions(false);
              setCompleted(false);
              setSentenceIndex(0);
              setSavedCount(0);
              setAnswers({});
              setQuizSubmitted(false);
              setQuizAllCorrect(false);
              setNextWordIndex(0);
              setMissedIndices(new Set());
              tracker.reset();
              fetchStory();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {showQuestions &&
        questions.some(
          (q) =>
            !q?.text ||
            !Array.isArray(q.options) ||
            q.options.some((opt) => isPlaceholderOption(getOptionLabel(opt)))
        ) && (
          <div className="absolute inset-0 bg-[#E8FAFD]/90 flex flex-col items-center justify-center gap-6 z-50">
            <div className="text-xl font-semibold text-[#1F2A44] text-center">
              Oops, there is an issue. Click to try again.
            </div>
            <button
              className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
              onClick={() => {
                setStoryLoaded(false);
                setQuestionError(false);
                setShowQuestions(false);
                setCompleted(false);
                setSentenceIndex(0);
                setSavedCount(0);
                setAnswers({});
                setQuizSubmitted(false);
                setQuizAllCorrect(false);
                setNextWordIndex(0);
                setMissedIndices(new Set());
                tracker.reset();
                fetchStory();
              }}
            >
              Try again
            </button>
          </div>
        )}

      <div className="text-center max-w-3xl">
        <p className="text-base md:text-xl mb-4">
          Click on the gray box under each word, in order, as you read out loud.
          Read as fast as you can so the words do not fade, but make sure you understand.
          If a word starts to fade, click its gray box to save it.
        </p>

        {!showQuestions && (
          <div className="flex flex-col items-center gap-2 mt-6">
          {story.slice(0, sentenceIndex + 1).map((sentence, idx) => (
            <ReadingLine
              key={idx}
              text={sentence}
              sentenceId={idx}
              tracker={tracker}
              fadeRate={fadeRate}
              missedIndices={idx === sentenceIndex ? missedIndices : undefined}
              onAttemptSave={(wordId, wordIndex) => {
                if (idx !== sentenceIndex) return false;
                if (!hasStartedReading) {
                  setHasStartedReading(true);
                  setStoryLocked(true);
                  storyLockRef.current = true;
                }
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
                if (idx !== sentenceIndex) return;
                const prefix = `${sentenceIndex}-`;
                if (!String(wordId).startsWith(prefix)) return;
                const savedInSentence = tracker
                  .getSavedWords()
                  .filter((id) => String(id).startsWith(prefix)).length;
                setSavedCount(savedInSentence);
                  if (savedInSentence >= words.length) {
                    if (sentenceIndex < story.length - 1) {
                      setSentenceIndex((cur) => cur + 1);
                      setSavedCount(0);
                    } else if (!completed) {
                      setCompleted(true);
                      finalizeSession();
                      setShowOverlay(true);
                    }
                  }
                }}
              />
            ))}
          </div>
        )}

        {completed && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <p className="text-base md:text-lg">
              Great job! Your reading speed has been updated.
            </p>
            {!showQuestions && !showOverlay && (
              <button
                className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-8 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
                onClick={() => setShowOverlay(true)}
              >
                Continue
              </button>
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-3 md:bottom-5 md:left-5">
        <img src="/go-back.png" className="w-[100px] md:w-[140px] cursor-pointer" onClick={onBack} />
      </div>

      {showQuestions && (
        <div className="absolute bottom-3 right-3 md:bottom-5 md:right-5">
          <img
            src="/read-to-me.png"
            className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
            alt="Read To Me"
            onClick={() => {
              const lines = questions.map((q, idx) => {
                const opts = q.options
                  .map((opt, optIdx) => `${optIdx + 1}. ${opt.label}`)
                  .join(" ");
                return `Question ${idx + 1}. ${q.text}. Options: ${opts}.`;
              });
              speakText(
                "Answer the questions about the story. " + lines.join(" ")
              );
            }}
          />
        </div>
      )}

      {showOverlay && (
        <div className="absolute inset-0 bg-[#E8FAFD]/80 flex items-center justify-center">
          <div className="relative w-full max-w-5xl px-6">
            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
              <img
                src="/wally_hands_up.png"
                className="w-[260px] md:w-[360px]"
                alt="Wally celebrates"
              />

              <div className="bg-[#FFE066] rounded-[48px] px-8 py-10 text-center max-w-xl shadow-xl">
                <h2 className="text-2xl md:text-3xl font-bold text-[#1F2A44] mb-4">
                  Great job!
                </h2>
                <p className="text-xl md:text-2xl font-semibold text-[#1F2A44] mb-6">
                  You get a star for completing the story
                </p>
                <button
                  className="bg-[#4B50B6] text-yellow-300 text-xl font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
                  onClick={() => {
                    setShowOverlay(false);
                    setShowQuestions(true);
                    if (!storyStarAwarded) {
                      setStoryStarAwarded(true);
                      addStar("story");
                    }
                  }}
                >
                  OK
                </button>
              </div>
            </div>

            <div className="absolute right-10 -bottom-10 text-[90px] md:text-[120px] text-yellow-400 drop-shadow-[0_6px_0_rgba(15,23,42,0.25)]">
              ★
            </div>
          </div>
        </div>
      )}

      {showQuestions &&
        !questions.some(
          (q) =>
            !q?.text ||
            !Array.isArray(q.options) ||
            q.options.some((opt) => isPlaceholderOption(opt.label))
        ) && (
        <div className="absolute inset-0 bg-[#E8FAFD] flex flex-col items-center justify-center px-6">
          <div className="absolute top-6 right-6">
            <img
              src="/read-to-me.png"
              className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
              alt="Read To Me"
              onClick={() => {
                const lines = questions.map((q, idx) => {
                  const opts = q.options
                    .map((opt, optIdx) => `${optIdx + 1}. ${opt.label}`)
                    .join(" ");
                  return `Question ${idx + 1}. ${q.text}. Options: ${opts}.`;
                });
                speakText(
                  "Answer the questions about the story. " + lines.join(" ")
                );
              }}
            />
          </div>
          <p className="text-base md:text-xl font-semibold text-[#1F2A44] mb-4 text-center max-w-3xl">
            {quizSubmitted
              ? quizAllCorrect
                ? "Great job! You secured the power of the words!"
                : "Next time let’s try to read more carefully so we can secure the power of the words!"
              : "Now help Wally lock the words power! Answer these questions about the story:"}
          </p>

          <div className="w-full max-w-4xl space-y-8">
            {questions.map((q) => (
              <div key={q.id} className="text-center">
                <h3 className="text-2xl md:text-3xl font-extrabold text-[#1F2A44] mb-4">
                  {q.text}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
                  {q.options.map((opt) => {
                    const label = getOptionLabel(opt);
                    const selected = answers[q.id] === opt.id;
                    const isCorrect = Boolean(opt.correct);
                    const showResult = quizSubmitted;
                    const className = showResult
                      ? selected && isCorrect
                        ? "bg-[#7CF277] text-[#1F2A44] ring-4 ring-[#3A56B4]"
                        : selected && !isCorrect
                          ? "bg-[#FF7D72] text-[#1F2A44] ring-4 ring-[#3A56B4]"
                          : "bg-[#FFE066] text-[#1F2A44]"
                      : selected
                        ? "bg-[#4B50B6] text-yellow-200"
                        : "bg-[#FFE066] text-[#1F2A44] hover:bg-[#FFD84D]";
                    return (
                      <button
                        key={opt.id}
                        className={`rounded-full px-8 py-4 text-xl md:text-2xl font-bold transition shadow-md ${className}`}
                        onClick={() => {
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: opt.id,
                          }));
                          if (quizSubmitted) {
                            setQuizSubmitted(false);
                            setQuizAllCorrect(false);
                          }
                        }}
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
              Object.keys(answers).length === questions.length
                ? "bg-[#4B50B6] text-yellow-200 hover:bg-[#4348a3]"
                : "bg-[#8AA1D6] text-yellow-100 opacity-60 cursor-not-allowed"
            }`}
            disabled={
              Object.keys(answers).length !== questions.length || quizSubmitted
            }
            onClick={() => {
              const allCorrect = questions.every((q) => {
                const chosen = q.options.find(
                  (opt) => opt.id === answers[q.id]
                );
                return Boolean(chosen?.correct);
              });
              const correctCount = questions.filter((q) => {
                const chosen = q.options.find(
                  (opt) => opt.id === answers[q.id]
                );
                return Boolean(chosen?.correct);
              }).length;
              const result = {
                answers,
                correct_count: correctCount,
                total: questions.length,
                all_correct: allCorrect,
              };
              updateLastSessionQuiz(result);
              setQuizSubmitted(true);
              setQuizAllCorrect(allCorrect);
              const prev = JSON.parse(
                localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]"
              );
              if (prev.length) {
                const last = prev[prev.length - 1];
                const comprehensionSuccess =
                  questions.length > 0 ? correctCount / questions.length : null;
                const updated = {
                  ...last,
                  model_inputs: {
                    ...last.model_inputs,
                    comprehension_success: comprehensionSuccess,
                  },
                };
                const next = [...prev.slice(0, -1), updated];
                localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(next));
              }
              if (allCorrect && !quizStarAwarded) {
                setQuizStarAwarded(true);
                addStar("quiz");
              }
              onFinishDemo?.();
            }}
            style={{ display: "block", marginLeft: "auto", marginRight: "auto" }}
          >
            Proceed
          </button>
        </div>
      )}

    </div>
  );
}
