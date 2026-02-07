import { useEffect, useMemo, useState } from "react";
import ReadingLine from "../components/ReadingLine";
import ThemeSelect from "./ThemeSelect";
import { useReadingTracker } from "../hooks/useReadingTracker";
import { speakText } from "../utils/speech";
import { apiUrl } from "../utils/api";

const TOTAL_ROUNDS = 5;
const SENTENCES_PER_STORY = 5;
const SESSIONS_STORAGE_KEY = "save-the-word.sessions";
const ASSESSMENT_STORAGE_KEY = "save-the-word.assessment";
const STARS_STORAGE_KEY = "save-the-word.stars";
const GAME_ROUNDS_KEY = "save-the-word.game_rounds";
const GAME_SESSIONS_KEY = "save-the-word.game_sessions";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fadeRateFromSkill(skill) {
  if (!Number.isFinite(skill)) return 0.015;
  const t = clamp((skill - -90.8) / (70 - -90.8), 0, 1);
  const minRate = 0.008;
  const maxRate = 0.028;
  return minRate + t * (maxRate - minRate);
}

function extractReviewWords(rounds) {
  const words = new Set();
  rounds.forEach((round) => {
    const questions = round.questions || [];
    questions.forEach((q, idx) => {
      const selected = round.answers?.[idx];
      if (selected !== q.correct_index) {
        const correctText = q.options[q.correct_index] || "";
        correctText
          .replace(/[^\w\s']/g, "")
          .split(/\s+/)
          .forEach((w) => {
            if (w.length > 3) words.add(w.toLowerCase());
          });
      }
    });
  });
  return Array.from(words);
}

function isPlaceholderOption(text) {
  if (!text || !String(text).trim()) return true;
  return /^option\s*\d+$/i.test(String(text).trim());
}

function buildFeatureMap(wordFeatures) {
  const map = {};
  if (!Array.isArray(wordFeatures)) return map;
  wordFeatures.forEach((sentence, sentenceIdx) => {
    if (!Array.isArray(sentence)) return;
    sentence.forEach((word) => {
      const id = `${sentenceIdx}-${word.word_index}`;
      map[id] = {
        length: word.length,
        sentence_length: word.sentence_length,
        word_frequency_surprisal: word.word_frequency_surprisal,
      };
    });
  });
  return map;
}

export default function Game({ profile, interests, onChangeThemes, onBackToIntro }) {
  const tracker = useReadingTracker();
  const assessment = JSON.parse(
    localStorage.getItem(ASSESSMENT_STORAGE_KEY) || "null"
  );

  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState("reading"); // reading | questions | intermission | themeSelect | parentReport
  const [story, setStory] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [storyMeta, setStoryMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [answers, setAnswers] = useState({});
  const [rounds, setRounds] = useState([]);
  const [nextRoundIndex, setNextRoundIndex] = useState(null);
  const [exportPassword, setExportPassword] = useState("");
  const [exportError, setExportError] = useState("");
  const [nextWordIndex, setNextWordIndex] = useState(0);
  const [missedIndices, setMissedIndices] = useState(new Set());
  const [stars, setStars] = useState(() => {
    const stored = Number(localStorage.getItem(STARS_STORAGE_KEY));
    return Number.isFinite(stored) ? stored : 0;
  });

  const [currentSkill, setCurrentSkill] = useState(
    assessment?.predicted_reading_skill ?? null
  );
  const [currentSpeed, setCurrentSpeed] = useState(
    assessment?.reading_speed_wpm ?? null
  );
  const [currentComprehension, setCurrentComprehension] = useState(
    assessment?.comprehension_success ?? null
  );
  const fadeRate = fadeRateFromSkill(currentSkill);

  const words = useMemo(() => {
    const line = story?.[sentenceIndex] || "";
    return line.trim().split(/\s+/);
  }, [story, sentenceIndex]);

  useEffect(() => {
    setNextWordIndex(0);
    setMissedIndices(new Set());
  }, [sentenceIndex, roundIndex]);

  async function logToBackend(type, payload) {
    try {
      await fetch(apiUrl("/log-session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload }),
      });
    } catch (err) {
      // ignore logging failures in UI
    }
  }

  async function generateStoryForRound() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/generate-story"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: Number(profile?.age || 8),
          interests: Array.isArray(interests) ? interests : [],
          reading_level: Number.isFinite(currentSkill) ? currentSkill : null,
          reading_speed_wpm: Number.isFinite(currentSpeed) ? currentSpeed : null,
          comprehension_success: Number.isFinite(currentComprehension)
            ? currentComprehension
            : null,
          num_sentences: SENTENCES_PER_STORY,
        }),
      });
      if (!res.ok) throw new Error("story_fetch_failed");
      const data = await res.json();
      const normalizedQuestions = (data.questions || []).map((q, idx) => {
        const options = Array.isArray(q.options) ? q.options : [];
        const labels = options.map((opt, optIdx) => {
          if (typeof opt === "string") return opt.trim() || `Option ${optIdx + 1}`;
          if (opt && typeof opt === "object") {
            const raw = opt.label || opt.text || "";
            return raw.trim() || `Option ${optIdx + 1}`;
          }
          return `Option ${optIdx + 1}`;
        });
        while (labels.length < 2) {
          labels.push(`Option ${labels.length + 1}`);
        }
        return {
          text: q.text || `Question ${idx + 1}`,
          options: labels.slice(0, 2),
          correct_index:
            typeof q.correct_index === "number" ? q.correct_index : 0,
        };
      });
      const invalid = normalizedQuestions.some(
        (q) =>
          !q.text ||
          q.options.some((opt) => isPlaceholderOption(opt))
      );
      if (invalid) {
        setError("story_fetch_failed");
        setLoading(false);
        return;
      }
      setStory(data.sentences || []);
      setQuestions(normalizedQuestions);
      setStoryMeta(data);
      setLoading(false);
    } catch (err) {
      setError("story_fetch_failed");
      setLoading(false);
    }
  }

  useEffect(() => {
    generateStoryForRound();
  }, []);

  function resetRoundState() {
    setSentenceIndex(0);
    setSavedCount(0);
    setAnswers({});
    tracker.reset();
  }

  function handleAdvanceSentence() {
    if (!story) return;
    if (sentenceIndex < story.length - 1) {
      setSentenceIndex((cur) => cur + 1);
    } else {
      setPhase("questions");
    }
  }

  async function finalizeRound() {
    const totalWords = story.reduce(
      (sum, line) => sum + line.trim().split(/\s+/).length,
      0
    );
    const metrics = tracker.computeMetrics(totalWords, profile?.age);
    const featureMap = buildFeatureMap(storyMeta?.word_features);
    const perWord = Object.entries(tracker.getData()).map(([id, entry]) => ({
      word_id: id,
      hover_ms: entry.total,
      wpm: entry.total > 0 ? 60000 / entry.total : null,
      ...(featureMap[id] || {}),
    }));
    if (perWord.length) {
      metrics.per_word = perWord;
    }
    let predicted = null;
    try {
      const res = await fetch(apiUrl("/predict-reading-skill"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metrics),
      });
      if (res.ok) {
        const data = await res.json();
        predicted = Number(data?.predicted_reading_skill);
      }
    } catch (err) {
      predicted = null;
    }
    const readingSpeedWpm =
      metrics.avg_hover_ms && metrics.avg_hover_ms > 0
        ? 60000 / metrics.avg_hover_ms
        : null;
    const correctCount = questions.filter((q, idx) => {
      const selected = answers[idx];
      return selected === q.correct_index;
    }).length;
    const comprehension =
      questions.length > 0 ? correctCount / questions.length : null;

    const roundResult = {
      round_index: roundIndex,
      story,
      questions,
      answers,
      correct_count: correctCount,
      total_questions: questions.length,
      metrics,
      per_word: perWord.length
        ? perWord
        : Object.entries(tracker.getData()).map(([id, entry]) => ({
            word_id: id,
            hover_ms: entry.total,
            wpm: entry.total > 0 ? 60000 / entry.total : null,
          })),
      reading_speed_wpm: readingSpeedWpm,
      predicted_reading_skill: predicted,
      comprehension_success: comprehension,
      interests: Array.isArray(interests) ? interests : [],
      story_generation: storyMeta || null,
    };
    setRounds((prev) => {
      const next = [...prev, roundResult];
      localStorage.setItem(GAME_ROUNDS_KEY, JSON.stringify(next));
      return next;
    });
    logToBackend("game_round", {
      timestamp: new Date().toISOString(),
      profile: profile || null,
      round: roundResult,
    });

    if (Number.isFinite(predicted)) {
      setCurrentSkill(predicted);
    }
    if (Number.isFinite(readingSpeedWpm)) {
      setCurrentSpeed(readingSpeedWpm);
    }
    if (Number.isFinite(comprehension)) {
      setCurrentComprehension(comprehension);
    }

    if (correctCount === questions.length && questions.length > 0) {
      const currentStars = Number(localStorage.getItem(STARS_STORAGE_KEY)) || 0;
      const nextStars = currentStars + 1;
      localStorage.setItem(STARS_STORAGE_KEY, String(nextStars));
      setStars(nextStars);
    }

    if (roundIndex + 1 >= TOTAL_ROUNDS) {
      setPhase("parentReport");
    } else {
      setNextRoundIndex(roundIndex + 1);
      setPhase("intermission");
    }
  }

  function startNextRound() {
    setRoundIndex(nextRoundIndex ?? roundIndex + 1);
    setNextRoundIndex(null);
    resetRoundState();
    setPhase("reading");
    generateStoryForRound();
  }

  const parentReport = useMemo(() => {
    if (!rounds.length) return null;
    const storedSessions = JSON.parse(
      localStorage.getItem(GAME_SESSIONS_KEY) || "[]"
    );
    const allRounds = storedSessions.flatMap((s) => s.rounds || []);
    const combinedRounds = [...allRounds, ...rounds];
    const startSpeed = assessment?.reading_speed_wpm ?? null;
    const endSpeed =
      combinedRounds.length > 0
        ? combinedRounds[combinedRounds.length - 1].reading_speed_wpm ?? null
        : null;
    const improvement =
      Number.isFinite(startSpeed) && Number.isFinite(endSpeed)
        ? endSpeed - startSpeed
        : null;
    const avgComprehension =
      combinedRounds.reduce((sum, r) => sum + (r.comprehension_success || 0), 0) /
      combinedRounds.length;
    const reviewWords = extractReviewWords(combinedRounds);
    return {
      startSpeed,
      endSpeed,
      improvement,
      avgComprehension,
      reviewWords,
      total_games: storedSessions.length + 1,
      total_rounds: combinedRounds.length,
    };
  }, [rounds, assessment]);

  function toCsv(rows) {
    if (!rows.length) return "";
    const headers = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set())
    );
    const escape = (value) => {
      const s = String(value ?? "");
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/"/g, "\"\"")}"`;
      }
      return s;
    };
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ];
    return lines.join("\n");
  }

  function collectLogsForExport() {
    const rows = [];
    const sessions = JSON.parse(
      localStorage.getItem(SESSIONS_STORAGE_KEY) || "[]"
    );
    sessions.forEach((s, idx) => {
      rows.push({
        log_type: "demo_session",
        session_index: idx,
        timestamp: s.timestamp,
        child_name: s.profile?.name,
        child_age: s.profile?.age,
        interests: (s.interests || []).join("|"),
        reading_speed_wpm: s.reading_speed_wpm,
        predicted_reading_skill: s.model_outputs?.predicted_reading_skill,
        fade_rate: s.model_outputs?.fade_rate,
        comprehension_success: s.model_inputs?.comprehension_success,
        story: (s.story || []).join(" "),
        quiz_correct: s.quiz?.correct_count,
        quiz_total: s.quiz?.total,
        judge_score: s.story_generation?.judge?.score,
        judge_status: s.story_generation?.judge?.status,
        per_word: JSON.stringify(s.per_word || []),
      });
      (s.story_generation?.attempts || []).forEach((attempt, aIdx) => {
        rows.push({
          log_type: "story_attempt",
          session_index: idx,
          attempt_index: aIdx,
          judge_score: attempt.judge?.score,
          judge_status: attempt.judge?.status,
          judge_feedback: attempt.judge?.feedback,
          story: (attempt.sentences || []).join(" "),
          questions: JSON.stringify(attempt.questions || []),
        });
      });
    });

    const assessment = JSON.parse(
      localStorage.getItem(ASSESSMENT_STORAGE_KEY) || "null"
    );
    if (assessment) {
      rows.push({
        log_type: "assessment_summary",
        timestamp: assessment.timestamp,
        child_name: assessment.profile?.name,
        child_age: assessment.profile?.age,
        interests: (assessment.interests || []).join("|"),
        reading_speed_wpm: assessment.reading_speed_wpm,
        comprehension_success: assessment.comprehension_success,
        predicted_reading_skill: assessment.predicted_reading_skill,
        per_word: JSON.stringify(assessment.per_word || []),
      });
      (assessment.stories || []).forEach((story, idx) => {
        rows.push({
          log_type: "assessment_story",
          story_index: idx,
          correct_count: story.correct_count,
          total: story.total,
          sentences: (story.sentences || []).join(" "),
          questions: JSON.stringify(story.questions || []),
          answers: JSON.stringify(story.answers || {}),
        });
      });
    }

    const gameRounds = JSON.parse(
      localStorage.getItem(GAME_ROUNDS_KEY) || "[]"
    );
    gameRounds.forEach((round) => {
      rows.push({
        log_type: "game_round",
        round_index: round.round_index,
        timestamp: round.timestamp,
        reading_speed_wpm: round.reading_speed_wpm,
        comprehension_success: round.comprehension_success,
        predicted_reading_skill: round.predicted_reading_skill,
        correct_count: round.correct_count,
        total_questions: round.total_questions,
        interests: (round.interests || []).join("|"),
        story: (round.story || []).join(" "),
        per_word: JSON.stringify(round.per_word || []),
      });
    });

    const gameSessions = JSON.parse(
      localStorage.getItem(GAME_SESSIONS_KEY) || "[]"
    );
    gameSessions.forEach((session, idx) => {
      rows.push({
        log_type: "game_session",
        session_index: idx,
        timestamp: session.timestamp,
        total_rounds: session.rounds?.length || 0,
        avg_comprehension: session.parent_report?.avgComprehension,
        speed_start: session.parent_report?.startSpeed,
        speed_end: session.parent_report?.endSpeed,
      });
    });

    return rows;
  }

  function handleExportCsv() {
    if (exportPassword !== "1234") {
      setExportError("Wrong password");
      return;
    }
    setExportError("");
    const rows = collectLogsForExport();
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "save-the-word-logs.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (phase !== "parentReport" || !parentReport) return;
    logToBackend("parent_report", {
      timestamp: new Date().toISOString(),
      profile: profile || null,
      rounds,
      report: parentReport,
    });
  }, [phase, parentReport]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#E8FAFD] flex items-center justify-center relative">
        <div className="text-xl font-semibold text-[#1F2A44]">
          Creating your story...
        </div>
        <div className="absolute top-4 right-4 md:top-6 md:right-6 flex flex-col items-center text-[#1F2A44]">
          <div className="text-4xl">⭐</div>
          <div className="text-lg font-bold mt-1">MY STARS</div>
          <div className="text-2xl font-extrabold">{stars}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-[#E8FAFD] flex flex-col items-center justify-center gap-6 relative">
        <div className="text-xl font-semibold text-[#1F2A44]">
          Story failed to load.
        </div>
        <button
          onClick={() => generateStoryForRound()}
          className="bg-[#4B50B6] text-yellow-300 text-lg font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
        >
          Try again
        </button>
        <div className="absolute top-4 right-4 md:top-6 md:right-6 flex flex-col items-center text-[#1F2A44]">
          <div className="text-4xl">⭐</div>
          <div className="text-lg font-bold mt-1">MY STARS</div>
          <div className="text-2xl font-extrabold">{stars}</div>
        </div>
      </div>
    );
  }

  if (phase === "themeSelect") {
    return (
      <ThemeSelect
        selectedThemes={Array.isArray(interests) ? interests : []}
        onChange={onChangeThemes}
        onReady={() => startNextRound()}
        onBack={() => setPhase("intermission")}
        onRead={() => {}}
      />
    );
  }

  const questionInvalid =
    phase === "questions" &&
    questions.some(
      (q) =>
        !q?.text ||
        !Array.isArray(q.options) ||
        q.options.some((opt) => isPlaceholderOption(opt))
    );

  return (
    <div className="min-h-[100dvh] bg-[#E8FAFD] flex flex-col items-center justify-center px-6 relative">
      <div className="absolute top-4 right-4 md:top-6 md:right-6 flex flex-col items-center text-[#1F2A44]">
        <div className="text-4xl">⭐</div>
        <div className="text-lg font-bold mt-1">MY STARS</div>
        <div className="text-2xl font-extrabold">{stars}</div>
      </div>
      {questionInvalid && (
        <div className="absolute inset-0 bg-[#E8FAFD]/90 flex flex-col items-center justify-center gap-6 z-50">
          <div className="text-xl font-semibold text-[#1F2A44] text-center">
            Oops, there is an issue. Click to try again.
          </div>
          <button
            className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
            onClick={() => generateStoryForRound()}
          >
            Try again
          </button>
        </div>
      )}
        {phase === "reading" && (
        <div className="text-center max-w-3xl">
          <p className="text-base md:text-xl mb-4 text-[#1F2A44] font-semibold">
            Game round {roundIndex + 1} of {TOTAL_ROUNDS}
          </p>
          <div className="flex flex-col items-center gap-2 mt-4">
            {story?.slice(0, sentenceIndex + 1).map((sentence, idx) => (
              <ReadingLine
                key={idx}
                text={sentence}
                sentenceId={`game-${roundIndex}-${idx}`}
                tracker={tracker}
                fadeRate={fadeRate}
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
                  const prefix = `game-${roundIndex}-${sentenceIndex}-`;
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

      {phase === "questions" && !questionInvalid && (
        <div className="w-full max-w-4xl relative">
          <p className="text-center text-xl font-semibold text-[#1F2A44] mb-6">
            Answer the questions about the story
          </p>
          <div className="space-y-8">
            {questions.map((q, idx) => (
              <div key={idx} className="text-center">
                <h3 className="text-2xl font-extrabold text-[#1F2A44] mb-4">
                  {q.text}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center">
                  {q.options.map((label, optIdx) => {
                    const selected = answers[idx] === optIdx;
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
                            [idx]: optIdx,
                          }))
                        }
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
            disabled={Object.keys(answers).length !== questions.length}
            onClick={() => finalizeRound()}
            style={{ display: "block", marginLeft: "auto", marginRight: "auto" }}
          >
            Proceed
          </button>
          <div className="absolute -bottom-16 right-0 md:right-6">
            <img
              src="/read-to-me.png"
              className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
              alt="Read To Me"
              onClick={() => {
                const lines = questions.map((q, idx) => {
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

      {phase === "intermission" && (
        <div className="text-center max-w-2xl">
          <h2 className="text-3xl font-bold text-[#1F2A44] mb-6">
            Great work!
          </h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <button
              className="bg-[#4B50B6] text-yellow-200 text-xl font-bold px-12 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
              onClick={() => startNextRound()}
            >
              Continue
            </button>
            <button
              className="bg-[#FFE066] text-[#1F2A44] text-xl font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#FFD84D] transition"
              onClick={() => setPhase("themeSelect")}
            >
              Change themes
            </button>
          </div>
          <div className="absolute bottom-4 right-4">
            <img
              src="/read-to-me.png"
              className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
              alt="Read To Me"
              onClick={() =>
                speakText(
                  "Great work. Press Continue for the next round or Change themes to pick new themes."
                )
              }
            />
          </div>
        </div>
      )}

      {phase === "parentReport" && parentReport && (
        <div className="absolute inset-0 bg-[#E8FAFD]/90 flex items-center justify-center px-6">
          <div className="bg-white/80 rounded-3xl shadow-xl p-8 max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-[#1F2A44] mb-4">
              Parent Progress Report
            </h2>
            <div className="text-lg text-[#1F2A44] space-y-2 mb-6">
              {Number.isFinite(parentReport.startSpeed) &&
                Number.isFinite(parentReport.endSpeed) && (
                  <p>
                    Reading speed: {parentReport.startSpeed.toFixed(1)} →{" "}
                    {parentReport.endSpeed.toFixed(1)} wpm
                  </p>
                )}
              {Number.isFinite(parentReport.improvement) && (
                <p>
                  Speed change:{" "}
                  {parentReport.improvement >= 0 ? "+" : ""}
                  {parentReport.improvement.toFixed(1)} wpm
                </p>
              )}
              <p>
                Average comprehension:{" "}
                {(parentReport.avgComprehension * 100).toFixed(0)}%
              </p>
            </div>
            {parentReport.reviewWords.length > 0 && (
              <div className="text-left">
                <p className="font-semibold text-[#1F2A44] mb-2">
                  Words to review together:
                </p>
                <div className="flex flex-wrap gap-2">
                  {parentReport.reviewWords.map((word) => (
                    <span
                      key={word}
                      className="bg-[#FFE066] text-[#1F2A44] px-3 py-1 rounded-full text-sm font-semibold"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 text-left">
              <p className="font-semibold text-[#1F2A44] mb-2">
                Export logs (parents only)
              </p>
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  placeholder="Password"
                  className="px-4 py-2 rounded-lg border border-[#cbd5f0] outline-none"
                />
                <button
                  className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-6 py-2 rounded-full shadow-lg hover:bg-[#4348a3] transition"
                  onClick={handleExportCsv}
                >
                  Export CSV
                </button>
                {exportError && (
                  <span className="text-sm text-red-600">{exportError}</span>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-col md:flex-row gap-4 justify-center">
              <button
                className="bg-[#4B50B6] text-yellow-200 text-xl font-bold px-12 py-3 rounded-full shadow-lg hover:bg-[#4348a3] transition"
                onClick={() => {
                  const sessions = JSON.parse(
                    localStorage.getItem(GAME_SESSIONS_KEY) || "[]"
                  );
                  const summary = {
                    timestamp: new Date().toISOString(),
                    rounds,
                    parent_report: parentReport,
                  };
                  localStorage.setItem(
                    GAME_SESSIONS_KEY,
                    JSON.stringify([...sessions, summary])
                  );
                  setRounds([]);
                  setRoundIndex(0);
                  setNextRoundIndex(null);
                  resetRoundState();
                  setPhase("reading");
                  generateStoryForRound();
                }}
              >
                Next game
              </button>
              <button
                className="bg-[#FFE066] text-[#1F2A44] text-xl font-bold px-10 py-3 rounded-full shadow-lg hover:bg-[#FFD84D] transition"
                onClick={() => {
                  const sessions = JSON.parse(
                    localStorage.getItem(GAME_SESSIONS_KEY) || "[]"
                  );
                  const summary = {
                    timestamp: new Date().toISOString(),
                    rounds,
                    parent_report: parentReport,
                  };
                  localStorage.setItem(
                    GAME_SESSIONS_KEY,
                    JSON.stringify([...sessions, summary])
                  );
                  onBackToIntro?.();
                }}
              >
                Back to menu
              </button>
            </div>
            <div className="absolute bottom-6 right-6">
              <img
                src="/read-to-me.png"
                className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
                alt="Read To Me"
                onClick={() =>
                  speakText(
                    "Here is the parent progress report. It shows reading speed and comprehension. Use Export CSV to download logs, or choose Next game or Back to menu."
                  )
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
