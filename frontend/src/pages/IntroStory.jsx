import { motion } from "framer-motion";

export default function IntroStory({
  name,
  onBack,
  onShowHow,
  onSkip,
  onRead,
  storyLoading,
  storyError,
  onRetryStory,
}) {
  return (
    <div className="relative min-h-full bg-[#E8FAFD] px-4 py-4">

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between md:px-8 md:pt-4">
        <img src="/logo.png" className="w-[180px] md:w-[260px]" alt="Save The Word" />
      </div>

      {(storyLoading || storyError) && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-white/80 text-[#1F2A44] px-5 py-3 rounded-full shadow">
          {storyLoading && (
            <span className="text-sm md:text-base font-semibold">
              Creating your story...
            </span>
          )}
          {storyError && (
            <div className="flex items-center gap-3">
              <span className="text-sm md:text-base font-semibold">
                Story failed to load.
              </span>
              <button
                className="bg-[#4B50B6] text-yellow-200 px-3 py-1 rounded-full text-sm font-bold"
                onClick={onRetryStory}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Absolute centered content */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16 text-[#1F2A44] pointer-events-auto">

          <div className="max-w-2xl text-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-3 md:mb-5">Hi {name}!</h1>
            <p className="text-lg md:text-xl font-semibold mb-2 md:mb-3">I’m Wally the Word Keeper</p>
            <p className="text-base md:text-lg leading-relaxed mb-2 md:mb-3">
              I take care of all the words in the Story World.
            </p>
            <p className="text-base md:text-lg leading-relaxed mb-2 md:mb-3">
              Lately, the words have been getting tired and starting to fade. When you read with me and gently follow the words, they shine bright again! I can’t do it alone.
            </p>
            <p className="text-base md:text-lg leading-relaxed font-semibold">
              Will you help me save the words and keep the stories glowing?
            </p>
          </div>

          <img src="/wally.png" className="w-[180px] md:w-[280px]" alt="Wally" />

        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between md:px-8 md:pb-4">

        <img
          src="/go-back.png"
          className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
          onClick={onBack}
          alt="Go Back"
        />

        <div className="flex gap-3 md:gap-6">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={onShowHow}
            disabled={storyLoading}
            className={`bg-[#4B50B6] text-yellow-300 text-sm md:text-lg font-bold px-5 md:px-8 py-2.5 md:py-3 rounded-full shadow-lg hover:bg-[#4348a3] ${
              storyLoading ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            Show me how to play
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={onSkip}
            disabled={storyLoading}
            className={`bg-[#FFE066] text-[#1F2A44] text-sm md:text-lg font-bold px-5 md:px-8 py-2.5 md:py-3 rounded-full shadow-lg hover:bg-[#ffd84d] ${
              storyLoading ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            I know how to play
          </motion.button>
        </div>

        <img
          src="/read-to-me.png"
          className="w-[100px] md:w-[140px] cursor-pointer hover:scale-105 transition"
          onClick={onRead}
          alt="Read To Me"
        />

      </div>

    </div>
  );
}
