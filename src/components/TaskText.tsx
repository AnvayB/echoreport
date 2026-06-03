import { useEffect, useMemo, useState } from "react";
import { tokenizeWithNames } from "@/lib/nameHighlight";
import { IMPORTANT_PREFIX_REGEX } from "@/lib/taskUtils";
import {
  getVerdict,
  setVerdict,
  subscribeNameVerify,
  verifyCandidates,
} from "@/lib/nameVerification";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface TaskTextProps {
  text: string;
  muted?: boolean;
}

// Strip leading/trailing punctuation to get the core word for verdicts.
const stripPunct = (w: string) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");

const TaskText = ({ text, muted = false }: TaskTextProps) => {
  const importantMatch = IMPORTANT_PREFIX_REGEX.exec(text);
  const isImportant = !!importantMatch;
  const displayText = isImportant ? text.slice(importantMatch![0].length) : text;
  const tokens = useMemo(() => tokenizeWithNames(displayText), [displayText]);

  // Subscribe to cache updates so pills refresh when verdicts change.
  const [, setTick] = useState(0);
  useEffect(() => subscribeNameVerify(() => setTick((n) => n + 1)), []);

  // Submit unknown name candidates for AI verification.
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

  const pillClass = (pending: boolean) =>
    [
      "inline-flex items-center rounded-full border px-1.5 py-0",
      "text-[0.82em] font-medium leading-snug align-baseline mx-0.5",
      muted
        ? "border-muted-foreground/40 text-muted-foreground bg-transparent"
        : "border-primary/60 text-primary bg-primary/5",
      pending ? "opacity-80" : "",
      "cursor-context-menu",
    ].join(" ");

  // Wrap any word in a context menu with Person / Not-a-Person actions.
  const wordMenu = (display: string, coreToken: string, asPill: boolean, pending = false) => {
    const key = coreToken || display;
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {asPill ? (
            <span className={pillClass(pending)}>{display}</span>
          ) : (
            <span className="cursor-context-menu">{display}</span>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setVerdict(key, true)} disabled={!key}>
            Mark "{key}" as Person
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setVerdict(key, false)} disabled={!key}>
            Not a Person
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // Render a free-text segment word-by-word so each word gets a context menu,
  // and any word whose verdict was manually set to "name" renders as a pill.
  const renderTextSegment = (segment: string, baseKey: string) => {
    const parts = segment.split(/(\s+)/);
    return parts.map((part, idx) => {
      if (!part) return null;
      if (/^\s+$/.test(part)) return <span key={`${baseKey}-${idx}`}>{part}</span>;
      const core = stripPunct(part);
      const verdict = core ? getVerdict(core) : undefined;
      const leading = core ? part.slice(0, part.indexOf(core)) : part;
      const trailing = core ? part.slice(part.indexOf(core) + core.length) : "";
      const isPill = verdict === true;
      return (
        <span key={`${baseKey}-${idx}`}>
          {leading}
          {wordMenu(core || part, core, isPill)}
          {trailing}
        </span>
      );
    });
  };

  return (
    <span className={isImportant ? "font-bold" : undefined}>
      {tokens.map((tok, i) => {
        if (tok.type === "text") {
          return <span key={i}>{renderTextSegment(tok.value, `t${i}`)}</span>;
        }

        // Name token from tokenizer. Decide pill vs plain via verdicts.
        const parts = tok.value.split(/\s+/);
        const verdicts = parts.map((p) => getVerdict(p));
        const fullVerdict = parts.length > 1 ? getVerdict(tok.value) : undefined;

        const anyConfirmed =
          fullVerdict === true || verdicts.some((v) => v === true);
        const allRejected =
          fullVerdict !== true && verdicts.every((v) => v === false);

        if (allRejected) {
          // Render rejected name as plain words (still with context menu to re-mark).
          return <span key={i}>{renderTextSegment(tok.value, `n${i}`)}</span>;
        }

        const pending = !anyConfirmed;
        return <span key={i}>{wordMenu(tok.value, tok.value, true, pending)}</span>;
      })}
    </span>
  );
};

export default TaskText;
