import { motion } from "framer-motion";
import { speakText } from "../utils/speech";
import { useState } from "react";

export default function Welcome({ onStart }) {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <div className="min-h-full flex items-center justify-center bg-[#E8FAFD] px-4 py-4 relative">
      <div className="flex flex-col items-center text-center gap-3">

        {/* Logo */}
        <img
          src="/logo.png"
          alt="Save The Word"
          className="w-[clamp(240px,55vw,480px)] max-w-[92vw] max-h-[32vh] object-contain"
        />

        {/* Wally */}
        <img
          src="/wally_reads.png"
          alt="Wally"
          className="w-[clamp(120px,20vw,200px)]"
        />

        {/* Subtitle */}
        <p className="text-sm md:text-lg font-semibold text-[#1F2A44] max-w-xl leading-snug">
          The words are disappearing and we need <span className="font-bold">YOUR</span> help saving them!
        </p>

        {/* Button */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStart}
          className="bg-[#4B50B6] text-yellow-300 text-lg md:text-xl font-bold px-8 md:px-12 py-2.5 md:py-3 rounded-full shadow-xl hover:bg-[#4348a3] transition"
        >
          Let’s Start
        </motion.button>

        <button
          className="bg-white/80 text-[#1F2A44] font-semibold px-4 py-2 rounded-full shadow hover:bg-white transition"
          onClick={() => setShowAbout(true)}
        >
          About
        </button>

      </div>
      <div className="absolute bottom-4 right-4">
        <img
          src="/read-to-me.png"
          className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
          alt="Read To Me"
          onClick={() =>
            speakText(
              "Welcome to Save The Word. Press Let's Start to begin."
            )
          }
        />
      </div>
      {showAbout && (
        <div className="absolute inset-0 bg-[#E8FAFD]/95 flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl shadow-xl max-w-3xl w-full p-8 text-[#1F2A44] text-left">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">About Save The Word</h2>
            <p className="text-base md:text-lg mb-3">
              Save The Word is a research-inspired reading game that helps children build faster, more confident reading.
              Research shows that slow, effortful reading can increase cognitive load and reduce comprehension and engagement.
            </p>
            <p className="text-base md:text-lg mb-3">
              The game guides children with mouse-based finger tracking, an external pacing tool that supports steady, forward reading.
              Stories are tailored to the child’s age and interests, and difficulty adapts over time based on performance.
            </p>
            <p className="text-base md:text-lg mb-3">
              In later stages, words gradually fade to encourage smoother reading, while the child keeps words visible by reaching them.
              This combines text-fading and paced reading techniques shown to improve reading fluency without harming comprehension.
            </p>
            <p className="text-base md:text-lg mb-6">
              Built by Liz Melamed and Neta Silam.
            </p>
            <div className="flex justify-end">
              <button
                className="bg-[#4B50B6] text-yellow-200 text-lg font-bold px-8 py-2 rounded-full shadow hover:bg-[#4348a3] transition"
                onClick={() => setShowAbout(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
