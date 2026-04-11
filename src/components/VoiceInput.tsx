import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const VoiceInput = ({ onTranscript }: VoiceInputProps) => {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  if (!SpeechRecognition) return null;

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        onTranscript(last[0].transcript);
      }
    };

    recognition.onerror = (e: any) => {
      console.error("Speech error", e);
      toast.error("Voice input error");
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <Button type="button" variant={listening ? "destructive" : "outline"} size="icon" onClick={toggle} title={listening ? "Stop recording" : "Voice input"}>
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
};

export default VoiceInput;
