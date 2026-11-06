// tts.js — 朗读听题（Web Speech API），中/英可切换，语速友好
let cur = null;
let voices = [];
function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = speechSynthesis.getVoices() || [];
}
export function initTTS() {
  if (!("speechSynthesis" in window)) return;
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}
function pickVoice(lang) {
  const want = lang === "en" ? "en" : "zh";
  return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(want)) || null;
}
export function speak(text, lang, onend) {
  if (!text || !("speechSynthesis" in window)) return false;
  stopSpeak();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "en" ? "en-US" : "zh-CN";
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = 0.92; u.pitch = 1.08; u.volume = 1;
  if (typeof onend === "function") u.onend = onend;
  speechSynthesis.speak(u);
  cur = u;
  return true;
}
export function stopSpeak() {
  if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch (e) {} }
  cur = null;
}
export function isSpeaking() {
  return !!(cur && "speechSynthesis" in window && speechSynthesis.speaking);
}
