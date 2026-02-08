/**
 * EXPENSE COMPARATOR - Deterministic Comparison Engine
 * 
 * PURPOSE:
 * - Compare PDF-extracted expenses with app expenses
 * - Perform COMPUTATIONAL comparison (NOT in LLM)
 * - Identify matches, discrepancies, and missing entries
 * 
 * WHY SEPARATE FROM LLM:
 * - Deterministic: Same inputs = same outputs
 * - Auditable: Every match decision is traceable
 * - Accurate: No LLM hallucinations in financial data
 * - Fast: No API calls for computation
 * 
 * ARCHITECTURE:
 * - Pure JavaScript comparison logic
 * - LLM only used for natural language explanation
 * - Used by RAG compare handler
 * 
 * COMPARISON ALGORITHM:
 * 1. Normalize expenses (dates, amounts, descriptions)
 * 2. Match by amount + date + description similarity
 * 3. Classify: matched, pdfOnly, appOnly
 * 4. Return structured diff
 * 
 * COMPARE WITH: ai/src/comparison/expenseComparator.js (identical logic)
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
 * 
 * WHY NORMALIZE:
 * - PDF and app have different field names
 * - Dates may be in different formats
 * - Makes comparison logic uniform
 * 
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
 * 
 * WHY JACCARD:
 * - Simple and effective for short text
 * - Range 0-1 easy to interpret
 * - No ML model needed
 * 
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
 * 
 * MATCHING CRITERIA:
 * - Amount within tolerance (1 rupee)
 * - Same date (if required)
 * - Description/category similarity above threshold
 * 
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
 * 
 * ALGORITHM:
 * 1. Normalize both lists
 * 2. For each PDF expense, find best match in app
 * 3. Track used matches to avoid duplicates
 * 4. Classify remaining as pdfOnly or appOnly
 * 5. Generate difference descriptions
 * 
 * WHY NOT IN LLM:
 * - Deterministic results
 * - No token cost
 * - Faster execution
 * - Auditable logic
 * 
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
  
  // Calculate summary statistics
  const pdfTotal = normalizedPdf.reduce((sum, e) => sum + e.amount, 0);
  const appTotal = normalizedApp.reduce((sum, e) => sum + e.amount, 0);
  const matchedTotal = matched.reduce((sum, m) => sum + m.pdf.amount, 0);
  
  const result = {
    matched,
    pdfOnly,
    appOnly,
    differences,
    summary: {
      pdfTotal: {
        count: normalizedPdf.length,
        amount: Math.round(pdfTotal * 100) / 100
      },
      appTotal: {
        count: normalizedApp.length,
        amount: Math.round(appTotal * 100) / 100
      },
      matchedTotal: {
        count: matched.length,
        amount: Math.round(matchedTotal * 100) / 100
      },
      discrepancyAmount: Math.round((pdfTotal - appTotal) * 100) / 100
    }
  };
  
  console.log('[Expense Comparator] Comparison complete:', {
    matched: result.matched.length,
    pdfOnly: result.pdfOnly.length,
    appOnly: result.appOnly.length,
    differences: result.differences.length
  });
  
  return result;
};

/**
 * Generates summary report from comparison result
 * Used for display purposes
 * 
 * @param {Object} comparisonResult - Result from compareExpenses
 * @returns {string} Human-readable summary
 */
export const generateSummaryReport = (comparisonResult) => {
  const { summary, matched, pdfOnly, appOnly } = comparisonResult;
  
  let report = `📊 Expense Comparison Summary\n\n`;
  report += `PDF Expenses: ${summary.pdfTotal.count} items, ₹${summary.pdfTotal.amount}\n`;
  report += `App Expenses: ${summary.appTotal.count} items, ₹${summary.appTotal.amount}\n`;
  report += `Matched: ${summary.matchedTotal.count} items, ₹${summary.matchedTotal.amount}\n\n`;
  
  if (pdfOnly.length > 0) {
    report += `⚠️  Only in PDF (${pdfOnly.length}):\n`;
    pdfOnly.forEach(e => {
      report += `  - ₹${e.amount} ${e.description} (${e.date})\n`;
    });
    report += '\n';
  }
  
  if (appOnly.length > 0) {
    report += `⚠️  Only in App (${appOnly.length}):\n`;
    appOnly.forEach(e => {
      report += `  - ₹${e.amount} ${e.description || e.category_name} (${e.date || e.expense_date})\n`;
    });
  }
  
  if (pdfOnly.length === 0 && appOnly.length === 0) {
    report += `✅ Perfect match! All expenses are reconciled.`;
  }
  
  return report;
};
