/**
 * Renders an S3 object key as separate pieces: users / 3f2a… / videos / clip.mp4
 *
 * This is the visual idea the whole demo leans on: S3 has no folders. The "folders"
 * are just the leading part of one long key (a prefix), so each piece is drawn as
 * a chip of the same string, with the slashes kept visible between them.
 */

export interface KeySegment {
  text: string;
  /** "prefix" = part of the path, "variable" = differs per user, "object" = the file name. */
  kind?: "prefix" | "variable" | "object";
  /** Accessible / hover explanation, e.g. "your user ID". */
  title?: string;
}

interface KeyPathProps {
  segments: KeySegment[];
  size?: "sm" | "lg";
  /** "ink" for use on the dark panel. */
  surface?: "paper" | "ink";
  /** Assemble the chips one by one on first render (the auth page's single motion moment). */
  animate?: boolean;
}

const sizes = {
  sm: "text-[0.8125rem] gap-1 [&_[data-chip]]:px-1.5 [&_[data-chip]]:py-0.5",
  lg: "text-xl sm:text-2xl gap-2 [&_[data-chip]]:px-3 [&_[data-chip]]:py-1.5",
};

const chipStyles = {
  paper: {
    prefix: "bg-white border-line text-ink",
    variable: "bg-white border-steel border-dashed text-steel",
    object: "bg-ink border-ink text-paper",
  },
  ink: {
    prefix: "bg-paper/10 border-paper/25 text-paper",
    variable: "bg-transparent border-paper/50 border-dashed text-paper/80",
    object: "bg-paper border-paper text-ink",
  },
};

export function KeyPath({ segments, size = "sm", surface = "paper", animate = false }: KeyPathProps) {
  const fullKey = segments.map((s) => s.text).join("/");
  const separator = surface === "ink" ? "text-paper/50" : "text-steel";

  return (
    <p className={`flex flex-wrap items-center font-mono ${sizes[size]}`} aria-label={`S3 key: ${fullKey}`}>
      {segments.map((segment, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`flex items-center gap-[inherit] ${animate ? "animate-chip-in" : ""}`}
          style={animate ? { animationDelay: `${150 + index * 140}ms` } : undefined}
        >
          <span
            data-chip
            title={segment.title}
            className={`rounded border ${chipStyles[surface][segment.kind ?? "prefix"]}`}
          >
            {segment.text}
          </span>
          {/* Slash after each prefix part: in S3 a "folder" is a prefix ending in "/". */}
          {index < segments.length - 1 && <span className={separator}>/</span>}
        </span>
      ))}
    </p>
  );
}

/** Segments for a key like users/<id>/videos/clip.mp4 */
export function segmentsForKey(key: string, userId?: string): KeySegment[] {
  const parts = key.split("/");
  return parts.map((text, index) => ({
    text: userId && text === userId ? shortId(text) : text,
    title: userId && text === userId ? `User ID ${text}` : undefined,
    kind: index === parts.length - 1 ? "object" : text === userId ? "variable" : "prefix",
  }));
}

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
