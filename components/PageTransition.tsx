// C2: Page transition wrapper
// Plain, fast cross-fade on route change — no horizontal slide/swipe.
import { motion } from "framer-motion";
import { ReactNode } from "react";

const variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] as const },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.08, ease: [0.4, 0, 0.2, 1] as const },
  },
};

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ willChange: "opacity" }}
    >
      {children}
    </motion.div>
  );
}
