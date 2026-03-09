import type { Question, RawQuestion, UserProgress } from './types';
import {
  signIn,
  signOut,
  getSession,
  loadUserProgress,
  saveAllProgress,
  deleteAllProgress,
  logLoginEvent,
} from './supabase';

// --- CSV Parsing Functions ---

function translateQuestionType(chineseType: string): 'single' | 'multiple' | 'true-false' {
  const type = chineseType.trim().replace(/["]/g, '').replace(/\n/g, ' ').trim();
  if (type.includes('单选题')) return 'single';
  if (type.includes('多选题')) return 'multiple';
  if (type.includes('判断题')) return 'true-false';
  return 'single';
}

function parseOptions(
  optionsString: string,
  questionType: 'single' | 'multiple' | 'true-false'
): Record<string, string> {
  if (!optionsString || optionsString.trim() === '') return {};
  const options: Record<string, string> = {};
  const cleanOptions = optionsString.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  if (questionType === 'true-false') {
    options['A'] = '对';
    options['B'] = '错';
  } else {
    const optionPattern = /([ABCD])\.\s*([^ABCD]*?)(?=[ABCD]\.|$)/g;
    let match: RegExpExecArray | null;
    while ((match = optionPattern.exec(cleanOptions)) !== null) {
      const letter = match[1];
      const text = match[2];
      if (letter && text !== undefined) {
        options[letter] = text.trim();
      }
    }
  }
  return options;
}

function processCSVContent(csvContent: string): RawQuestion[] {
  const questionBankArray: RawQuestion[] = [];
  const rows: string[] = [];
  let currentRow = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i] ?? '';
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

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.trim() === '') continue;

    const fields: string[] = [];
    let currentField = '';
    let inQ = false;
    let qChar = '';

    for (let j = 0; j < row.length; j++) {
      const char = row[j] ?? '';
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
      const type = fields[0] ?? '';
      const question = fields[1] ?? '';
      const options = fields[2] ?? '';
      const answer = fields[3] ?? '';

      const cleanType = type.trim();
      const cleanQuestion = question
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const cleanOptions = options.trim();
      const cleanAnswer = answer
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\n/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanType || !cleanQuestion) continue;

      const translatedType = translateQuestionType(cleanType);
      const parsedOptions = parseOptions(cleanOptions, translatedType);

      if (
        cleanQuestion.length > 5 &&
        (Object.keys(parsedOptions).length > 0 || translatedType === 'true-false')
      ) {
        questionBankArray.push({
          type: translatedType,
          question: cleanQuestion,
          options: parsedOptions,
          answer: cleanAnswer,
        });
      }
    }
  }

  return questionBankArray;
}

async function loadQuestionsFromCSV(): Promise<RawQuestion[]> {
  try {
    const response = await fetch('data/question_bank_2026.csv');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const csvContent = await response.text();
    return processCSVContent(csvContent);
  } catch (error) {
    console.error('Error loading CSV file:', error);
    return [];
  }
}

// --- App State ---
let rawQuestionBank: RawQuestion[] = [];
let userProgressCache = new Map<string, UserProgress>();
let currentUserId = '';

// --- DOM Element Retrieval ---

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

const loginScreen = getElement('login-screen');
const loginEmailInput = getElement<HTMLInputElement>('login-email');
const loginPasswordInput = getElement<HTMLInputElement>('login-password');
const loginBtn = getElement<HTMLButtonElement>('login-btn');
const loginError = getElement('login-error');
const userEmailDisplay = getElement('user-email-display');
const logoutBtn = getElement<HTMLButtonElement>('logout-btn');

const startScreen = getElement('start-screen');
const questionScreen = getElement('question-screen');
const resultsScreen = getElement('results-screen');
const cuotiScreen = getElement('cuoti-screen');

const startBtn = getElement<HTMLButtonElement>('start-btn');
const submitBtn = getElement<HTMLButtonElement>('submit-btn');
const nextBtn = getElement<HTMLButtonElement>('next-btn');
const restartBtn = getElement<HTMLButtonElement>('restart-btn');
const resetStorageBtn = getElement<HTMLButtonElement>('reset-storage-btn');
const homeFromQuestionBtn = getElement<HTMLButtonElement>('home-from-question-btn');

const cuotiBtn = getElement<HTMLButtonElement>('cuoti-btn');
const cuotiResultsBtn = getElement<HTMLButtonElement>('cuoti-results-btn');
const backToStartBtn = getElement<HTMLButtonElement>('back-to-start-btn');

const progressText = getElement('progress-text');
const scoreText = getElement('score-text');
const progressBar = getElement('progress-bar');

const questionTypeBadge = getElement('question-type-badge');
const questionText = getElement('question-text');
const optionsContainer = getElement('options-container');
const feedbackContainer = getElement('feedback-container');
const cuotiList = getElement('cuoti-list');

const finalScoreEl = getElement('final-score');
const resultMessageEl = getElement('result-message');

const customModal = getElement('custom-modal');
const modalTitle = getElement('modal-title');
const modalText = getElement('modal-text');
const modalConfirmBtn = getElement<HTMLButtonElement>('modal-confirm-btn');
const modalCancelBtn = getElement<HTMLButtonElement>('modal-cancel-btn');
const notification = getElement('notification');

// --- State Variables ---
let testQuestions: Question[] = [];
let currentQuestionIndex = 0;
let score = 0;
const TOTAL_QUESTIONS = 80;
let maxPossibleScore = 0;
let confirmCallback: (() => void) | null = null;

// --- Modal and Notification Functions ---

function showModal(title: string, text: string, onConfirm: () => void): void {
  modalTitle.textContent = title;
  modalText.textContent = text;
  confirmCallback = onConfirm;
  customModal.classList.remove('hidden');
}

function hideModal(): void {
  customModal.classList.add('hidden');
  confirmCallback = null;
}

function showNotification(message: string, isError = false): void {
  const notificationText = document.getElementById('notification-text');
  const notificationIcon = document.getElementById('notification-icon');

  if (!notificationText || !notificationIcon) return;

  notificationText.textContent = message;
  notificationIcon.textContent = isError ? '❌' : '✅';

  notification.className = `fixed top-5 right-5 text-white py-3 px-6 rounded-lg shadow-xl z-50 transition-all duration-300 transform 
        ${isError ? 'bg-red-500' : 'bg-green-500'} flex items-center space-x-2`;

  notification.style.opacity = '0';
  notification.classList.remove('hidden', 'translate-x-full');

  setTimeout(() => {
    notification.style.opacity = '1';
  }, 10);

  notification.innerHTML +=
    '<div id="toast-progress" class="absolute bottom-0 left-0 h-1 bg-white bg-opacity-30 transition-all duration-3000 w-full" style="transform-origin: left;"></div>';
  const toastProgress = document.getElementById('toast-progress');

  setTimeout(() => {
    if (toastProgress) toastProgress.style.transform = 'scaleX(0)';
  }, 100);

  setTimeout(() => {
    notification.style.opacity = '0';
  }, 2800);

  setTimeout(() => {
    notification.classList.add('hidden', 'translate-x-full');
    notification.innerHTML =
      '<span id="notification-icon" class="text-xl">🔔</span><span id="notification-text"></span>';
  }, 3000);
}

// --- Utility and Core Functions ---

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j] as T;
    array[j] = temp as T;
  }
}

/**
 * Calculates a priority score for each question based on practice count and error count.
 * Higher score = higher priority to be selected.
 */
function calculateQuestionPriority(question: Question): number {
  const practiceCount = question.practiced_count;
  const wrongCount = question.wrong_count;

  if (wrongCount > 0) {
    return 1000 + wrongCount * 100;
  }
  if (practiceCount === 0) {
    return 500;
  }
  if (practiceCount >= 1 && wrongCount === 0) {
    return Math.max(1, 100 / practiceCount);
  }
  return 1;
}

function getEnrichedQuestions(): Question[] {
  return rawQuestionBank.map((q, index) => {
    const id = `q_${index}`;
    const progress = userProgressCache.get(id);
    return {
      ...q,
      id,
      practiced_count: progress?.practiced_count ?? 0,
      wrong_count: progress?.wrong_count ?? 0,
    };
  });
}

function startQuiz(): void {
  const allQuestions = getEnrichedQuestions();
  const singleChoiceQuestions = allQuestions.filter((q) => q.type === 'single');
  const multipleChoiceQuestions = allQuestions.filter((q) => q.type === 'multiple');
  const trueFalseQuestions = allQuestions.filter((q) => q.type === 'true-false');

  const wrongSingles = singleChoiceQuestions.filter((q) => q.wrong_count > 0);
  const wrongMultiples = multipleChoiceQuestions.filter((q) => q.wrong_count > 0);
  const wrongTrueFalse = trueFalseQuestions.filter((q) => q.wrong_count > 0);

  const remainingSingles = singleChoiceQuestions
    .filter((q) => q.wrong_count === 0)
    .sort((a, b) => calculateQuestionPriority(b) - calculateQuestionPriority(a));
  const remainingMultiples = multipleChoiceQuestions
    .filter((q) => q.wrong_count === 0)
    .sort((a, b) => calculateQuestionPriority(b) - calculateQuestionPriority(a));
  const remainingTrueFalse = trueFalseQuestions
    .filter((q) => q.wrong_count === 0)
    .sort((a, b) => calculateQuestionPriority(b) - calculateQuestionPriority(a));

  const remainingSinglesShuffled = remainingSingles.slice(
    0,
    Math.max(0, 30 - wrongSingles.length)
  );
  shuffleArray(remainingSinglesShuffled);
  const finalSingles = [...wrongSingles, ...remainingSinglesShuffled].slice(0, 30);

  const remainingMultiplesShuffled = remainingMultiples.slice(
    0,
    Math.max(0, 20 - wrongMultiples.length)
  );
  shuffleArray(remainingMultiplesShuffled);
  const finalMultiples = [...wrongMultiples, ...remainingMultiplesShuffled].slice(0, 20);

  const remainingTrueFalseShuffled = remainingTrueFalse.slice(
    0,
    Math.max(0, 30 - wrongTrueFalse.length)
  );
  shuffleArray(remainingTrueFalseShuffled);
  const finalTrueFalse = [...wrongTrueFalse, ...remainingTrueFalseShuffled].slice(0, 30);

  testQuestions = [...finalSingles, ...finalMultiples, ...finalTrueFalse].slice(
    0,
    TOTAL_QUESTIONS
  );

  if (testQuestions.length < TOTAL_QUESTIONS) {
    // Not enough questions available, use what we have
  }

  maxPossibleScore = testQuestions.reduce(
    (total, q) => total + (q.type === 'multiple' ? 2 : 1),
    0
  );

  currentQuestionIndex = 0;
  score = 0;

  startScreen.classList.add('hidden');
  questionScreen.classList.remove('hidden');
  resultsScreen.classList.add('hidden');
  cuotiScreen.classList.add('hidden');

  displayQuestion();
}

function updatePracticedCount(question: Question): void {
  const prev = userProgressCache.get(question.id) ?? {
    question_id: question.id,
    practiced_count: 0,
    wrong_count: question.wrong_count,
  };
  const updated: UserProgress = {
    ...prev,
    practiced_count: prev.practiced_count + 1,
  };
  userProgressCache.set(question.id, updated);
  question.practiced_count = updated.practiced_count;
}

function displayQuestion(): void {
  feedbackContainer.classList.add('hidden');
  submitBtn.classList.remove('hidden');
  nextBtn.classList.add('hidden');
  submitBtn.disabled = false;

  if (testQuestions.length === 0 || currentQuestionIndex >= testQuestions.length) {
    showResults();
    return;
  }

  const currentQuestion = testQuestions[currentQuestionIndex];
  if (!currentQuestion) return;

  updatePracticedCount(currentQuestion);

  progressText.textContent = `题目 ${currentQuestionIndex + 1} / ${testQuestions.length}`;
  progressBar.style.width = `${((currentQuestionIndex + 1) / testQuestions.length) * 100}%`;

  scoreText.textContent = `得分: ${score}`;
  questionText.textContent = currentQuestion.question;

  const { practiced_count: practicedCount, wrong_count: wrongCount } = currentQuestion;
  let badgeClass = 'inline-block text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full';
  if (wrongCount > 0) {
    badgeClass += ' bg-red-100 text-red-800';
  } else if (practicedCount > 0) {
    badgeClass += ' bg-green-100 text-green-800';
  } else {
    badgeClass += ' bg-blue-100 text-blue-800';
  }

  questionTypeBadge.className = badgeClass;
  const typeLabels: Record<Question['type'], string> = {
    single: '单选题',
    multiple: '多选题',
    'true-false': '判断题',
  };
  questionTypeBadge.textContent = typeLabels[currentQuestion.type];

  optionsContainer.innerHTML = '';
  const optionType = currentQuestion.type === 'multiple' ? 'checkbox' : 'radio';
  for (const key in currentQuestion.options) {
    const optionId = `option_${key}`;
    const optionElement = document.createElement('label');
    optionElement.htmlFor = optionId;
    optionElement.className =
      'flex items-center p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50';
    optionElement.innerHTML = `
      <input type="${optionType}" id="${optionId}" name="option" value="${key}" class="form-${optionType} h-5 w-5 text-blue-600 border-gray-300 focus:ring-blue-500">
      <span class="ml-3 text-gray-700">${key}. ${currentQuestion.options[key]}</span>
    `;
    optionsContainer.appendChild(optionElement);
  }
}

function checkAnswer(): void {
  const currentQuestion = testQuestions[currentQuestionIndex];
  if (!currentQuestion) return;

  const inputs = optionsContainer.querySelectorAll<HTMLInputElement>('input');
  const selectedAnswers: string[] = [];

  inputs.forEach((input) => {
    if (input.checked) selectedAnswers.push(input.value);
    input.disabled = true;
  });

  if (selectedAnswers.length === 0) {
    feedbackContainer.textContent = '请选择一个答案！';
    feedbackContainer.className = 'mt-6 p-4 rounded-lg text-center bg-yellow-100 text-yellow-800';
    feedbackContainer.classList.remove('hidden');
    inputs.forEach((input) => (input.disabled = false));
    return;
  }

  const isCorrect =
    currentQuestion.type === 'multiple'
      ? JSON.stringify(currentQuestion.answer.split('').sort()) ===
        JSON.stringify([...selectedAnswers].sort())
      : selectedAnswers.length === 1 && selectedAnswers[0] === currentQuestion.answer;

  if (isCorrect) {
    const points = currentQuestion.type === 'multiple' ? 2 : 1;
    score += points;
    feedbackContainer.textContent = `正确！得分：${points}分`;
    feedbackContainer.className = 'mt-6 p-4 rounded-lg text-center bg-green-100 text-green-800';
    currentQuestion._answeredCorrect = true;

    if (currentQuestion.wrong_count > 0) {
      currentQuestion.wrong_count = 0;
      const prev = userProgressCache.get(currentQuestion.id);
      if (prev) {
        const updated: UserProgress = { ...prev, wrong_count: 0 };
        userProgressCache.set(currentQuestion.id, updated);
      }
    }
  } else {
    feedbackContainer.textContent = `错误。正确答案是 ${currentQuestion.answer}`;
    feedbackContainer.className = 'mt-6 p-4 rounded-lg text-center bg-red-100 text-red-800';
    updateWrongCount(currentQuestion);
    currentQuestion._answeredCorrect = false;
  }

  inputs.forEach((input) => {
    const label = input.parentElement;
    if (!label) return;
    const correctAnswerArray = currentQuestion.answer.split('');
    if (correctAnswerArray.includes(input.value)) {
      label.classList.add('correct-answer');
    } else if (input.checked) {
      label.classList.add('incorrect-answer');
    }
  });

  feedbackContainer.classList.remove('hidden');
  scoreText.textContent = `得分: ${score}`;
  submitBtn.classList.add('hidden');
  nextBtn.classList.remove('hidden');
  submitBtn.disabled = true;
}

function updateWrongCount(question: Question): void {
  const prev = userProgressCache.get(question.id) ?? {
    question_id: question.id,
    practiced_count: question.practiced_count,
    wrong_count: 0,
  };
  const updated: UserProgress = { ...prev, wrong_count: prev.wrong_count + 1 };
  userProgressCache.set(question.id, updated);
  question.wrong_count = updated.wrong_count;
}

function nextQuestion(): void {
  const previousQuestion = testQuestions[currentQuestionIndex];
  const previousType = previousQuestion?.type;
  currentQuestionIndex++;

  if (currentQuestionIndex < testQuestions.length) {
    const currentType = testQuestions[currentQuestionIndex]?.type;
    if (currentType && currentType !== previousType) {
      const sectionName: Record<Question['type'], string> = {
        single: '单选题',
        multiple: '多选题',
        'true-false': '判断题',
      };
      showNotification(`进入${sectionName[currentType]}部分`, false);
    }
    displayQuestion();
  } else {
    showResults();
  }
}

function showResults(): void {
  questionScreen.classList.add('hidden');
  resultsScreen.classList.remove('hidden');

  const wrongAnsweredQuestions = testQuestions.filter(
    (q) => q.practiced_count > 1 && q.wrong_count > 0
  );
  const improvedQuestions = wrongAnsweredQuestions.filter((q) => {
    const previousRate = (q.practiced_count - 1 - q.wrong_count) / (q.practiced_count - 1);
    const currentRate = (q.practiced_count - q.wrong_count) / q.practiced_count;
    return currentRate > previousRate;
  });

  const singleChoiceQuestions = testQuestions.filter((q) => q.type === 'single');
  const multipleChoiceQuestions = testQuestions.filter((q) => q.type === 'multiple');
  const trueFalseQuestions = testQuestions.filter((q) => q.type === 'true-false');

  const wrongSingleCount = singleChoiceQuestions.filter((q) => !q._answeredCorrect).length;
  const wrongMultipleCount = multipleChoiceQuestions.filter((q) => !q._answeredCorrect).length;
  const wrongTrueFalseCount = trueFalseQuestions.filter((q) => !q._answeredCorrect).length;

  const scorePercentage = maxPossibleScore > 0 ? (score / maxPossibleScore) * 100 : 0;

  let resultHTML = `<div class="text-5xl font-bold text-blue-500 my-4">${score} / ${maxPossibleScore}</div>`;
  resultHTML += `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
      <div class="bg-blue-100 text-blue-800 p-3 rounded-lg">
        <div class="font-bold">单选题</div>
        <div>${singleChoiceQuestions.length - wrongSingleCount}/${singleChoiceQuestions.length}</div>
      </div>
      <div class="bg-green-100 text-green-800 p-3 rounded-lg">
        <div class="font-bold">多选题</div>
        <div>${multipleChoiceQuestions.length - wrongMultipleCount}/${multipleChoiceQuestions.length}</div>
      </div>
      <div class="bg-purple-100 text-purple-800 p-3 rounded-lg">
        <div class="font-bold">判断题</div>
        <div>${trueFalseQuestions.length - wrongTrueFalseCount}/${trueFalseQuestions.length}</div>
      </div>
    </div>`;

  if (improvedQuestions.length > 0) {
    resultHTML += `
      <div class="bg-yellow-100 text-yellow-800 p-3 rounded-lg mt-3">
        <div class="font-bold">进步提示</div>
        <div>您在${improvedQuestions.length}道以前错过的题目上有所改进！继续加油！</div>
      </div>`;
  }

  finalScoreEl.innerHTML = resultHTML;

  const message =
    scorePercentage >= 90
      ? '太棒了！老爸真是个天才！'
      : scorePercentage >= 80
        ? '很不错！老爸表现出色！'
        : scorePercentage >= 70
          ? '很不错！老爸继续努力！'
          : scorePercentage >= 50
            ? '还有进步空间，老爸加油！'
            : '别灰心，老爸再多练习一下吧！';

  resultMessageEl.textContent = message;

  // Persist all session progress to Supabase as a single blob
  void saveAllProgress(currentUserId, userProgressCache);
}

function showCuotiScreen(): void {
  startScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  questionScreen.classList.add('hidden');
  cuotiScreen.classList.remove('hidden');
  cuotiList.innerHTML = '<p class="text-gray-500 text-center">正在加载错题...</p>';

  const wrongQuestions = getEnrichedQuestions()
    .filter((q) => q.wrong_count > 0)
    .sort((a, b) => b.wrong_count - a.wrong_count);

  if (wrongQuestions.length === 0) {
    cuotiList.innerHTML = '<p class="text-gray-500 text-center">太棒了，没有错题！</p>';
    return;
  }

  cuotiList.innerHTML = '';
  wrongQuestions.forEach((question, index) => {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'p-4 border rounded-lg bg-white shadow-sm';
    let optionsHtml = '';
    for (const key in question.options) {
      optionsHtml += `<li class="mt-1 text-gray-600">${key}. ${question.options[key]}</li>`;
    }
    const typeLabels: Record<Question['type'], string> = {
      single: '单选题',
      multiple: '多选题',
      'true-false': '判断题',
    };
    questionDiv.innerHTML = `
      <p class="font-semibold text-gray-800">
        <span class="inline-block bg-gray-200 text-gray-800 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">${typeLabels[question.type]}</span>
        ${index + 1}. ${question.question}
      </p>
      <ul class="list-none mt-2 pl-4">${optionsHtml}</ul>
      <p class="mt-3 font-bold text-green-600">正确答案: ${question.answer}</p>
      <p class="mt-1 text-sm text-red-500">答错次数: ${question.wrong_count} | 练习次数: ${question.practiced_count}</p>`;
    cuotiList.appendChild(questionDiv);
  });
}

function returnToHome(): void {
  showModal('退出确认', '您确定要退出本次答题吗？当前进度将会保存。', () => {
    void saveAllProgress(currentUserId, userProgressCache);
    questionScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    cuotiScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  });
}

// --- Auth Functions ---

// --- Device / Browser Detection ---

function detectDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile|wpdesktop/i.test(ua))
    return 'mobile';
  return 'desktop';
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/windows nt/i.test(ua)) return 'Windows';
  if (/mac os x/i.test(ua)) return 'macOS';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\//i.test(ua)) return 'Opera';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/msie|trident/i.test(ua)) return 'IE';
  return 'Unknown';
}

async function fetchClientIP(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = (await res.json()) as { ip: string };
    return data.ip ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget: log a login event for the current session. */
function trackLoginEvent(email: string): void {
  void (async () => {
    const session = await getSession();
    if (!session) return;
    const ip = await fetchClientIP();
    void logLoginEvent({
      user_id: session.user.id,
      email: session.user.email ?? email,
      user_agent: navigator.userAgent,
      ip_address: ip,
      device_type: detectDeviceType(),
      os: detectOS(),
      browser: detectBrowser(),
      logged_in_at: new Date().toISOString(),
    });
  })();
}

async function handleLogin(): Promise<void> {
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = '登录中...';

  const { error } = await signIn(email, password);
  loginBtn.disabled = false;
  loginBtn.textContent = '登录';

  if (error) {
    loginError.textContent = `登录失败：${error}`;
    loginError.classList.remove('hidden');
    return;
  }

  // Track every explicit login (logout → login counts as a new event)
  trackLoginEvent(loginEmailInput.value.trim());

  await initApp();
}

async function handleLogout(): Promise<void> {
  await signOut();
  userProgressCache = new Map();
  currentUserId = '';
  // Hide all screens, show login
  startScreen.classList.add('hidden');
  questionScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  cuotiScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginEmailInput.value = '';
  loginPasswordInput.value = '';
}

async function initApp(): Promise<void> {
  const session = await getSession();

  if (!session) {
    loginScreen.classList.remove('hidden');
    startScreen.classList.add('hidden');
    return;
  }

  // Show user email, store userId for subsequent DB calls
  currentUserId = session.user.id;
  userEmailDisplay.textContent = session.user.email ?? '';
  loginScreen.classList.add('hidden');

  // Track session resumptions (page refresh with existing session)
  trackLoginEvent(session.user.email ?? '');

  // Load questions if not yet loaded
  if (rawQuestionBank.length === 0) {
    rawQuestionBank = await loadQuestionsFromCSV();
  }

  // Load per-user progress from Supabase (single auth call already done via getSession)
  userProgressCache = await loadUserProgress(currentUserId);

  startScreen.classList.remove('hidden');
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  void initApp();
});

// Auth listeners
loginBtn.addEventListener('click', () => { void handleLogin(); });
loginPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { void handleLogin(); }
});
logoutBtn.addEventListener('click', () => { void handleLogout(); });

startBtn.addEventListener('click', startQuiz);
submitBtn.addEventListener('click', checkAnswer);
nextBtn.addEventListener('click', nextQuestion);
restartBtn.addEventListener('click', startQuiz);
cuotiBtn.addEventListener('click', showCuotiScreen);
cuotiResultsBtn.addEventListener('click', showCuotiScreen);
homeFromQuestionBtn.addEventListener('click', returnToHome);

backToStartBtn.addEventListener('click', () => {
  cuotiScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
});

resetStorageBtn.addEventListener('click', () => {
  showModal(
    '重置确认',
    '您确定要重置所有答题记录吗？这将清除您的错题本和练习次数。',
    () => {
      void deleteAllProgress(currentUserId).then(async () => {
        userProgressCache = new Map();
        showNotification('答题记录已重置。');
      });
    }
  );
});

modalConfirmBtn.addEventListener('click', () => {
  if (typeof confirmCallback === 'function') {
    confirmCallback();
  }
  hideModal();
});

modalCancelBtn.addEventListener('click', hideModal);
