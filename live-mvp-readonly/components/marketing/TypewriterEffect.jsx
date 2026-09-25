import { useState, useEffect } from "react";

/**
 * TypewriterEffect
 * Aceternity-inspired character-by-character reveal with blinking cursor.
 * Props:
 *   words   — string[]  — list of words/phrases to cycle through
 *   speed   — number    — ms per character (default 80)
 *   pause   — number    — ms to pause at full word (default 1800)
 *   className — string
 */
export default function TypewriterEffect({
  words = ["verification-first", "proof-based", "async screening"],
  speed = 75,
  pause = 1800,
  className = "",
}) {
  const [display, setDisplay] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Cursor blink
  useEffect(() => {
    const t = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(t);
  }, []);

  // Typing/deleting logic
  useEffect(() => {
    const current = words[wordIdx % words.length];

    if (!deleting && charIdx <= current.length) {
      const t = setTimeout(() => {
        setDisplay(current.slice(0, charIdx));
        setCharIdx(c => c + 1);
      }, speed);
      return () => clearTimeout(t);
    }

    if (!deleting && charIdx > current.length) {
      const t = setTimeout(() => setDeleting(true), pause);
      return () => clearTimeout(t);
    }

    if (deleting && charIdx > 0) {
      const t = setTimeout(() => {
        setDisplay(current.slice(0, charIdx - 1));
        setCharIdx(c => c - 1);
      }, speed / 2);
      return () => clearTimeout(t);
    }

    if (deleting && charIdx === 0) {
      setDeleting(false);
      setWordIdx(w => w + 1);
    }
  }, [charIdx, deleting, wordIdx, words, speed, pause]);

  return (
    <span className={`inline-flex items-center ${className}`}>
      {display}
      <span
        className={`ml-[2px] inline-block w-[2px] h-[0.85em] bg-current align-middle transition-opacity duration-100 ${
          cursorVisible ? "opacity-70" : "opacity-0"
        }`}
      />
    </span>
  );
}
