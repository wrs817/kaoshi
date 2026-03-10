import type { Question, RawQuestion, UserProgress, Chapter } from './types';
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
  if (type.includes('多选')) return 'multiple';
  if (type.includes('判断')) return 'true-false';
  if (type.includes('单选')) return 'single';
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
    const optionPattern = /([A-G])[.．]\s*(.*?)(?=\s+[A-G][.．]\s|$)/g;
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

// --- Chapter definitions (matches filenames in public/data/2026/) ---
const CHAPTERS: Chapter[] = [
  { id: 'ch_1',  filename: 'data/2026/1、《政府采购法》【100题】.csv',                                                                        title: '《政府采购法》【100题】' },
  { id: 'ch_2',  filename: 'data/2026/2、《政府采购法实施条例》【100题】.csv',                                                                  title: '《政府采购法实施条例》【100题】' },
  { id: 'ch_3',  filename: 'data/2026/3、《招标投标法》【30题】.csv',                                                                          title: '《招标投标法》【30题】' },
  { id: 'ch_4',  filename: 'data/2026/4、《招标投标法实施条例》【30题】.csv',                                                                    title: '《招标投标法实施条例》【30题】' },
  { id: 'ch_5',  filename: 'data/2026/5、《政府采购非招标采购方式管理办法》（74号令）【90题】.csv',                                               title: '《政府采购非招标采购方式管理办法》（74号令）【90题】' },
  { id: 'ch_6',  filename: 'data/2026/6、《政府采购货物和服务招标投标管理办法》（87号令）【90题】.csv',                                           title: '《政府采购货物和服务招标投标管理办法》（87号令）【90题】' },
  { id: 'ch_7',  filename: 'data/2026/7、《政府购买服务管理办法》（102号令）【90题】.csv',                                                       title: '《政府购买服务管理办法》（102号令）【90题】' },
  { id: 'ch_8',  filename: 'data/2026/8、《政府采购信息发布管理办法》（101号令）【60题】.csv',                                                   title: '《政府采购信息发布管理办法》（101号令）【60题】' },
  { id: 'ch_9',  filename: 'data/2026/9、《政府采购需求管理办法》【90题】.csv',                                                                  title: '《政府采购需求管理办法》【90题】' },
  { id: 'ch_10', filename: 'data/2026/10、《政府采购代理机构管理暂行办法》【90题】.csv',                                                         title: '《政府采购代理机构管理暂行办法》【90题】' },
  { id: 'ch_11', filename: 'data/2026/11、《福建省政府采购代理机构执业综合评价规则（2024 版）》【90题】.csv',                                    title: '《福建省政府采购代理机构执业综合评价规则（2024版）》【90题】' },
  { id: 'ch_12', filename: 'data/2026/12、《财政部关于进一步规范政府采购评审工作有关问题的通知》财库〔2012〕69号【67题】.csv',                   title: '《财政部关于进一步规范政府采购评审工作》财库〔2012〕69号【67题】' },
  { id: 'ch_13', filename: 'data/2026/13、《国务院办公厅关于在政府采购中实施本国产品标准及相关政策的通知》【51题】.csv',                         title: '《国务院办公厅关于在政府采购中实施本国产品标准》【51题】' },
  { id: 'ch_14', filename: 'data/2026/14、《福建省财政厅关于加强政府绿色采购工作的通知》【58题】.csv',                                          title: '《福建省财政厅关于加强政府绿色采购工作的通知》【58题】' },
  { id: 'ch_15', filename: 'data/2026/15、《福建省政府采购评审专家管理办法》【60题】.csv',                                                       title: '《福建省政府采购评审专家管理办法》【60题】' },
  { id: 'ch_16', filename: 'data/2026/16、《福建省政府集中采购目录及限额标准》【69题】.csv',                                                     title: '《福建省政府集中采购目录及限额标准》【69题】' },
  { id: 'ch_17', filename: 'data/2026/17、《政府采购促进中小企业发展管理办法》试题【95题】.csv',                                                 title: '《政府采购促进中小企业发展管理办法》【95题】' },
  { id: 'ch_18', filename: 'data/2026/18、《政府采购合作创新采购方式管理暂行办法》【60题】.csv',                                                 title: '《政府采购合作创新采购方式管理暂行办法》【60题】' },
  { id: 'ch_19', filename: 'data/2026/19、《政府采购进口产品管理办法》【78题】.csv',                                                             title: '《政府采购进口产品管理办法》【78题】' },
  { id: 'ch_20', filename: 'data/2026/20、《政府采购竞争性磋商采购方式管理暂行办法》【66题】.csv',                                               title: '《政府采购竞争性磋商采购方式管理暂行办法》【66题】' },
  { id: 'ch_21', filename: 'data/2026/21、《政府采购框架协议采购方式管理暂行办法》【99题】.csv',                                                 title: '《政府采购框架协议采购方式管理暂行办法》【99题】' },
  { id: 'ch_22', filename: 'data/2026/22、《政府采购评审专家管理办法》【60题】.csv',                                                             title: '《政府采购评审专家管理办法》【60题】' },
  { id: 'ch_23', filename: 'data/2026/23、《政府采购质疑和投诉办法》【109题】.csv',                                                             title: '《政府采购质疑和投诉办法》【109题】' },
  { id: 'ch_24', filename: 'data/2026/24、意向公开、内控、异常低价【39题】.csv',                                                                title: '意向公开、内控、异常低价【39题】' },
  { id: 'ch_25', filename: 'data/2026/25、政府采购系统操作【46题】.csv',                                                                        title: '政府采购系统操作【46题】' },
];

async function loadChapterQuestions(chapter: Chapter): Promise<RawQuestion[]> {
  try {
    const response = await fetch(chapter.filename);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const csvContent = await response.text();
    return processCSVContent(csvContent);
  } catch (error) {
    console.error(`Error loading chapter ${chapter.id}:`, error);
    return [];
  }
}

// --- App State ---
let rawQuestionBank: RawQuestion[] = [];
let userProgressCache = new Map<string, UserProgress>();
let currentUserId = '';
let currentChapter: Chapter | null = null; // null = full randomized test

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
const topBar = getElement('top-bar');

const startScreen = getElement('start-screen');
const chapterScreen = getElement('chapter-screen');
const chapterList = getElement('chapter-list');
const questionScreen = getElement('question-screen');
const resultsScreen = getElement('results-screen');
const cuotiScreen = getElement('cuoti-screen');

const startBtn = getElement<HTMLButtonElement>('start-btn');
const chapterBtn = getElement<HTMLButtonElement>('chapter-btn');
const backFromChapterBtn = getElement<HTMLButtonElement>('back-from-chapter-btn');
const submitBtn = getElement<HTMLButtonElement>('submit-btn');
const nextBtn = getElement<HTMLButtonElement>('next-btn');
const restartBtn = getElement<HTMLButtonElement>('restart-btn');
const resetStorageBtn = getElement<HTMLButtonElement>('reset-storage-btn');
const homeFromQuestionBtn = getElement<HTMLButtonElement>('home-from-question-btn');
const chapterTitleBar = getElement('chapter-title-bar');
const chapterTitleText = getElement('chapter-title-text');

const cuotiBtn = getElement<HTMLButtonElement>('cuoti-btn');
const cuotiSubmenu = getElement('cuoti-submenu');
const cuotiMoniBtn = getElement<HTMLButtonElement>('cuoti-moni-btn');
const chapterCuotiBtn = getElement<HTMLButtonElement>('chapter-cuoti-btn');
const cuotiResultsBtn = getElement<HTMLButtonElement>('cuoti-results-btn');
const backToStartBtn = getElement<HTMLButtonElement>('back-to-start-btn');
const resultsTitleEl = getElement('results-title');

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

function getEnrichedQuestions(questions?: RawQuestion[], idPrefix = 'q'): Question[] {
  const source = questions ?? rawQuestionBank;
  return source.map((q, index) => {
    const id = `${idPrefix}_${index}`;
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
  currentChapter = null;
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
  chapterTitleBar.classList.add('hidden');

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
  scoreText.textContent = currentChapter ? `章节练习` : `得分: ${score}`;
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
    if (!currentChapter) score += points;
    feedbackContainer.textContent = currentChapter ? '正确！' : `正确！得分：${points}分`;
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
  if (!currentChapter) scoreText.textContent = `得分: ${score}`;
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
    if (currentType && currentType !== previousType && !currentChapter) {
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

  if (currentChapter) {
    const singles = testQuestions.filter((q) => q.type === 'single');
    const multiples = testQuestions.filter((q) => q.type === 'multiple');
    const trueFalses = testQuestions.filter((q) => q.type === 'true-false');

    const wrongSingles = singles.filter((q) => !q._answeredCorrect).length;
    const wrongMultiples = multiples.filter((q) => !q._answeredCorrect).length;
    const wrongTrueFalses = trueFalses.filter((q) => !q._answeredCorrect).length;
    const totalWrong = wrongSingles + wrongMultiples + wrongTrueFalses;

    const rows = [
      singles.length > 0 ? `<div class="bg-blue-50 text-blue-800 p-3 rounded-lg"><div class="font-bold">单选题</div><div>答错 ${wrongSingles} / ${singles.length} 题</div></div>` : '',
      multiples.length > 0 ? `<div class="bg-green-50 text-green-800 p-3 rounded-lg"><div class="font-bold">多选题</div><div>答错 ${wrongMultiples} / ${multiples.length} 题</div></div>` : '',
      trueFalses.length > 0 ? `<div class="bg-purple-50 text-purple-800 p-3 rounded-lg"><div class="font-bold">判断题</div><div>答错 ${wrongTrueFalses} / ${trueFalses.length} 题</div></div>` : '',
    ].filter(Boolean).join('');

    finalScoreEl.innerHTML = `
      <div class="text-2xl font-bold text-indigo-500 my-3">${currentChapter.title}</div>
      <div class="grid grid-cols-1 gap-3 my-4 text-sm">${rows}</div>`;

    resultMessageEl.textContent =
      totalWrong === 0 ? '全对！太棒了！' :
      totalWrong <= 3 ? '不错！继续加油！' :
      '还需多加练习，加油！';

    // Show "查看错题" only if there are wrong answers
    cuotiResultsBtn.classList.toggle('hidden', totalWrong === 0);
    restartBtn.textContent = '返回章节';
    restartBtn.className = 'btn bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg';
    resultsTitleEl.textContent = '章节练习完成！';
    void saveAllProgress(currentUserId, userProgressCache);
    return;
  }

  // Restore mock-test button state
  restartBtn.textContent = '再试一次';
  restartBtn.className = 'btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg';
  cuotiResultsBtn.classList.add('hidden');
  resultsTitleEl.textContent = '测试完成！';

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

  // Show "查看错题" for mock test too (always — errors are expected)
  const totalWrongMock = wrongSingleCount + wrongMultipleCount + wrongTrueFalseCount;
  cuotiResultsBtn.classList.toggle('hidden', totalWrongMock === 0);

  // Persist all session progress to Supabase as a single blob
  void saveAllProgress(currentUserId, userProgressCache);
}

function showCuotiScreen(chapter: Chapter | null = null): void {
  startScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  questionScreen.classList.add('hidden');
  chapterScreen.classList.add('hidden');
  cuotiScreen.classList.remove('hidden');

  // Update cuoti screen title to show chapter name if applicable
  const cuotiTitle = cuotiScreen.querySelector('h2');
  if (cuotiTitle) {
    cuotiTitle.textContent = chapter ? `错题本 — ${chapter.title}` : '模拟测试错题';
  }

  cuotiList.innerHTML = '<p class="text-gray-500 text-center">正在加载错题...</p>';

  // Filter to chapter prefix if in chapter mode
  let wrongQuestions: Question[];

  if (chapter) {
    // Chapter mode: use already-loaded testQuestions (chapter-scoped IDs)
    wrongQuestions = testQuestions
      .filter((q) => q.wrong_count > 0)
      .sort((a, b) => b.wrong_count - a.wrong_count);
  } else {
    // Global mode: main question bank (q_ prefix) only
    wrongQuestions = getEnrichedQuestions()
      .filter((q) => q.wrong_count > 0)
      .sort((a, b) => b.wrong_count - a.wrong_count);
  }

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

function showChapterScreen(mode: 'practice' | 'cuoti' = 'practice'): void {
  startScreen.classList.add('hidden');
  chapterScreen.classList.remove('hidden');

  // Update header title based on mode
  const chapterHeader = chapterScreen.querySelector('h2');
  if (chapterHeader) {
    chapterHeader.textContent = mode === 'cuoti' ? '章节错题本' : '按章节练习';
  }

  chapterList.innerHTML = '';
  CHAPTERS.forEach((chapter) => {
    // Count wrong answers for this chapter from the progress cache
    const wrongCount = [...userProgressCache.entries()]
      .filter(([id, p]) => id.startsWith(chapter.id + '_') && p.wrong_count > 0)
      .length;

    // In cuoti mode, skip chapters with no wrong answers
    if (mode === 'cuoti' && wrongCount === 0) return;

    const btn = document.createElement('button');
    btn.className =
      'btn w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 text-gray-800 font-medium shadow-sm flex justify-between items-center';
    btn.innerHTML = `
      <span>${chapter.title}</span>
      ${wrongCount > 0
        ? `<span class="ml-2 shrink-0 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">错题 ${wrongCount}</span>`
        : ''}
    `;
    if (mode === 'cuoti') {
      btn.addEventListener('click', () => { void showChapterCuoti(chapter); });
    } else {
      btn.addEventListener('click', () => { void startChapterQuiz(chapter); });
    }
    chapterList.appendChild(btn);
  });

  // Show empty state in cuoti mode if no chapters have errors
  if (mode === 'cuoti' && chapterList.children.length === 0) {
    chapterList.innerHTML = '<p class="text-gray-500 text-center py-8">太棒了，各章节均没有错题！</p>';
  }
}

async function showChapterCuoti(chapter: Chapter): Promise<void> {
  chapterScreen.classList.add('hidden');
  const rawQuestions = await loadChapterQuestions(chapter);
  if (rawQuestions.length === 0) {
    showNotification('无法加载该章节题目', true);
    showChapterScreen('cuoti');
    return;
  }
  // Populate testQuestions with enriched chapter questions so showCuotiScreen can filter them
  currentChapter = chapter;
  testQuestions = getEnrichedQuestions(rawQuestions, chapter.id);
  showCuotiScreen(chapter);
}

async function startChapterQuiz(chapter: Chapter): Promise<void> {
  currentChapter = chapter;
  chapterScreen.classList.add('hidden');

  // Show a loading state on the question screen briefly
  questionScreen.classList.remove('hidden');
  questionText.textContent = '正在加载题目...';
  optionsContainer.innerHTML = '';
  submitBtn.classList.add('hidden');
  nextBtn.classList.add('hidden');

  const rawQuestions = await loadChapterQuestions(chapter);
  if (rawQuestions.length === 0) {
    showNotification('无法加载该章节题目', true);
    questionScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    return;
  }

  testQuestions = getEnrichedQuestions(rawQuestions, chapter.id);

  maxPossibleScore = testQuestions.reduce(
    (total, q) => total + (q.type === 'multiple' ? 2 : 1),
    0
  );
  currentQuestionIndex = 0;
  score = 0;

  resultsScreen.classList.add('hidden');
  cuotiScreen.classList.add('hidden');
  chapterTitleText.textContent = chapter.title;
  chapterTitleBar.classList.remove('hidden');

  displayQuestion();
}

function returnToHome(): void {
  showModal('退出确认', '您确定要退出本次答题吗？当前进度将会保存。', () => {
    void saveAllProgress(currentUserId, userProgressCache);
    questionScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    cuotiScreen.classList.add('hidden');
    chapterScreen.classList.add('hidden');
    cuotiSubmenu.classList.add('hidden');
    chapterTitleBar.classList.add('hidden');
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
  topBar.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginEmailInput.value = '';
  loginPasswordInput.value = '';
}

async function initApp(): Promise<void> {
  const session = await getSession();

  if (!session) {
    loginScreen.classList.remove('hidden');
    startScreen.classList.add('hidden');
    chapterScreen.classList.add('hidden');
    questionScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    cuotiScreen.classList.add('hidden');
    topBar.classList.add('hidden');
    return;
  }

  // Show user email, store userId for subsequent DB calls
  currentUserId = session.user.id;
  userEmailDisplay.textContent = session.user.email ?? '';
  loginScreen.classList.add('hidden');
  topBar.classList.remove('hidden');

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
chapterBtn.addEventListener('click', () => showChapterScreen('practice'));
backFromChapterBtn.addEventListener('click', () => {
  chapterScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
});
submitBtn.addEventListener('click', checkAnswer);
nextBtn.addEventListener('click', nextQuestion);
restartBtn.addEventListener('click', () => {
  if (currentChapter) {
    resultsScreen.classList.add('hidden');
    showChapterScreen('practice');
  } else {
    startQuiz();
  }
});
cuotiBtn.addEventListener('click', () => {
  cuotiSubmenu.classList.toggle('hidden');
});
cuotiMoniBtn.addEventListener('click', () => {
  cuotiSubmenu.classList.add('hidden');
  showCuotiScreen(null);
});
chapterCuotiBtn.addEventListener('click', () => {
  cuotiSubmenu.classList.add('hidden');
  showChapterScreen('cuoti');
});
cuotiResultsBtn.addEventListener('click', () => showCuotiScreen(currentChapter));
homeFromQuestionBtn.addEventListener('click', returnToHome);

backToStartBtn.addEventListener('click', () => {
  cuotiScreen.classList.add('hidden');
  cuotiSubmenu.classList.add('hidden');
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
