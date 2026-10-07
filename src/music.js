// Melodi instrumental sintetis orisinal; tidak mengambil audio pihak ketiga.
const melody = [72,76,79,76,74,77,81,77,71,74,79,74,72,76,79,84,81,77,74,77,79,76,72,76,74,71,67,71,72,76,79,72];
export class Music {
  constructor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('jelajah-music') || '{}'); } catch {}
    this.enabled = saved.enabled === true;
    this.volume = Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.25;
    this.step = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else if (this.enabled) this.play().catch(() => {});
    });
    document.addEventListener('pointerdown', () => { if (this.enabled) this.play().catch(() => {}); });
    document.addEventListener('keydown', () => { if (this.enabled) this.play().catch(() => {}); });
  }
  save() { try { localStorage.setItem('jelajah-music', JSON.stringify({enabled: this.enabled, volume: this.volume})); } catch {} }
  async setEnabled(value) {
    this.enabled = value;
    this.save();
    if (value) await this.play(); else this.pause();
  }
  setVolume(value) { this.volume = Math.max(0, Math.min(1, value)); if (this.master) this.master.gain.value = this.volume * 0.22; this.save(); }
  async play() {
    if (document.hidden || !this.enabled) return;
    if (!this.ctx) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Browser ini belum mendukung musik.');
      this.ctx = new Audio();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.master.gain.value = this.volume * 0.22;
    }
    await this.ctx.resume();
    if (this.timer || !this.enabled || document.hidden) return;
    this.note();
    this.timer = setInterval(() => this.note(), 420);
  }
  note() {
    const t = this.ctx.currentTime;
    const tones = [melody[this.step % melody.length]];
    if (this.step % 4 === 0) tones.push([48,53,55,48,53,48,55,48][Math.floor(this.step / 4) % 8]);
    for (const midi of tones) {
      const oscillator = this.ctx.createOscillator(), envelope = this.ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      envelope.gain.setValueAtTime(0, t);
      envelope.gain.linearRampToValueAtTime(0.65, t + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      oscillator.connect(envelope); envelope.connect(this.master);
      oscillator.start(t); oscillator.stop(t + 1.15);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    }
    this.step++;
  }
  pause() { clearInterval(this.timer); this.timer = null; this.ctx?.suspend().catch(() => {}); }
}
