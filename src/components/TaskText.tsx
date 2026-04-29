import { tokenizeWithNames } from "@/lib/nameHighlight";

interface TaskTextProps {
  text: string;
  muted?: boolean;
}

const TaskText = ({ text, muted = false }: TaskTextProps) => {
  const tokens = tokenizeWithNames(text);

  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === "text") return <span key={i}>{tok.value}</span>;
        return (
          <span
            key={i}
            className={[
              "inline-flex items-center rounded-full border px-1.5 py-0",
              "text-[0.82em] font-medium leading-snug align-baseline mx-0.5",
              muted
                ? "border-muted-foreground/40 text-muted-foreground bg-transparent"
                : "border-primary/60 text-primary bg-primary/5",
            ].join(" ")}
          >
            {tok.value}
          </span>
        );
      })}
    </>
  );
};

export default TaskText;
