/**
 * vad.js
 * Handles silence detection and MediaRecorder chunking for the remote stream.
 */
export class VoiceActivityDetector {
  constructor(remoteStream, onAudioCaptured) {
    this.stream = remoteStream;
    this.onAudioCaptured = onAudioCaptured;

    this.silenceThreshold = 0.02; // RMS threshold
    this.silenceDelay = 1500;     // MS of silence before triggering AI

    this.recording = false;
    this.silenceTimeout = null;
    this.audioChunks = [];
    this.audioContext = null;
    this.animationId = null;
  }

  init() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    
    this.analyser.fftSize = 512;
    this.source.connect(this.analyser);

    this.setupMediaRecorder();
    this.monitorAudio();
    
    console.log("VAD Initialized. Listening for customer speech...");
  }

  setupMediaRecorder() {
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.audioChunks.push(event.data);
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioChunks = []; 
      console.log("Silence detected. Passing blob to AI...");
      this.onAudioCaptured(audioBlob);
    };
  }

  monitorAudio = () => {
    if (!this.audioContext) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(dataArray);

    let sumSquares = 0.0;
    for (let i = 0; i < bufferLength; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / bufferLength);

    if (rms > this.silenceThreshold) {
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }
      if (!this.recording) this.startRecording();
    } else {
      if (this.recording && !this.silenceTimeout) {
        this.silenceTimeout = setTimeout(() => {
          this.stopRecording();
        }, this.silenceDelay);
      }
    }

    this.animationId = requestAnimationFrame(this.monitorAudio);
  }

  startRecording() {
    this.recording = true;
    this.mediaRecorder.start();
  }

  stopRecording() {
    this.recording = false;
    this.mediaRecorder.stop();
    this.silenceTimeout = null;
  }

  destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}