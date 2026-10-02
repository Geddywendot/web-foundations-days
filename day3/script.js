let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

function searchNotes(word) {
  const searchTerm = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(searchTerm));
}

function longestNote() {
  if (notes.length === 0) return null;

  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

function countByCategory() {
  const counts = { personal: 0, work: 0, study: 0 };
  for (const note of notes) {
    counts[note.category] += 1;
  }
  return counts;
}

function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const noteWord = total === 1 ? "note" : "notes";
  return `${total} ${noteWord}: ${counts.personal} personal, ${counts.work} work, ${counts.study} study.`;
}

function isDuplicate(text) {
  const normalizedText = text.trim().toLowerCase();
  return notes.some((note) => note.text.trim().toLowerCase() === normalizedText);
}

function addNote(text, category) {
  if (typeof text !== "string" || text.trim().length < 1 || text.trim().length > 200) {
    console.log("Note rejected: text must be 1-200 characters.");
    return false;
  }

  if (!["personal", "work", "study"].includes(category)) {
    console.log("Note rejected: category must be personal, work, or study.");
    return false;
  }

  if (isDuplicate(text)) {
    console.log("Note rejected: a note with the same text already exists.");
    return false;
  }

  const newNote = {
    id: Math.max(0, ...notes.map((note) => note.id)) + 1,
    text: text.trim(),
    category,
  };
  notes.push(newNote);
  console.log(`Note added: "${newNote.text}" (${newNote.category}).`);
  return true;
}

console.log(searchNotes("JAVASCRIPT").map((note) => note.text)); // expected: ["Revise JavaScript arrays"]
console.log(searchNotes("unicorn")); // expected: []

console.log(JSON.stringify(longestNote())); // expected: {"id":3,"text":"Email the project report to Grace","category":"work"}
const notesBeforeEmptyLongestTest = notes;
notes = [];
console.log(longestNote()); // expected: null
notes = notesBeforeEmptyLongestTest;

console.log(JSON.stringify(countByCategory())); // expected: {"personal":2,"work":1,"study":2}
const notesBeforeEmptyCountTest = notes;
notes = [];
console.log(JSON.stringify(countByCategory())); // expected: {"personal":0,"work":0,"study":0}
notes = notesBeforeEmptyCountTest;

console.log(getSummary()); // expected: 5 notes: 2 personal, 1 work, 2 study.
const notesBeforeSingularSummaryTest = notes;
notes = [{ id: 1, text: "One reminder", category: "personal" }];
console.log(getSummary()); // expected: 1 note: 1 personal, 0 work, 0 study.
notes = notesBeforeSingularSummaryTest;

console.log(isDuplicate("  BUY MILK AND BREAD  ")); // expected: true
console.log(isDuplicate("Plan a holiday")); // expected: false

console.log(addNote("Book a dentist appointment", "personal")); // expected: true
console.log(addNote("  book a dentist appointment  ", "work")); // expected: false (duplicate)
console.log(addNote("   ", "study")); // expected: false (invalid text)
console.log(addNote("Prepare the weekly report", "family")); // expected: false (invalid category)
