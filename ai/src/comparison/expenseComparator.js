/**
 * EXPENSE COMPARATOR (Code-based Diff Engine)
 * 
 * Purpose:
 * - Compares PDF-extracted expenses with app-tracked expenses
 * - Performs COMPUTATIONAL comparison (NOT in LLM)
 * - Identifies matches, discrepancies, and missing entries
 * 
 * Why it exists:
 * - Provides deterministic expense reconciliation
 * - Enables data verification workflows
 * - Separates computation from interpretation
 * 
 * Architecture fit:
 * - Used by RAG Compare handler
 * - LLM only explains the computed results
 * - Pure JavaScript logic for accuracy and auditability
 * 
 * Comparison Logic:
 * 1. Normalize expenses (date formats, amounts)
 * 2. Match by amount + date + category/description similarity
 * 3. Classify into: matched, pdfOnly, appOnly, ambiguous
 * 4. Generate structured diff report
 */

/**
 * Normalizes date to YYYY-MM-DD format
 * @param {string|Date} date - Date in various formats
 * @returns {string|null} Normalized date or null
 */
const normalizeDate = (date) => {
  if (!date) return null;
  
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
};

/**
 * Normalizes expense object for comparison
 * @param {Object} expense - Raw expense object
 * @param {string} source - 'pdf' or 'app'
 * @returns {Object} Normalized expense
 */
const normalizeExpense = (expense, source) => {
  return {
    id: expense.id || null,
    amount: parseFloat(expense.amount) || 0,
    date: normalizeDate(expense.date || expense.expense_date),
    description: (expense.description || expense.category_name || '').toLowerCase().trim(),
    category: (expense.category || expense.category_name || 'other').toLowerCase(),
    source,
    original: expense
  };
};

/**
 * Computes similarity score between two descriptions
 * Uses Jaccard similarity on word tokens
 * @param {string} desc1 - First description
 * @param {string} desc2 - Second description
 * @returns {number} Similarity score 0-1
 */
const descriptionSimilarity = (desc1, desc2) => {
  const tokens1 = new Set(desc1.split(/\s+/).filter(t => t.length > 2));
  const tokens2 = new Set(desc2.split(/\s+/).filter(t => t.length > 2));
  
  if (tokens1.size === 0 && tokens2.size === 0) return 1;
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
};

/**
 * Checks if two expenses match
 * @param {Object} exp1 - First expense (normalized)
 * @param {Object} exp2 - Second expense (normalized)
 * @param {Object} options - Matching options
 * @returns {Object} { isMatch: boolean, confidence: number, reason: string }
 */
const matchExpenses = (exp1, exp2, options = {}) => {
  const {
    amountTolerance = 0.01, // Allow 1 rupee difference
    requireSameDate = true,
    minDescriptionSimilarity = 0.5
  } = options;
  
  // Amount must be close
  const amountDiff = Math.abs(exp1.amount - exp2.amount);
  if (amountDiff > amountTolerance) {
    return { isMatch: false, confidence: 0, reason: 'Amount mismatch' };
  }
  
  // Date should match if required
  if (requireSameDate && exp1.date && exp2.date && exp1.date !== exp2.date) {
    return { isMatch: false, confidence: 0, reason: 'Date mismatch' };
  }
  
  // Description/category similarity
  const descSim = descriptionSimilarity(
    exp1.description + ' ' + exp1.category,
    exp2.description + ' ' + exp2.category
  );
  
  if (descSim < minDescriptionSimilarity) {
    return { isMatch: false, confidence: 0, reason: 'Description mismatch' };
  }
  
  // Calculate confidence
  const confidence = (descSim + (amountDiff === 0 ? 1 : 0.9)) / 2;
  
  return {
    isMatch: true,
    confidence,
    reason: 'Match found',
    details: {
      amountDiff,
      descriptionSimilarity: descSim,
      sameDate: exp1.date === exp2.date
    }
  };
};

/**
 * Compares two lists of expenses
 * @param {Array} pdfExpenses - Expenses extracted from PDF
 * @param {Array} appExpenses - Expenses from app database
 * @param {Object} options - Comparison options
 * @returns {Object} Structured comparison result
 */
export const compareExpenses = (pdfExpenses, appExpenses, options = {}) => {
  console.log(`[Expense Comparator] Comparing ${pdfExpenses.length} PDF vs ${appExpenses.length} app expenses`);
  
  // Normalize both lists
  const normalizedPdf = pdfExpenses.map(e => normalizeExpense(e, 'pdf'));
  const normalizedApp = appExpenses.map(e => normalizeExpense(e, 'app'));
  
  const matched = [];
  const pdfOnly = [];
  const appOnly = [];
  const differences = [];
  
  const usedAppIndices = new Set();
  
  // Match PDF expenses with app expenses
  for (const pdfExp of normalizedPdf) {
    let bestMatch = null;
    let bestMatchIndex = -1;
    let bestConfidence = 0;
    
    for (let i = 0; i < normalizedApp.length; i++) {
      if (usedAppIndices.has(i)) continue;
      
      const matchResult = matchExpenses(pdfExp, normalizedApp[i], options);
      
      if (matchResult.isMatch && matchResult.confidence > bestConfidence) {
        bestMatch = matchResult;
        bestMatchIndex = i;
        bestConfidence = matchResult.confidence;
      }
    }
    
    if (bestMatch && bestMatchIndex !== -1) {
      matched.push({
        pdf: pdfExp.original,
        app: normalizedApp[bestMatchIndex].original,
        confidence: bestConfidence,
        details: bestMatch.details
      });
      usedAppIndices.add(bestMatchIndex);
    } else {
      pdfOnly.push(pdfExp.original);
      differences.push({
        type: 'missing_in_app',
        description: `₹${pdfExp.amount} for ${pdfExp.description} on ${pdfExp.date} found in PDF but not in app`
      });
    }
  }
  
  // Find app-only expenses
  for (let i = 0; i < normalizedApp.length; i++) {
    if (!usedAppIndices.has(i)) {
      appOnly.push(normalizedApp[i].original);
      differences.push({
        type: 'missing_in_pdf',
        description: `₹${normalizedApp[i].amount} for ${normalizedApp[i].description} on ${normalizedApp[i].date} found in app but not in PDF`
      });
    }
  }
  
  // Calculate totals
  const pdfTotal = {
    count: normalizedPdf.length,
    amount: normalizedPdf.reduce((sum, e) => sum + e.amount, 0)
  };
  
  const appTotal = {
    count: normalizedApp.length,
    amount: normalizedApp.reduce((sum, e) => sum + e.amount, 0)
  };
  
  console.log(`[Expense Comparator] Results: ${matched.length} matched, ${pdfOnly.length} PDF-only, ${appOnly.length} app-only`);
  
  return {
    summary: {
      pdfTotal,
      appTotal,
      matched: matched.length,
      pdfOnly: pdfOnly.length,
      appOnly: appOnly.length,
      totalDifferences: differences.length,
      matchRate: matched.length / Math.max(normalizedPdf.length, normalizedApp.length)
    },
    matched,
    pdfOnly,
    appOnly,
    differences,
    metadata: {
      comparedAt: new Date().toISOString(),
      options
    }
  };
};

/**
 * Finds potential duplicates within a single expense list
 * @param {Array} expenses - List of expenses
 * @returns {Array} Groups of potential duplicates
 */
export const findDuplicates = (expenses) => {
  const normalized = expenses.map((e, idx) => ({ ...normalizeExpense(e, 'unknown'), originalIndex: idx }));
  const duplicateGroups = [];
  const processed = new Set();
  
  for (let i = 0; i < normalized.length; i++) {
    if (processed.has(i)) continue;
    
    const group = [normalized[i]];
    
    for (let j = i + 1; j < normalized.length; j++) {
      if (processed.has(j)) continue;
      
      const matchResult = matchExpenses(normalized[i], normalized[j], {
        amountTolerance: 0,
        requireSameDate: true,
        minDescriptionSimilarity: 0.8
      });
      
      if (matchResult.isMatch) {
        group.push(normalized[j]);
        processed.add(j);
      }
    }
    
    if (group.length > 1) {
      duplicateGroups.push(group.map(e => e.original));
    }
    
    processed.add(i);
  }
  
  return duplicateGroups;
};

/**
 * Generates a summary report of comparison results
 * @param {Object} comparisonResult - Result from compareExpenses
 * @returns {string} Human-readable summary
 */
export const generateSummaryReport = (comparisonResult) => {
  const { summary, differences } = comparisonResult;
  
  const lines = [];
  lines.push('EXPENSE COMPARISON REPORT');
  lines.push('========================');
  lines.push('');
  lines.push(`PDF Expenses: ${summary.pdfTotal.count} items, ₹${summary.pdfTotal.amount.toFixed(2)}`);
  lines.push(`App Expenses: ${summary.appTotal.count} items, ₹${summary.appTotal.amount.toFixed(2)}`);
  lines.push(`Match Rate: ${(summary.matchRate * 100).toFixed(1)}%`);
  lines.push('');
  lines.push(`Matched: ${summary.matched}`);
  lines.push(`Only in PDF: ${summary.pdfOnly}`);
  lines.push(`Only in App: ${summary.appOnly}`);
  lines.push('');
  
  if (differences.length > 0) {
    lines.push('DIFFERENCES:');
    differences.slice(0, 10).forEach((diff, idx) => {
      lines.push(`${idx + 1}. ${diff.description}`);
    });
    
    if (differences.length > 10) {
      lines.push(`... and ${differences.length - 10} more`);
    }
  } else {
    lines.push('✓ Perfect match! All expenses accounted for.');
  }
  
  return lines.join('\n');
};
