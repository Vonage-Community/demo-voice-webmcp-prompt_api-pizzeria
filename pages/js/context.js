/**
 * context.js
 * Transcribes the local employee's microphone to provide AI context.
 */
export class EmployeeSpeechContext {
  constructor(onContextUpdate = null) {
    this.recognition = null;
    this.latestTranscript = "";
    this.onContextUpdate = onContextUpdate;
    this.isActiveCall = false;
    this.isPaused = false; 
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return console.error("Web Speech API not supported.");

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true; 
    this.recognition.interimResults = true; 
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      if (this.isPaused) return; 
      let finalPhrase = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalPhrase += event.results[i][0].transcript;
      }

      if (finalPhrase.trim().length > 0) {
        this.latestTranscript = finalPhrase.trim();
        console.log(`[Context] You said: "${this.latestTranscript}"`);
        if (this.onContextUpdate) this.onContextUpdate(this.latestTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech') console.warn("Speech Error:", event.error);
    };

    // Auto-restart to prevent silent timeouts
    this.recognition.onend = () => {
      // if (this.isActiveCall) this.recognition.start();
      if (this.isActiveCall && !this.isPaused) {
        try {
          this.recognition.start();
        } catch (e) { 
          /* Catch race condition triggers */ 
          console.warn("Recognition start error:", e);
        }
      }
    };
  }

  startListening() {
    if (!this.recognition) return;
    this.isActiveCall = true;
    this.isPaused = false;
    this.latestTranscript = ""; 
    try {
      this.recognition.start();
    } catch (e) { /* already started */ }
  }

  pauseListening() {
    this.isPaused = true;
    if (this.recognition) {
      // .abort() cuts the microphone instantly and stops listening
      try {
        this.recognition.abort(); 
      } catch (e) { }
    }
  }

  stopListening() {
    this.isActiveCall = false;
    this.isPaused = false;
    if (this.recognition) this.recognition.stop();
  }

  getLatestContext() {
    return this.latestTranscript || "How can I help you?";
  }
}