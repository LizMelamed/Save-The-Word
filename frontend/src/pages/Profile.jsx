import { motion } from "framer-motion";
import { useState } from "react";
import { speakText } from "../utils/speech";

export default function Profile({ onNext }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");

  const instructionText =
    "Tell me your name and choose your age. Then press Next.";

  return (
    <div className="min-h-full bg-[#E8FAFD] px-4 py-4 flex flex-col">

      {/* Top bar */}
      <div className="flex items-start justify-start">
        <img
          src="/logo.png"
          className="w-[180px] md:w-[260px]"
          alt="Save The Word"
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center text-center">

          <p className="text-lg md:text-xl font-semibold text-[#1F2A44] mb-6 md:mb-8 max-w-xl">
            Answer these questions to create fun stories just for you!
          </p>

          <div className="text-lg md:text-xl font-semibold text-[#1F2A44] space-y-3 mb-8 md:mb-10">

            <div>
              My name is{" "}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="inline-block w-56 px-3 py-2 rounded-lg border-2 border-transparent focus:border-[#4B50B6] outline-none text-center"
              />
            </div>

            <div>
              I’m{" "}
              <select
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="inline-block w-28 px-3 py-2 rounded-lg border-2 border-transparent focus:border-[#4B50B6] outline-none text-center"
              >
                <option value=""></option>
                {Array.from({ length: 4 }, (_, i) => i + 6).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>{" "}
              years old.
            </div>

          </div>

          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNext({ name, age })}
            className="bg-[#4B50B6] text-yellow-300 text-xl md:text-2xl font-bold px-12 md:px-20 py-3 md:py-4 rounded-full shadow-xl hover:bg-[#4348a3] transition"
          >
            Next
          </motion.button>

        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-end justify-end">
        <img
          src="/read-to-me.png"
          className="w-[110px] md:w-[160px] cursor-pointer hover:scale-105 transition"
          alt="Read To Me"
          onClick={() => speakText(instructionText)}
        />
      </div>

    </div>
  );
}
