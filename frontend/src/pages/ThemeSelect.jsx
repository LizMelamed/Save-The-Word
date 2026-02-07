import { motion } from "framer-motion";

const THEMES = [
  { id: "cars", label: "Cars", icon: "/themes/cars.png" },
  { id: "princesses", label: "Princesses", icon: "/themes/princess.png" },
  { id: "unicorns", label: "Unicorns", icon: "/themes/unicorn.png" },
  { id: "robots", label: "Robots", icon: "/themes/robot.png" },
  { id: "flowers", label: "Flowers", icon: "/themes/flower.png" },
  { id: "dinosaurs", label: "Dinosaurs", icon: "/themes/dino.png" },
  { id: "space", label: "Outer space", icon: "/themes/space.png" },
  { id: "pets", label: "Pets", icon: "/themes/pets.png" },
];

export default function ThemeSelect({ selectedThemes, onChange, onReady, onBack, onRead }) {
  function toggle(themeId) {
    if (selectedThemes.includes(themeId)) {
      onChange(selectedThemes.filter((t) => t !== themeId));
    } else {
      onChange([...selectedThemes, themeId]);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#E8FAFD] grid grid-rows-[auto,1fr,auto] px-4 py-4 gap-[clamp(8px,2vh,18px)]">

      {/* Top bar */}
      <div className="flex items-start justify-between md:px-8">
        <img src="/logo.png" className="w-[clamp(160px,20vw,260px)]" />
      </div>

      {/* Main content */}
      <div className="flex flex-col items-center justify-center text-center min-h-0">

        <p className="text-[clamp(18px,2.5vw,28px)] font-semibold text-[#1F2A44] mb-[clamp(8px,2vh,16px)]">
          I like stories about ....
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-[clamp(8px,2.2vw,24px)] mb-[clamp(8px,2vh,16px)]">
          {THEMES.map((theme) => {
            const selected = selectedThemes.includes(theme.id);

            return (
              <motion.div
                key={theme.id}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggle(theme.id)}
                className={`w-[clamp(96px,16vw,160px)] h-[clamp(96px,16vw,160px)] flex flex-col items-center justify-center rounded-3xl cursor-pointer transition
                  ${selected ? "bg-[#DDE1FF] ring-4 ring-[#4B50B6]" : ""}
                `}
              >
                <img
                  src={theme.icon}
                  className="max-w-[clamp(64px,10vw,110px)] max-h-[clamp(64px,10vw,110px)] mb-2 object-contain"
                />
                <span className="text-[clamp(12px,1.6vw,18px)] font-semibold text-[#1F2A44]">
                  {theme.label}
                </span>
              </motion.div>
            );
          })}
        </div>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          disabled={selectedThemes.length === 0}
          onClick={onReady}
          className={`bg-[#4B50B6] text-yellow-300 text-[clamp(16px,2vw,24px)] font-bold px-[clamp(32px,6vw,80px)] py-[clamp(8px,1.8vh,14px)] rounded-full shadow-xl transition
            ${selectedThemes.length === 0 ? "opacity-50 pointer-events-none" : "hover:bg-[#4348a3]"}
          `}
        >
          I'm Ready
        </motion.button>

      </div>

      {/* Bottom bar */}
      <div className="flex items-end justify-between md:px-8">
        <img
          src="/go-back.png"
          className="w-[clamp(90px,12vw,140px)] cursor-pointer hover:scale-105 transition"
          onClick={onBack}
        />
        <img
          src="/read-to-me.png"
          className="w-[clamp(90px,12vw,140px)] cursor-pointer hover:scale-105 transition"
          onClick={onRead}
        />
      </div>

    </div>
  );
}
