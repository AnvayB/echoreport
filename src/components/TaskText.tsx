import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { tokenizeWithNames } from "@/lib/nameHighlight";
import { IMPORTANT_PREFIX_REGEX } from "@/lib/taskUtils";
import {
  getVerdict,
  setVerdict,
  subscribeNameVerify,
  verifyCandidates,
} from "@/lib/nameVerification";

interface TaskTextProps {
  text: string;
  muted?: boolean;
}

const TaskText = ({ text, muted = false }: TaskTextProps) => {
  const importantMatch = IMPORTANT_PREFIX_REGEX.exec(text);
  const isImportant = !!importantMatch;
  const displayText = isImportant ? text.slice(importantMatch![0].length) : text;
  const tokens = useMemo(() => tokenizeWithNames(displayText), [displayText]);

  const [, setTick] = useState(0);
  useEffect(() => subscribeNameVerify(() => setTick((n) => n + 1)), []);

  useEffect(() => {
    const unknown: string[] = [];
    for (const tok of tokens) {
      if (tok.type !== "name") continue;
      const parts = tok.value.split(/\s+/);
      for (const p of parts) {
        if (getVerdict(p) === undefined) unknown.push(p);
      }
      if (parts.length > 1 && getVerdict(tok.value) === undefined) {
        unknown.push(tok.value);
      }
    }
    if (unknown.length) verifyCandidates(unknown);
  }, [tokens]);

  return (
    <span className={isImportant ? "font-bold" : undefined}>
      {tokens.map((tok, i) => {
        if (tok.type === "text") return <span key={i}>{tok.value}</span>;

        const parts = tok.value.split(/\s+/);
        const verdicts = parts.map((p) => getVerdict(p));
        const fullVerdict = parts.length > 1 ? getVerdict(tok.value) : undefined;

        const anyConfirmed =
          fullVerdict === true || verdicts.some((v) => v === true);
        const allRejected =
          fullVerdict !== true && verdicts.every((v) => v === false);

        if (allRejected) {
          return <span key={i}>{tok.value}</span>;
        }

        const pending = !anyConfirmed;

        return (
          <span
            key={i}
            className={[
              "inline-flex items-center gap-0.5 rounded-full border pl-1.5 pr-0.5 py-0",
              "text-[0.82em] font-medium leading-snug align-baseline mx-0.5",
              muted
                ? "border-muted-foreground/40 text-muted-foreground bg-transparent"
                : "border-primary/60 text-primary bg-primary/5",
              pending ? "opacity-80" : "",
            ].join(" ")}
          >
            {tok.value}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setVerdict(tok.value, false);
              }}
              aria-label={`Remove ${tok.value} as person`}
              className={[
                "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full",
                "hover:bg-foreground/10 transition-colors",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-current",
              ].join(" ")}
            >
              <X className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
          </span>
        );
      })}
    </span>
  );
};

export default TaskText;
