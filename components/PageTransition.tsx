// C2: Page transition wrapper
// Forward: translateX(24→0) + opacity 0→1, duration 0.22s cubic-bezier(0.4,0,0.2,1)
// Back: translateX(-24→0) + opacity 0→1 (same motion, direction determined by history)
import { motion } from "framer-motion";
import { ReactNode } from "react";

const variants = {
  initial: { opacity: 0, x: 20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const },
  },
};

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ willChange: "transform, opacity" }}
    >
      {children}
    </motion.div>
  );
}
