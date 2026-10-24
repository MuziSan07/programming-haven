import {
  siCplusplus, siDocker, siFastapi, siFlutter, siGit, siGo, siGraphql, siJavascript, siJupyter, siKotlin, siKubernetes,
  siLinux, siMongodb, siMqtt, siNestjs, siNextdotjs, siNodedotjs, siOpenjdk, siPandas, siPostgresql, siPython, siPytorch,
  siReact, siRedis, siRust, siScikitlearn, siSolidity, siSqlite, siStorybook, siSwift, siTailwindcss, siTensorflow,
  siTypescript, siVite, siVitest, siVuedotjs,
} from "simple-icons";
import { cx } from "./ui";

// Official brand marks from Simple Icons (CC0). Java uses the OpenJDK mark: Oracle's
// coffee-cup logo is trademarked and not distributed by Simple Icons.
const LOGOS = {
  python: siPython, javascript: siJavascript, typescript: siTypescript, java: siOpenjdk, cpp: siCplusplus, go: siGo,
  react: siReact, nodejs: siNodedotjs, docker: siDocker, postgresql: siPostgresql, fastapi: siFastapi,
  nextjs: siNextdotjs, kotlin: siKotlin, swift: siSwift, rust: siRust, flutter: siFlutter, kubernetes: siKubernetes,
  git: siGit, linux: siLinux, tensorflow: siTensorflow, pytorch: siPytorch, pandas: siPandas, redis: siRedis,
  sqlite: siSqlite, vite: siVite, vitest: siVitest, storybook: siStorybook, solidity: siSolidity, mqtt: siMqtt,
  jupyter: siJupyter, scikitlearn: siScikitlearn, nestjs: siNestjs, vue: siVuedotjs, tailwindcss: siTailwindcss,
  graphql: siGraphql, mongodb: siMongodb,
};

// Display names used in content (lower-cased) -> logo slug
const NAME_TO_SLUG = {
  python: "python", javascript: "javascript", typescript: "typescript", java: "java", "c++": "cpp", go: "go",
  golang: "go", react: "react", "node.js": "nodejs", node: "nodejs", docker: "docker", "docker compose": "docker",
  postgresql: "postgresql", postgres: "postgresql", fastapi: "fastapi", "next.js": "nextjs", kotlin: "kotlin",
  swift: "swift", rust: "rust", flutter: "flutter", kubernetes: "kubernetes", git: "git", linux: "linux",
  tensorflow: "tensorflow", pytorch: "pytorch", pandas: "pandas", redis: "redis", sqlite: "sqlite", vite: "vite",
  vitest: "vitest", storybook: "storybook", solidity: "solidity", mqtt: "mqtt", jupyter: "jupyter",
  "scikit-learn": "scikitlearn", nestjs: "nestjs", vue: "vue", "tailwind css": "tailwindcss", graphql: "graphql",
  mongodb: "mongodb",
};

/** Logo slug for a single technology name, or null for phrases like "React or Vue". */
export function slugForName(name) {
  return NAME_TO_SLUG[(name || "").trim().toLowerCase()] || null;
}

/** A tech chip that shows the official logo when the label names exactly one known technology. */
export function TechChip({ name, className }) {
  const slug = slugForName(name);
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted", className)}>
      {slug && <TechLogo slug={slug} size={12} tile={false} />}
      {name}
    </span>
  );
}

function luminance(hex) {
  const n = parseInt(hex, 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function hasLogo(slug) {
  return Boolean(LOGOS[slug]);
}

/** A technology's official logo on a subtle tile; falls back to a monogram for unknown slugs. */
export default function TechLogo({ slug, label, size = 48, tile = true, className }) {
  const icon = LOGOS[slug];
  const inner = Math.round(size * (tile ? 0.56 : 1));
  // Near-black brand colours disappear on the dark theme, so draw those in light ink
  const fill = icon ? (luminance(icon.hex) < 0.05 ? "#e7eaf3" : `#${icon.hex}`) : null;

  const mark = icon ? (
    <svg role="img" viewBox="0 0 24 24" width={inner} height={inner} fill={fill} aria-label={icon.title}>
      <path d={icon.path} />
    </svg>
  ) : (
    <span className="font-semibold text-text" style={{ fontSize: inner * 0.6 }}>{(label || slug || "?").slice(0, 2)}</span>
  );

  if (!tile) return <span className={cx("inline-flex", className)}>{mark}</span>;
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2", className)}
      style={{ width: size, height: size }}>
      {mark}
    </span>
  );
}
