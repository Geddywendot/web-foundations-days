const noteText = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearButton = document.querySelector("#clear-btn");
const themeToggle = document.querySelector("#theme-toggle");

const DRAFT_KEY = "quick-note-draft";
const THEME_KEY = "quick-note-theme";

function updateCounts() {
  const characterTotal = noteText.value.length;
  const trimmedText = noteText.value.trim();
  const wordTotal = trimmedText === "" ? 0 : trimmedText.split(/\s+/).length;

  charCount.textContent = `${characterTotal} / 200 characters`;
  wordCount.textContent = `${wordTotal} ${wordTotal === 1 ? "word" : "words"}`;

  charCount.classList.toggle("warning", characterTotal > 180);
  charCount.classList.toggle("over", characterTotal > 200);
}

function clearNote() {
  noteText.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateCounts();
}

function updateThemeLabel() {
  themeToggle.textContent = document.body.classList.contains("dark")
    ? "Light mode"
    : "Dark mode";
}

const savedDraft = localStorage.getItem(DRAFT_KEY);
if (savedDraft !== null) {
  noteText.value = savedDraft;
}

if (localStorage.getItem(THEME_KEY) === "dark") {
  document.body.classList.add("dark");
}

updateThemeLabel();
updateCounts();

noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem(DRAFT_KEY, noteText.value);
});

clearButton.addEventListener("click", clearNote);

noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearNote();
  }
});

themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  updateThemeLabel();
});
