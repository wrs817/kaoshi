// Function to translate question types
function translateQuestionType(chineseType) {
  const type = chineseType.trim().replace(/["]/g, '').replace(/\n/g, ' ').trim();
  if (type.includes('单选题')) return 'single';
  if (type.includes('多选题')) return 'multiple';
  if (type.includes('判断题')) return 'true-false';
  return 'single'; // default fallback
}

// Function to parse options string into object
function parseOptions(optionsString, questionType) {
  if (!optionsString || optionsString.trim() === '') {
    return {};
  }
  
  const options = {};
  const cleanOptions = optionsString.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  
  if (questionType === 'true-false') {
    // For true-false questions, typically A=对, B=错
    options.A = '对';
    options.B = '错';
  } else {
    // Parse A. B. C. D. options
    const optionPattern = /([ABCD])\.\s*([^ABCD]*?)(?=[ABCD]\.|$)/g;
    let match;
    while ((match = optionPattern.exec(cleanOptions)) !== null) {
      const [, letter, text] = match;
      options[letter] = text.trim();
    }
  }
  
  return options;
}

// Function to process CSV content and return question bank array
function processCSVContent(csvContent) {
  const questionBankArray = [];

  // Split by lines but handle multi-line quoted fields
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
      if (currentRow.trim()) {
        rows.push(currentRow.trim());
      }
      currentRow = '';
    } else {
      currentRow += char;
    }
  }

  // Add the last row if it exists
  if (currentRow.trim()) {
    rows.push(currentRow.trim());
  }

  console.log(`Found ${rows.length} rows`);

  // Process each row (skip header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.trim() === '') continue;
    
    // Parse CSV row with quoted fields
    const fields = [];
    let currentField = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let j = 0; j < row.length; j++) {
      const char = row[j];
      
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
        continue;
      }
      
      if (!(char === '"' || char === "'") || inQuotes) {
        currentField += char;
      }
    }
    
    // Add the last field
    fields.push(currentField.trim());
    
    if (fields.length >= 4) {
      const [type, question, options, answer] = fields;
      
      // Clean and validate data
      const cleanType = type.trim();
      const cleanQuestion = question.trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      const cleanOptions = options.trim();
      const cleanAnswer = answer.trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/\n/g, '') // Remove newlines
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      // Skip if essential fields are missing
      if (!cleanType || !cleanQuestion || cleanType === '' || cleanQuestion === '') {
        continue;
      }
      
      const translatedType = translateQuestionType(cleanType);
      const parsedOptions = parseOptions(cleanOptions, translatedType);
      
      // Only add if we have valid data
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

  console.log('CSV content successfully processed');
  console.log(`Total questions loaded: ${questionBankArray.length}`);
  
  return questionBankArray;
}

// Function to load questions from CSV file
async function loadQuestionsFromCSV() {
  try {
    console.log('Starting to load questions from CSV...');
    const response = await fetch('question_bank.csv');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log('CSV file fetched successfully');
    const csvContent = await response.text();
    console.log(`CSV content length: ${csvContent.length} characters`);
    const questions = processCSVContent(csvContent);
    console.log(`Processed ${questions.length} questions from CSV`);
    return questions;
  } catch (error) {
    console.error('Error loading CSV file:', error);
    return [];
  }
}
