// --- CSV Parsing Functions ---

function translateQuestionType(chineseType) {
  const type = chineseType.trim().replace(/["]/g, '').replace(/\n/g, ' ').trim();
  if (type.includes('单选题')) return 'single';
  if (type.includes('多选题')) return 'multiple';
  if (type.includes('判断题')) return 'true-false';
  return 'single';
}

function parseOptions(optionsString, questionType) {
  if (!optionsString || optionsString.trim() === '') return {};
  const options = {};
  const cleanOptions = optionsString.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  if (questionType === 'true-false') {
    options.A = '对';
    options.B = '错';
  } else {
    const optionPattern = /([ABCD])\.\s*([^ABCD]*?)(?=[ABCD]\.|$)/g;
    let match;
    while ((match = optionPattern.exec(cleanOptions)) !== null) {
      const [, letter, text] = match;
      options[letter] = text.trim();
    }
  }
  return options;
}

function processCSVContent(csvContent) {
  const questionBankArray = [];
  const rows = [];
  let currentRow = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
      currentRow += char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
      currentRow += char;
    } else if (char === '\n' && !inQuotes) {
      if (currentRow.trim()) rows.push(currentRow.trim());
      currentRow = '';
    } else {
      currentRow += char;
    }
  }
  if (currentRow.trim()) rows.push(currentRow.trim());

  console.log(`Found ${rows.length} rows`);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.trim() === '') continue;

    const fields = [];
    let currentField = '';
    let inQ = false;
    let qChar = '';

    for (let j = 0; j < row.length; j++) {
      const char = row[j];
      if ((char === '"' || char === "'") && !inQ) {
        inQ = true;
        qChar = char;
      } else if (char === qChar && inQ) {
        inQ = false;
        qChar = '';
      } else if (char === ',' && !inQ) {
        fields.push(currentField.trim());
        currentField = '';
        continue;
      }
      if (!(char === '"' || char === "'") || inQ) {
        currentField += char;
      }
    }
    fields.push(currentField.trim());

    if (fields.length >= 4) {
      const [type, question, options, answer] = fields;
      const cleanType = type.trim();
      const cleanQuestion = question.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const cleanOptions = options.trim();
      const cleanAnswer = answer.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\n/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanType || !cleanQuestion) continue;

      const translatedType = translateQuestionType(cleanType);
      const parsedOptions = parseOptions(cleanOptions, translatedType);

      if (cleanQuestion.length > 5 && (Object.keys(parsedOptions).length > 0 || translatedType === 'true-false')) {
        questionBankArray.push({
          type: translatedType,
          question: cleanQuestion,
          options: parsedOptions,
          answer: cleanAnswer
        });
      }
    }
  }

  console.log(`Total questions loaded: ${questionBankArray.length}`);
  return questionBankArray;
}

async function loadQuestionsFromCSV() {
  try {
    console.log('Loading questions from CSV...');
    const response = await fetch('data/question_bank_2026.csv');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const csvContent = await response.text();
    const questions = processCSVContent(csvContent);
    console.log(`Processed ${questions.length} questions from CSV`);
    return questions;
  } catch (error) {
    console.error('Error loading CSV file:', error);
    return [];
  }
}



// --- Local Storage Functions ---

const STORAGE_KEY = "quizAppQuestionBank";

/**
 * Initializes the application, loading questions from CSV and populating localStorage if needed.
 */
async function initApp() {
  console.log("Initializing app...");

  const questionBank = await loadQuestionsFromCSV();
  seedLocalStorageIfNeeded(questionBank);

  console.log("App initialization complete");
}

/**
 * Populates localStorage with the full question bank if it doesn't exist.
 * @param {Array} questionBank - The array of questions loaded from CSV.
 */
function seedLocalStorageIfNeeded(questionBank) {
  if (!questionBank || questionBank.length === 0) {
    console.warn(
      "Warning: questionBank is empty or not loaded. Cannot seed localStorage."
    );
    return;
  }

  if (!localStorage.getItem(STORAGE_KEY)) {
    console.log("Local storage is empty. Seeding questions...");
    const questionsWithStats = questionBank.map((question, index) => ({
      ...question,
      id: `q_${index}`, // Add a unique ID
      practiced_count: 0,
      wrong_count: 0,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questionsWithStats));
    console.log(
      `Seeding complete. Added ${questionsWithStats.length} questions.`
    );
  } else {
    console.log(
      `Local storage already contains questions. (${questionBank.length} questions in CSV)`
    );
  }
}

/**
 * Retrieves all questions from localStorage.
 * @returns {Array} An array of question objects.
 */
function getQuestionsFromStorage() {
  const questionsJSON = localStorage.getItem(STORAGE_KEY);
  return questionsJSON ? JSON.parse(questionsJSON) : [];
}

/**
 * Saves the entire question bank back to localStorage.
 * @param {Array} questions The array of question objects to save.
 */
function saveQuestionsToStorage(questions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
}

// --- DOM Element Retrieval ---
const startScreen = document.getElementById("start-screen");
const questionScreen = document.getElementById("question-screen");
const resultsScreen = document.getElementById("results-screen");
const cuotiScreen = document.getElementById("cuoti-screen");

const startBtn = document.getElementById("start-btn");
const submitBtn = document.getElementById("submit-btn");
const nextBtn = document.getElementById("next-btn");
const restartBtn = document.getElementById("restart-btn");
const resetStorageBtn = document.getElementById("reset-storage-btn");
const homeFromQuestionBtn = document.getElementById("home-from-question-btn");

const cuotiBtn = document.getElementById("cuoti-btn");
const cuotiResultsBtn = document.getElementById("cuoti-results-btn");
const backToStartBtn = document.getElementById("back-to-start-btn");

const progressText = document.getElementById("progress-text");
const scoreText = document.getElementById("score-text");
const progressBar = document.getElementById("progress-bar");

const questionTypeBadge = document.getElementById("question-type-badge");
const questionText = document.getElementById("question-text");
const optionsContainer = document.getElementById("options-container");
const feedbackContainer = document.getElementById("feedback-container");
const cuotiList = document.getElementById("cuoti-list");

const finalScoreEl = document.getElementById("final-score");
const resultMessageEl = document.getElementById("result-message");

// Modal and Notification Elements
const customModal = document.getElementById("custom-modal");
const modalTitle = document.getElementById("modal-title");
const modalText = document.getElementById("modal-text");
const modalConfirmBtn = document.getElementById("modal-confirm-btn");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const notification = document.getElementById("notification");

// --- State Variables ---
let testQuestions = [];
let currentQuestionIndex = 0;
let score = 0;
const TOTAL_QUESTIONS = 80;
let maxPossibleScore = 0;
let confirmCallback = null;

// --- Modal and Notification Functions ---

/**
 * Shows the custom modal with a specific message and confirmation callback.
 * @param {string} title - The title for the modal.
 * @param {string} text - The message text for the modal.
 * @param {function} onConfirm - The function to call when the confirm button is clicked.
 */
function showModal(title, text, onConfirm) {
  modalTitle.textContent = title;
  modalText.textContent = text;
  confirmCallback = onConfirm;
  customModal.classList.remove("hidden");
}

/**
 * Hides the custom modal.
 */
function hideModal() {
  customModal.classList.add("hidden");
  confirmCallback = null;
}

/**
 * Shows a toaster notification message that disappears after 3 seconds.
 * @param {string} message - The message to display.
 * @param {boolean} isError - If true, displays a red error notification.
 */
function showNotification(message, isError = false) {
  // Get references to notification elements
  const notificationText = document.getElementById("notification-text");
  const notificationIcon = document.getElementById("notification-icon");

  // Set message content
  notificationText.textContent = message;

  // Set icon based on message type
  notificationIcon.textContent = isError ? "❌" : "✅";

  // Set notification styling
  notification.className = `fixed top-5 right-5 text-white py-3 px-6 rounded-lg shadow-xl z-50 transition-all duration-300 transform 
        ${isError ? "bg-red-500" : "bg-green-500"} flex items-center space-x-2`;

  // Add subtle animation effects
  notification.style.opacity = "0";
  notification.classList.remove("hidden", "translate-x-full");

  // Fade in animation
  setTimeout(() => {
    notification.style.opacity = "1";
  }, 10);

  // Auto-hide after 3 seconds
  setTimeout(() => {
    // Fade out animation
    notification.style.opacity = "0";

    // Hide after fade out completes
    setTimeout(() => {
      notification.classList.add("hidden");
    }, 300);
  }, 3000);
  notification.innerHTML +=
    '<div id="toast-progress" class="absolute bottom-0 left-0 h-1 bg-white bg-opacity-30 transition-all duration-3000 w-full" style="transform-origin: left;"></div>';
  const progressBar = document.getElementById("toast-progress");

  // Start depleting the progress bar
  setTimeout(() => {
    progressBar.style.transform = "scaleX(0)";
  }, 100);

  // Fade out animation after 2.8 seconds
  setTimeout(() => {
    notification.style.opacity = "0";
  }, 2800);

  // Hide notification after animations complete (3s)
  setTimeout(() => {
    notification.classList.add("hidden", "translate-x-full");
    notification.innerHTML =
      '<span id="notification-icon" class="text-xl">🔔</span><span id="notification-text"></span>';
  }, 3000);
}

// --- Utility and Core Functions ---

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Calculates a priority score for each question based on practice count and error count.
 * Higher score = higher priority to be selected
 * Priority order:
 * 1. Questions with wrong count > 0 (highest priority)
 * 2. Questions with practice count = 0 (second priority)
 * 3. Questions with practice count > 1 and wrong count = 0 (lowest priority)
 *
 * @param {Object} question - The question object
 * @returns {number} - Priority score
 */
function calculateQuestionPriority(question) {
  const practiceCount = question.practiced_count || 0;
  const wrongCount = question.wrong_count || 0;

  // Priority 1: Questions with wrong count > 0 (highest priority)
  // More wrong answers = higher priority within this group
  if (wrongCount > 0) {
    return 1000 + (wrongCount * 100);
  }

  // Priority 2: Questions with practice count = 0 (second priority)
  if (practiceCount === 0) {
    return 500;
  }

  // Priority 3: Questions with practice count > 1 and wrong count = 0 (lowest priority)
  // Less frequently practiced questions get slightly higher priority within this group
  if (practiceCount >= 1 && wrongCount === 0) {
    return Math.max(1, 100 / practiceCount);
  }

  // Fallback (shouldn't reach here with the current logic)
  return 1;
}

function startQuiz() {
  let allQuestions = getQuestionsFromStorage();
  const singleChoiceQuestions = allQuestions.filter((q) => q.type === "single");
  const multipleChoiceQuestions = allQuestions.filter(
    (q) => q.type === "multiple"
  );
  const trueFalseQuestions = allQuestions.filter(
    (q) => q.type === "true-false"
  );

  console.log(`单选题数量: ${singleChoiceQuestions.length}`);
  console.log(`多选题数量: ${multipleChoiceQuestions.length}`);
  console.log(`判断题数量: ${trueFalseQuestions.length}`);

  // First, separate questions with wrong_count > 0 and the rest
  const wrongSingles = singleChoiceQuestions.filter(
    (q) => q.wrong_count && q.wrong_count > 0
  );
  const wrongMultiples = multipleChoiceQuestions.filter(
    (q) => q.wrong_count && q.wrong_count > 0
  );
  const wrongTrueFalse = trueFalseQuestions.filter(
    (q) => q.wrong_count && q.wrong_count > 0
  );

  // Get remaining questions (those without wrong answers)
  const remainingSingles = singleChoiceQuestions.filter(
    (q) => !q.wrong_count || q.wrong_count === 0
  );
  const remainingMultiples = multipleChoiceQuestions.filter(
    (q) => !q.wrong_count || q.wrong_count === 0
  );
  const remainingTrueFalse = trueFalseQuestions.filter(
    (q) => !q.wrong_count || q.wrong_count === 0
  );

  // Sort remaining questions by priority (highest priority first)
  remainingSingles.sort(
    (a, b) => calculateQuestionPriority(b) - calculateQuestionPriority(a)
  );
  remainingMultiples.sort(
    (a, b) => calculateQuestionPriority(b) - calculateQuestionPriority(a)
  );
  remainingTrueFalse.sort(
    (a, b) => calculateQuestionPriority(b) - calculateQuestionPriority(a)
  );

  // Log how many questions with wrong answers are being included
  console.log(`单选题错题数量: ${wrongSingles.length}`);
  console.log(`多选题错题数量: ${wrongMultiples.length}`);
  console.log(`判断题错题数量: ${wrongTrueFalse.length}`);

  // Select questions by priority: wrong questions first, then highest priority remaining questions
  const selectedSingles = [...wrongSingles, ...remainingSingles].slice(0, 30);
  const selectedMultiples = [...wrongMultiples, ...remainingMultiples].slice(
    0,
    20
  );
  const selectedTrueFalse = [...wrongTrueFalse, ...remainingTrueFalse].slice(
    0,
    30
  );

  // For each question type: keep wrong questions first, shuffle only the remaining questions
  const remainingSinglesShuffled = [...remainingSingles.slice(0, Math.max(0, 30 - wrongSingles.length))];
  shuffleArray(remainingSinglesShuffled);
  const finalSingles = [...wrongSingles, ...remainingSinglesShuffled].slice(0, 30);
  
  const remainingMultiplesShuffled = [...remainingMultiples.slice(0, Math.max(0, 20 - wrongMultiples.length))];
  shuffleArray(remainingMultiplesShuffled);
  const finalMultiples = [...wrongMultiples, ...remainingMultiplesShuffled].slice(0, 20);
  
  const remainingTrueFalseShuffled = [...remainingTrueFalse.slice(0, Math.max(0, 30 - wrongTrueFalse.length))];
  shuffleArray(remainingTrueFalseShuffled);
  const finalTrueFalse = [...wrongTrueFalse, ...remainingTrueFalseShuffled].slice(0, 30);

  testQuestions = [
    ...finalSingles,
    ...finalMultiples,
    ...finalTrueFalse,
  ].slice(0, TOTAL_QUESTIONS);

  if (testQuestions.length < TOTAL_QUESTIONS) {
    console.warn(
      `Warning: Not enough questions. Found ${testQuestions.length}.`
    );
  }

  maxPossibleScore = testQuestions.reduce(
    (total, q) => total + (q.type === "multiple" ? 2 : 1),
    0
  );

  currentQuestionIndex = 0;
  score = 0;

  startScreen.classList.add("hidden");
  questionScreen.classList.remove("hidden");
  resultsScreen.classList.add("hidden");
  cuotiScreen.classList.add("hidden");

  displayQuestion();
}

function updatePracticedCount(question) {
  let allQuestions = getQuestionsFromStorage();
  const questionInDb = allQuestions.find((dbQ) => dbQ.id === question.id);
  if (questionInDb) {
    questionInDb.practiced_count = (questionInDb.practiced_count || 0) + 1;
    // Also update the local test question object to reflect the change
    question.practiced_count = questionInDb.practiced_count;
  }
  saveQuestionsToStorage(allQuestions);
}

function updatePracticedCounts(questionsToUpdate) {
  let allQuestions = getQuestionsFromStorage();
  questionsToUpdate.forEach((testQ) => {
    const questionInDb = allQuestions.find((dbQ) => dbQ.id === testQ.id);
    if (questionInDb) {
      questionInDb.practiced_count = (questionInDb.practiced_count || 0) + 1;
    }
  });
  saveQuestionsToStorage(allQuestions);
}

function displayQuestion() {
  feedbackContainer.classList.add("hidden");
  submitBtn.classList.remove("hidden");
  nextBtn.classList.add("hidden");
  submitBtn.disabled = false;

  if (
    testQuestions.length === 0 ||
    currentQuestionIndex >= testQuestions.length
  ) {
    showResults();
    return;
  }

  const currentQuestion = testQuestions[currentQuestionIndex];

  // Calculate and log priority score BEFORE updating practice count (to show original selection priority)
  const originalPriorityScore = calculateQuestionPriority(currentQuestion);
  console.log(
    `Question ${currentQuestionIndex + 1} Original Priority Score: ${originalPriorityScore} ` +
    `(practiced: ${currentQuestion.practiced_count || 0}, wrong: ${currentQuestion.wrong_count || 0})`
  );

  // Update practice count when question is displayed
  updatePracticedCount(currentQuestion);

  progressText.textContent = `题目 ${currentQuestionIndex + 1} / ${
    testQuestions.length
    }`;
  progressBar.style.width = `${
    ((currentQuestionIndex + 1) / testQuestions.length) * 100
    }%`;

  console.log(
    `Displaying question ${currentQuestionIndex + 1}:`,
    currentQuestion
  );

  // Display score and question stats
  const practicedCount = currentQuestion.practiced_count || 0;
  const wrongCount = currentQuestion.wrong_count || 0;
  let statsText = `得分: ${score}`;

  scoreText.textContent = statsText;

  questionText.textContent = currentQuestion.question;

  // Add class to question type badge based on history
  let badgeClass =
    "inline-block text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full";
  if (wrongCount > 0) {
    // Question has been answered incorrectly before
    badgeClass += " bg-red-100 text-red-800";
  } else if (practicedCount > 0) {
    // Question has been practiced but never wrong
    badgeClass += " bg-green-100 text-green-800";
  } else {
    // New question
    badgeClass += " bg-blue-100 text-blue-800";
  }

  questionTypeBadge.className = badgeClass;
  questionTypeBadge.textContent = {
    single: "单选题",
    multiple: "多选题",
    "true-false": "判断题",
  }[currentQuestion.type];

  optionsContainer.innerHTML = "";
  const optionType = currentQuestion.type === "multiple" ? "checkbox" : "radio";
  for (const key in currentQuestion.options) {
    const optionId = `option_${key}`;
    const optionElement = document.createElement("label");
    optionElement.htmlFor = optionId;
    optionElement.className =
      "flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50";
    optionElement.innerHTML = `
            <input type="${optionType}" id="${optionId}" name="option" value="${key}" class="form-${optionType} h-5 w-5 text-blue-600 border-gray-300 focus:ring-blue-500">
            <span class="ml-3 text-gray-700">${key}. ${currentQuestion.options[key]}</span>
        `;
    optionsContainer.appendChild(optionElement);
  }
}

function checkAnswer() {
  const currentQuestion = testQuestions[currentQuestionIndex];
  const inputs = optionsContainer.querySelectorAll("input");
  let selectedAnswers = [];

  inputs.forEach((input) => {
    if (input.checked) selectedAnswers.push(input.value);
    input.disabled = true;
  });

  if (selectedAnswers.length === 0) {
    feedbackContainer.textContent = "请选择一个答案！";
    feedbackContainer.className =
      "mt-6 p-4 rounded-lg text-center bg-yellow-100 text-yellow-800";
    feedbackContainer.classList.remove("hidden");
    inputs.forEach((input) => (input.disabled = false));
    return;
  }

  let isCorrect =
    currentQuestion.type === "multiple"
      ? JSON.stringify(currentQuestion.answer.split("").sort()) ===
      JSON.stringify(selectedAnswers.sort())
      : selectedAnswers.length === 1 &&
      selectedAnswers[0] === currentQuestion.answer;

  if (isCorrect) {
    const points = currentQuestion.type === "multiple" ? 2 : 1;
    score += points;
    feedbackContainer.textContent = `正确！得分：${points}分`;
    feedbackContainer.className =
      "mt-6 p-4 rounded-lg text-center bg-green-100 text-green-800";
    // Track that this question was answered correctly in this session
    currentQuestion._answeredCorrect = true;

    // Reset wrong count to 0 if answered correctly
    if (currentQuestion.wrong_count && currentQuestion.wrong_count > 0) {
      currentQuestion.wrong_count = 0;
      // Update the question in localStorage
      let allQuestions = getQuestionsFromStorage();
      const questionIndex = allQuestions.findIndex(
        (q) => q.id === currentQuestion.id
      );
      if (questionIndex !== -1) {
        allQuestions[questionIndex].wrong_count = 0;
        saveQuestionsToStorage(allQuestions);
        console.log(
          `Answered correctly this time. Reset wrong count for question ${currentQuestion.id} to 0`
        );
      }
    }
  } else {
    feedbackContainer.textContent = `错误。正确答案是 ${currentQuestion.answer}`;
    feedbackContainer.className =
      "mt-6 p-4 rounded-lg text-center bg-red-100 text-red-800";
    updateWrongCount(currentQuestion);
    // Track that this question was answered incorrectly in this session
    currentQuestion._answeredCorrect = false;
  }

  inputs.forEach((input) => {
    const label = input.parentElement;
    const correctAnswerArray = currentQuestion.answer.split("");
    if (correctAnswerArray.includes(input.value)) {
      label.classList.add("correct-answer");
    } else if (input.checked) {
      label.classList.add("incorrect-answer");
    }
  });

  feedbackContainer.classList.remove("hidden");
  scoreText.textContent = `得分: ${score}`;
  submitBtn.classList.add("hidden");
  nextBtn.classList.remove("hidden");
  submitBtn.disabled = true;
}

function updateWrongCount(question) {
  let allQuestions = getQuestionsFromStorage();
  const questionInDb = allQuestions.find((dbQ) => dbQ.id === question.id);
  if (questionInDb) {
    questionInDb.wrong_count = (questionInDb.wrong_count || 0) + 1;
    saveQuestionsToStorage(allQuestions);
  }
}

function nextQuestion() {
  const previousType = testQuestions[currentQuestionIndex].type;
  currentQuestionIndex++;

  if (currentQuestionIndex < testQuestions.length) {
    // Check if we're transitioning to a new question type
    const currentType = testQuestions[currentQuestionIndex].type;
    if (currentType !== previousType) {
      // Use the toaster notification for section transitions
      const sectionName = {
        single: "单选题",
        multiple: "多选题",
        "true-false": "判断题",
      }[currentType];

      showNotification(`进入${sectionName}部分`, false);
    }

    displayQuestion();
  } else {
    showResults();
  }
}

function showResults() {
  questionScreen.classList.add("hidden");
  resultsScreen.classList.remove("hidden");

  // Calculate improvements
  const wrongAnsweredQuestions = testQuestions.filter(
    (q) => q.practiced_count && q.practiced_count > 1 && q.wrong_count > 0
  );
  const improvedQuestions = wrongAnsweredQuestions.filter((q) => {
    const previousRate =
      (q.practiced_count - 1 - q.wrong_count) / (q.practiced_count - 1);
    const currentRate = (q.practiced_count - q.wrong_count) / q.practiced_count;
    return currentRate > previousRate;
  });

  // Analyze performance by question type
  const singleChoiceQuestions = testQuestions.filter(
    (q) => q.type === "single"
  );
  const multipleChoiceQuestions = testQuestions.filter(
    (q) => q.type === "multiple"
  );
  const trueFalseQuestions = testQuestions.filter(
    (q) => q.type === "true-false"
  );

  // Count wrong answers by type during this quiz session
  const wrongSingleCount = singleChoiceQuestions.filter(
    (q) => !q._answeredCorrect
  ).length;
  const wrongMultipleCount = multipleChoiceQuestions.filter(
    (q) => !q._answeredCorrect
  ).length;
  const wrongTrueFalseCount = trueFalseQuestions.filter(
    (q) => !q._answeredCorrect
  ).length;

  // Overall score
  const scorePercentage =
    maxPossibleScore > 0 ? (score / maxPossibleScore) * 100 : 0;

  // Build HTML for the final score with detailed analysis
  let resultHTML = `<div class="text-5xl font-bold text-blue-500 my-4">${score} / ${maxPossibleScore}</div>`;

  // Add score breakdown by question type
  resultHTML += `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
        <div class="bg-blue-100 text-blue-800 p-3 rounded-lg">
            <div class="font-bold">单选题</div>
            <div>${singleChoiceQuestions.length - wrongSingleCount}/${
    singleChoiceQuestions.length
    }</div>
        </div>
        <div class="bg-green-100 text-green-800 p-3 rounded-lg">
            <div class="font-bold">多选题</div>
            <div>${multipleChoiceQuestions.length - wrongMultipleCount}/${
    multipleChoiceQuestions.length
    }</div>
        </div>
        <div class="bg-purple-100 text-purple-800 p-3 rounded-lg">
            <div class="font-bold">判断题</div>
            <div>${trueFalseQuestions.length - wrongTrueFalseCount}/${
    trueFalseQuestions.length
    }</div>
        </div>
    </div>`;

  // Add improvement message if applicable
  if (improvedQuestions.length > 0) {
    resultHTML += `
        <div class="bg-yellow-100 text-yellow-800 p-3 rounded-lg mt-3">
            <div class="font-bold">进步提示</div>
            <div>您在${improvedQuestions.length}道以前错过的题目上有所改进！继续加油！</div>
        </div>`;
  }

  // Set the HTML
  finalScoreEl.innerHTML = resultHTML;

  // Build encouragement message
  let message =
    scorePercentage >= 90
      ? "太棒了！老爸真是个天才！"
      : scorePercentage >= 80
        ? "很不错！老爸表现出色！"
        : scorePercentage >= 70
          ? "很不错！老爸继续努力！"
          : scorePercentage >= 50
            ? "还有进步空间，老爸加油！"
            : "别灰心，老爸再多练习一下吧！";

  resultMessageEl.textContent = message;
}

function showCuotiScreen() {
  startScreen.classList.add("hidden");
  resultsScreen.classList.add("hidden");
  questionScreen.classList.add("hidden");
  cuotiScreen.classList.remove("hidden");
  cuotiList.innerHTML =
    '<p class="text-gray-500 text-center">正在加载错题...</p>';

  let wrongQuestions = getQuestionsFromStorage().filter(
    (q) => q.wrong_count > 0
  );

  if (wrongQuestions.length === 0) {
    cuotiList.innerHTML =
      '<p class="text-gray-500 text-center">太棒了，没有错题！</p>';
    return;
  }

  cuotiList.innerHTML = "";
  wrongQuestions.sort((a, b) => b.wrong_count - a.wrong_count);
  wrongQuestions.forEach((question, index) => {
    const questionDiv = document.createElement("div");
    questionDiv.className = "p-4 border rounded-lg bg-white shadow-sm";
    let optionsHtml = "";
    for (const key in question.options) {
      optionsHtml += `<li class="mt-1 text-gray-600">${key}. ${question.options[key]}</li>`;
    }
    const typeText = {
      single: "单选题",
      multiple: "多选题",
      "true-false": "判断题",
    }[question.type];
    questionDiv.innerHTML = `
            <p class="font-semibold text-gray-800">
                <span class="inline-block bg-gray-200 text-gray-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">${typeText}</span>
                ${index + 1}. ${question.question}
            </p>
            <ul class="list-none mt-2 pl-4">${optionsHtml}</ul>
            <p class="mt-3 font-bold text-green-600">正确答案: ${
              question.answer
      }</p>
            <p class="mt-1 text-sm text-red-500">答错次数: ${
              question.wrong_count
      } | 练习次数: ${question.practiced_count}</p>`;
    cuotiList.appendChild(questionDiv);
  });
}

function returnToHome() {
  showModal(
    "退出确认",
    "您确定要退出本次答题吗？您的当前进度将不会被保存。",
    () => {
      questionScreen.classList.add("hidden");
      resultsScreen.classList.add("hidden");
      cuotiScreen.classList.add("hidden");
      startScreen.classList.remove("hidden");
    }
  );
}

// --- Event Listeners ---
document.addEventListener("DOMContentLoaded", async () => {
  await initApp();
});

startBtn.addEventListener("click", startQuiz);
submitBtn.addEventListener("click", checkAnswer);
nextBtn.addEventListener("click", nextQuestion);
restartBtn.addEventListener("click", startQuiz);
cuotiBtn.addEventListener("click", showCuotiScreen);
cuotiResultsBtn.addEventListener("click", showCuotiScreen);
homeFromQuestionBtn.addEventListener("click", returnToHome);

backToStartBtn.addEventListener("click", () => {
  cuotiScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
});

resetStorageBtn.addEventListener("click", () => {
  showModal(
    "重置确认",
    "您确定要重置所有答题记录吗？这将清除您的错题本和练习次数。",
    () => {
      localStorage.removeItem(STORAGE_KEY);
      showNotification("答题记录已重置。");
      initApp(); // Re-seed the local storage
    }
  );
});

modalConfirmBtn.addEventListener("click", () => {
  if (typeof confirmCallback === "function") {
    confirmCallback();
  }
  hideModal();
});

modalCancelBtn.addEventListener("click", hideModal);
