import { useCallback, useEffect, useState } from "react";
import Welcome from "./pages/Welcome";
import Profile from "./pages/Profile";
import ThemeSelect from "./pages/ThemeSelect";
import IntroStory from "./pages/IntroStory";
import ReadingDemo from "./pages/ReadingDemo";
import Assessment from "./pages/Assessment";
import AssessmentStart from "./pages/AssessmentStart";
import Game from "./pages/Game";
import { speakText } from "./utils/speech";


export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [profile, setProfile] = useState(null);
  const [themes, setThemes] = useState([]);
  const [story, setStory] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [storyMeta, setStoryMeta] = useState(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState(null);

  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") {
      localStorage.setItem("save-the-word.stars", "0");
    }
  }, []);


  const generateStory = useCallback(() => {
    if (!profile?.age || storyLoading) return;
    setStoryLoading(true);
    setStoryError(null);
    const prev = JSON.parse(
      localStorage.getItem("save-the-word.sessions") || "[]"
    );
    const assessment = JSON.parse(
      localStorage.getItem("save-the-word.assessment") || "null"
    );
    const lastSession = prev.length ? prev[prev.length - 1] : null;
    const lastSkill = assessment?.predicted_reading_skill ?? lastSession?.predicted_reading_skill ?? null;
    const readingSpeedWpm =
      assessment?.reading_speed_wpm ??
      (lastSession?.metrics?.avg_hover_ms
        ? 60000 / lastSession.metrics.avg_hover_ms
        : null);
    const comprehensionSuccess =
      assessment?.comprehension_success ??
      (lastSession?.quiz?.total
        ? lastSession.quiz.correct_count / lastSession.quiz.total
        : null);
    fetch("/generate-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age: Number(profile.age),
        interests: Array.isArray(themes) ? themes : [],
        reading_level: Number.isFinite(lastSkill) ? lastSkill : null,
        reading_speed_wpm: Number.isFinite(readingSpeedWpm)
          ? readingSpeedWpm
          : null,
        comprehension_success: Number.isFinite(comprehensionSuccess)
          ? comprehensionSuccess
          : null,
        num_sentences: 5,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.sentences?.length && !story) {
                setStory(data.sentences);
              }
              if (data?.questions?.length && !questions) {
                setQuestions(data.questions);
              }
              if (data?.attempts?.length || data?.judge || data?.word_features) {
                setStoryMeta({
                  attempts: data.attempts || [],
                  judge: data.judge || null,
                  word_features: data.word_features || null,
                });
              }
              setStoryLoading(false);
            })
      .catch(() => {
        setStoryError("story_fetch_failed");
        setStoryLoading(false);
      });
  }, [profile, themes, storyLoading]);


  if (screen === "welcome") {
    return <Welcome onStart={() => setScreen("profile")} />;
  }

  if (screen === "profile") {
    return (
      <Profile
        onNext={(data) => {
          setProfile(data);
          setScreen("theme");
        }}
      />
    );
  }

  if (screen === "theme") {
    return (
      <ThemeSelect
        selectedThemes={themes}
        onChange={setThemes}
        onReady={() => {
          setScreen("intro");
          generateStory();
        }}   // 👈 THIS is where onReady is defined
        onBack={() => setScreen("profile")}
        onRead={() =>
          speakText(
            "Pick the themes you like. Tap a picture to choose it. " +
              "When you are ready, press I'm Ready. " +
              "Use Go Back to return."
          )
        }
      />
    );
  }

  if (screen === "intro") {
    return (
      <IntroStory
        name={profile.name}
        onBack={() => setScreen("theme")}
        onShowHow={() => setScreen("demo")}
        onSkip={() => setScreen("assessmentStart")}
        onRead={() =>
          speakText(
            `Hi ${profile?.name || "there"}! ` +
              "I am Wally the Word Keeper. " +
              "The words are getting tired and starting to fade. " +
              "Will you help me save the words? " +
              "Press Show me how to play, or I know how to play."
          )
        }
        storyLoading={storyLoading}
        storyError={storyError}
        onRetryStory={generateStory}
      />
    );
  }

  if (screen === "demo") {
    return (
      <ReadingDemo
        onBack={() => setScreen("intro")}
        onRead={() =>
          speakText(
            "Click under each word in order as you read it out loud. " +
              "When you click under a word, it stays strong and easy to see. " +
              "If a word starts to fade, click under it to save it."
          )
        }
        profile={profile}
        interests={themes}
        story={story}
        questions={questions}
        storyMeta={storyMeta}
        storyLoading={storyLoading}
        storyError={storyError}
        onFinishDemo={() => setScreen("assessmentStart")}
      />
    );
  }

  if (screen === "assessmentStart") {
    return <AssessmentStart onStart={() => setScreen("assessment")} />;
  }

  if (screen === "assessment") {
    return (
      <Assessment
        profile={profile}
        interests={themes}
        onDone={() => setScreen("game")}
      />
    );
  }

  if (screen === "game") {
    return (
      <Game
        profile={profile}
        interests={themes}
        onChangeThemes={setThemes}
        onBackToIntro={() => setScreen("intro")}
      />
    );
  }
  

  return null;
}
