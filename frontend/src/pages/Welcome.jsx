import { motion } from "framer-motion";

export default function Welcome({ onStart }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E8FAFD]">
      <div className="flex flex-col items-center text-center -mt-12">

        {/* Logo */}
        <img
          src="/logo.png"
          alt="Save The Word"
          className="w-[700px] max-w-[95vw] mb-[-60px]"
        />

        {/* Wally */}
        <img
          src="/wally_reads.png"
          alt="Wally"
          className="w-[260px] mb-2"
        />

        {/* Subtitle */}
        <p className="text-2xl font-semibold text-[#1F2A44] max-w-xl mb-6 leading-snug">
          The words are disappearing and we need <span className="font-bold">YOUR</span> help saving them!
        </p>

        {/* Button */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStart}
          className="bg-[#4B50B6] text-yellow-300 text-3xl font-bold px-20 py-5 rounded-full shadow-xl hover:bg-[#4348a3] transition"
        >
          Let’s Start
        </motion.button>

      </div>
    </div>
  );
}
