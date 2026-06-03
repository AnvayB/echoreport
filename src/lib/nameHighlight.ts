// Lightweight client-side person-name detector for task text.
// Returns a token stream of plain text and detected name pills.

export type NameToken = { type: "text" | "name"; value: string };

// Words that look like names (Capitalized) but almost never are.
const STOP_WORDS = new Set<string>([
  // Weekdays
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Mon", "Tue", "Tues", "Wed", "Thu", "Thurs", "Fri", "Sat", "Sun",
  // Months
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Sept", "Oct", "Nov", "Dec",
  // Time-ish words
  "Today", "Tomorrow", "Yesterday", "Tonight", "Morning", "Afternoon", "Evening", "Night",
  "Weekend", "Week", "Month", "Year", "Quarter",
  // Common task verbs / nouns that often appear capitalized at sentence start
  "Email", "Call", "Message", "Text", "Send", "Sync", "Meet", "Ping", "Slack", "Dm",
  "Ask", "Tell", "Remind", "Update", "Review", "Write", "Draft", "Schedule",
  "Follow", "Reply", "Respond", "Check", "Confirm", "Discuss", "Share", "Post",
  "Read", "Watch", "Build", "Create", "Make", "Add", "Remove", "Delete", "Fix",
  "Prepare", "Plan", "Finish", "Complete", "Start", "Continue", "Submit",
  "Order", "Buy", "Pay", "Book", "Cancel", "Renew", "Sign",
  // Connectives / determiners
  "The", "A", "An", "And", "Or", "But", "With", "For", "From", "To", "Of", "On", "In",
  "At", "By", "About", "After", "Before", "During",
]);

// Verbs that strongly suggest the next capitalized word is a person.
const COMM_VERBS = new Set<string>([
  "email", "emailing", "emailed",
  "call", "calling", "called",
  "message", "messaging", "messaged",
  "text", "texting", "texted",
  "dm", "dming", "dmed",
  "slack", "slacking", "slacked",
  "ping", "pinging", "pinged",
  "sync", "syncing", "synced",
  "meet", "meeting", "met",
  "ask", "asking", "asked",
  "tell", "telling", "told",
  "remind", "reminding", "reminded",
  "update", "updating", "updated",
  "thank", "thanking", "thanked",
  "introduce", "introducing", "introduced",
  "with", // "follow up with X", "meet with X"
]);

// A single capitalized word, allowing apostrophes/hyphens and accented chars.
// Requires lowercase letter after the cap to skip ALLCAPS acronyms (AI, PR, EOD, Q3).
const CAP_WORD = /^[A-ZÀ-Ý][a-zà-ÿ][a-zà-ÿ'’\-]*$/;

const isCapWord = (w: string) => CAP_WORD.test(w);

const stripPunct = (w: string) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");

// Strip possessive suffix ('s or 's) so "Gilles's" → "Gilles" for verification/display.
const stripPossessive = (w: string) => w.replace(/['’]s$/u, "");

const looksLikeName = (rawWord: string): boolean => {
  const w = stripPunct(rawWord);
  if (!w || !isCapWord(w)) return false;
  if (STOP_WORDS.has(w)) return false;
  return true;
};

export function tokenizeWithNames(text: string): NameToken[] {
  if (!text) return [];

  // Split on whitespace but keep the whitespace so we can re-emit it faithfully.
  const parts = text.split(/(\s+)/);
  const tokens: NameToken[] = [];

  // Track index of the first non-whitespace word (sentence start).
  let firstWordIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && !/^\s+$/.test(parts[i])) { firstWordIdx = i; break; }
  }

  let i = 0;
  let pendingText = "";

  const flushText = () => {
    if (pendingText) {
      tokens.push({ type: "text", value: pendingText });
      pendingText = "";
    }
  };

  while (i < parts.length) {
    const part = parts[i];
    if (!part) { i++; continue; }

    if (/^\s+$/.test(part)) {
      pendingText += part;
      i++;
      continue;
    }

    const wordCore = stripPunct(part);
    const isFirstWord = i === firstWordIdx;

    // Decide if this word is a name candidate.
    let isName = looksLikeName(part);

    if (isName && isFirstWord) {
      // Sentence-initial caps are ambiguous — drop unless it's clearly a name
      // (we can't tell here without preceding context, so play it safe).
      isName = false;
    }

    if (isName) {
      // Look at preceding non-space token to suppress false positives like
      // "the Monday Sarah report" — only matters if previous word was lowercase verb.
      // Also require either a comm-verb predecessor OR not-first-word (already true).
      // We accept by default; comm-verb just gives extra confidence (no rejection here).

      // Greedy: try to extend with next capitalized word as last name.
      let nameText = wordCore;
      // Preserve leading/trailing punctuation that was attached to this token.
      const leading = part.slice(0, part.indexOf(wordCore));
      let trailing = part.slice(part.indexOf(wordCore) + wordCore.length);

      // Look ahead past whitespace for a possible last name.
      let j = i + 1;
      let wsBuffer = "";
      while (j < parts.length && /^\s+$/.test(parts[j])) {
        wsBuffer += parts[j];
        j++;
      }
      if (j < parts.length) {
        const next = parts[j];
        const nextCore = stripPunct(next);
        // Only extend if no trailing punctuation broke the first name (e.g. "Sarah,").
        const firstHadTerminator = /[,.;:!?]/.test(trailing);
        if (!firstHadTerminator && nextCore && isCapWord(nextCore) && !STOP_WORDS.has(nextCore)) {
          nameText = `${wordCore} ${nextCore}`;
          trailing = next.slice(next.indexOf(nextCore) + nextCore.length);
          i = j; // consume through the second word
        }
      }

      if (leading) pendingText += leading;
      flushText();
      tokens.push({ type: "name", value: nameText });
      if (trailing) pendingText += trailing;
      i++;
      continue;
    }

    pendingText += part;
    i++;
  }

  flushText();
  return tokens;
}
