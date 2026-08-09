"use client";

import { useEffect, useRef, useState } from "react";

type Props = { onRecorded: (file: File) => void; disabled?: boolean };

export function VoiceRecorder({ onRecorded, disabled = false }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);
  const MAX_SECONDS = 60;

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    if (disabled || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      window.alert("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const preferred = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: preferred });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) onRecorded(new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((value) => {
          const next = value + 1;
          if (next >= MAX_SECONDS) window.setTimeout(stop, 0);
          return Math.min(next, MAX_SECONDS);
        });
      }, 1000);
    } catch {
      window.alert("Microphone permission was not granted.");
    }
  }

  function stop() {
    if (!recording) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <button type="button" className={`tiger-voice-button ${recording ? "recording" : ""}`} onClick={() => recording ? stop() : void start()} disabled={disabled} aria-label={recording ? "Stop voice recording" : "Record voice message"}>
      {recording ? `■ ${seconds}s / ${MAX_SECONDS}s` : "🎙"}
    </button>
  );
}
