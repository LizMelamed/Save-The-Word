import { useState } from "react";
import Welcome from "./pages/Welcome";

export default function App() {
  const [screen, setScreen] = useState("welcome");

  if (screen === "welcome") {
    return <Welcome onStart={() => setScreen("profile")} />;
  }

  if (screen === "profile") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Profile screen coming next 😄
      </div>
    );
  }

  return null;
}
