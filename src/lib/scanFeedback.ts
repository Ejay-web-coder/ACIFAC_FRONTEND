// What a scan sounds and feels like: a short high beep when a card is read and
// accepted, a low one when it is refused; phones also buzz. Quietly does
// nothing where the browser allows neither (sound needs the person to have
// touched the page, which opening the scanner does).

let audio: AudioContext | null = null;

function beep(frequency: number, seconds: number) {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.18, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + seconds);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + seconds);
  } catch {
    // No sound on this browser.
  }
}

export function scanFeedback(kind: 'ok' | 'repeat' | 'error') {
  if (kind === 'ok') { beep(1046, 0.12); navigator.vibrate?.(80); }
  else if (kind === 'repeat') { beep(784, 0.08); navigator.vibrate?.(40); }
  else { beep(220, 0.3); navigator.vibrate?.([70, 50, 70]); }
}
