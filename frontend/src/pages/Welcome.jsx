import { motion } from "framer-motion";
import { speakText } from "../utils/speech";

export default function Welcome({ onStart }) {
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
    </div>
  );
}
