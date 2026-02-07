import { motion } from "framer-motion";
import { speakText } from "../utils/speech";

export default function AssessmentStart({ onStart }) {
  return (
    <div className="min-h-[100dvh] bg-[#E8FAFD] flex items-center justify-center px-6 text-center relative">
      <div className="flex flex-col items-center gap-6 max-w-2xl">
        <h1 className="text-3xl md:text-4xl font-bold text-[#1F2A44]">
          Let’s see your reading speed!
        </h1>
        <p className="text-lg md:text-xl font-semibold text-[#1F2A44]">
          We’ll read two short stories and answer a few questions.
        </p>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStart}
          className="bg-[#4B50B6] text-yellow-200 text-xl md:text-2xl font-bold px-14 py-4 rounded-full shadow-xl hover:bg-[#4348a3] transition"
        >
          Start
        </motion.button>
      </div>
      <div className="absolute bottom-4 right-4">
        <img
          src="/read-to-me.png"
          className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
          alt="Read To Me"
          onClick={() =>
            speakText(
              "We will read two short stories and answer a few questions. Press Start to begin."
            )
          }
        />
      </div>
    </div>
  );
}
