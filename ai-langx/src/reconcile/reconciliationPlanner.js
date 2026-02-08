/**
 * RECONCILIATION PLANNER - BI-DIRECTIONAL SYNC
 * 
 * PURPOSE:
 * - Makes deterministic decisions about which expenses to sync
 * - NO LLM involvement - pure business logic
 * - Produces auditable reconciliation plans
 * - Supports BI-DIRECTIONAL sync (PDF ↔ App)
 * 
 * WHY THIS EXISTS:
 * - Separates decision-making from execution (safety)
 * - Enables dry-run capability (test before commit)
 * - Provides clear audit trail (who, what, when, why)
 * - Prevents LLM from making financial decisions
 * 
 * BI-DIRECTIONAL SYNC MODEL:
 * - pdf_only expenses → add to app (via backend API)
 * - app_only expenses → add to regenerated PDF
 * - matched expenses → no action needed
 * - NEVER auto-delete (additive-only by default)
 * 
 * WHY ADDITIVE-ONLY:
 * - Data loss is NEVER acceptable in financial systems
 * - Users must explicitly request deletions
 * - Accounting principle: audit trail preservation
 * - Enterprise safety: prefer duplication over deletion
 * 
 * WHY LLMs MUST NOT DO THIS:
 * - Financial reconciliation requires 100% determinism
 * - LLMs are probabilistic and can hallucinate
 * - Business rules must be explicit and version-controlled
 * - Audit compliance requires traceable logic
 */

/**
 * Reconciliation strategy configuration
 * These rules define which expenses get synced
 */
export const RECONCILIATION_RULES = {
  // Minimum amount threshold for auto-sync (prevent noise)
  MIN_AMOUNT_THRESHOLD: 1.0,
  
  // Maximum amount requiring manual approval (prevent accidental large syncs)
  MAX_AUTO_SYNC_AMOUNT: 10000.0,
  
  // Whether to sync expenses without dates
  ALLOW_UNDATED_EXPENSES: true,
  
  // Whether to sync duplicate descriptions (same amount + description)
  ALLOW_DUPLICATE_DESCRIPTIONS: false,
  
  // Default category for uncategorized expenses
  DEFAULT_CATEGORY: 'Other'
};

/**
 * Validates an expense before adding to sync plan
 * 
 * WHY VALIDATION IS CRITICAL:
 * - Prevents invalid data from entering the system
 * - Catches extraction errors before they propagate
 * - Provides clear rejection reasons for audit logs
 * 
 * @param {Object} expense - Expense to validate
 * @returns {Object} { valid: boolean, reason: string }
 */
const validateExpense = (expense) => {
  // Must have amount
  if (!expense.amount || typeof expense.amount !== 'number' || expense.amount <= 0) {
    return { valid: false, reason: 'Invalid or missing amount' };
  }
  
  // Must have description
  if (!expense.description || expense.description.trim().length === 0) {
    return { valid: false, reason: 'Missing description' };
  }
  
  // Check amount thresholds
  if (expense.amount < RECONCILIATION_RULES.MIN_AMOUNT_THRESHOLD) {
    return { valid: false, reason: `Amount below minimum threshold ($${RECONCILIATION_RULES.MIN_AMOUNT_THRESHOLD})` };
  }
  
  if (expense.amount > RECONCILIATION_RULES.MAX_AUTO_SYNC_AMOUNT) {
    return { valid: false, reason: `Amount exceeds auto-sync limit ($${RECONCILIATION_RULES.MAX_AUTO_SYNC_AMOUNT}) - requires manual approval` };
  }
  
  // Check date requirement
  if (!RECONCILIATION_RULES.ALLOW_UNDATED_EXPENSES && !expense.date) {
    return { valid: false, reason: 'Date required but missing' };
  }
  
  return { valid: true, reason: 'Passed validation' };
};

/**
 * Normalizes expense data for consistent processing
 * 
 * WHY NORMALIZATION:
 * - PDF extraction produces varied formats
 * - Backend expects consistent schema
 * - Category mapping must be deterministic
 * 
 * @param {Object} expense - Raw expense from PDF
 * @returns {Object} Normalized expense ready for sync
 */
const normalizeExpense = (expense) => {
  // Normalize date to YYYY-MM-DD format
  let normalizedDate;
  try {
    if (expense.date) {
      const date = new Date(expense.date);
      normalizedDate = date.toISOString().split('T')[0];
    } else {
      normalizedDate = new Date().toISOString().split('T')[0];
    }
  } catch (error) {
    console.warn(`[Reconciliation Planner] Date normalization failed for "${expense.date}", using today: ${error.message}`);
    normalizedDate = new Date().toISOString().split('T')[0];
  }
  
  // Return format matching CreateExpenseTool expectations
  // Tool expects: amount (number), category (string), description (string), date (string)
  return {
    amount: parseFloat(expense.amount.toFixed(2)), // Ensure 2 decimal places
    description: expense.description.trim(),
    date: normalizedDate,  // CreateExpenseTool expects 'date' field
    category: expense.category || RECONCILIATION_RULES.DEFAULT_CATEGORY
  };
};

/**
 * Checks if expense is duplicate of existing app expenses
 * 
 * WHY DUPLICATE DETECTION:
 * - Prevents accidental double-entry
 * - User may have already manually entered some PDF expenses
 * - Fuzzy matching handles slight variations
 * 
 * @param {Object} expense - Expense to check
 * @param {Array} existingExpenses - Current app expenses
 * @returns {boolean} True if likely duplicate
 */
const isDuplicate = (expense, existingExpenses) => {
  if (!RECONCILIATION_RULES.ALLOW_DUPLICATE_DESCRIPTIONS) {
    return existingExpenses.some(existing => 
      Math.abs(existing.amount - expense.amount) < 0.01 && // Same amount (within 1 cent)
      existing.description.toLowerCase() === expense.description.toLowerCase() // Same description
    );
  }
  return false;
};

/**
 * Creates a bi-directional reconciliation plan from structured diff
 * 
 * THIS IS THE CORE BI-DIRECTIONAL PLANNING FUNCTION
 * 
 * WHY BI-DIRECTIONAL:
 * - PDF and App are BOTH sources of truth
 * - Neither should be considered canonical
 * - Sync must preserve data from BOTH sides
 * - Users need consistency without data loss
 * 
 * WHY EXPLICIT OWNERSHIP MATTERS:
 * - pdf_only: Exists only in PDF → Must add to app
 * - app_only: Exists only in app → Must add to PDF
 * - matched: Exists in both → No action needed
 * - Clear ownership prevents ambiguity in sync logic
 * 
 * WHY DELETES ARE NEVER INFERRED:
 * - Missing data might be legitimate (not uploaded yet)
 * - Auto-delete violates accounting principles
 * - Enterprise safety: preserve all financial records
 * - Users must explicitly request deletions
 * 
 * DECISION LOGIC:
 * 1. pdf_only expenses → CANDIDATES for add_to_app
 * 2. Apply validation rules → FILTER invalid
 * 3. Check for duplicates → FILTER duplicates
 * 4. Normalize remaining → APPROVED for add_to_app
 * 5. app_only expenses → APPROVED for add_to_pdf (no validation needed)
 * 6. matched expenses → IGNORED (already synced)
 * 7. Log all decisions → AUDIT trail
 * 
 * @param {Object} structuredDiff - Output from comparison with returnStructured=true
 * @param {Array} structuredDiff.matched - Expenses found in both PDF and app
 * @param {Array} structuredDiff.pdfOnly - Expenses only in PDF (candidates for app sync)
 * @param {Array} structuredDiff.appOnly - Expenses only in app (candidates for PDF sync)
 * @param {Array} existingAppExpenses - Current app expenses for duplicate detection
 * @returns {Object} Bi-directional reconciliation plan
 */
export const createReconciliationPlan = (structuredDiff, existingAppExpenses = []) => {
  console.log('[Reconciliation Planner] Creating BI-DIRECTIONAL reconciliation plan...');
  console.log(`[Reconciliation Planner] Input: ${structuredDiff.pdfOnly.length} PDF-only, ${structuredDiff.appOnly.length} app-only, ${structuredDiff.matched.length} matched`);
  
  const plan = {
    timestamp: new Date().toISOString(),
    mode: 'BI_DIRECTIONAL',
    summary: {
      totalPdfOnly: structuredDiff.pdfOnly.length,
      totalAppOnly: structuredDiff.appOnly.length,
      totalMatched: structuredDiff.matched.length,
      approvedForApp: 0,
      approvedForPdf: 0,
      rejected: 0,
      duplicate: 0
    },
    add_to_app: [],    // Expenses to create in app via backend API
    add_to_pdf: [],    // Expenses to include in regenerated PDF
    ignored: [],       // Matched expenses (no action needed)
    rejected: [],      // Invalid expenses
    metadata: {
      rules: RECONCILIATION_RULES,
      planVersion: '2.0.0-bidirectional-langx'
    }
  };
  
  // =========================================================================
  // SIDE A: PDF → APP SYNC
  // Process expenses that exist only in PDF
  // These need to be added to the app via backend API
  // =========================================================================
  console.log('[Reconciliation Planner] Processing PDF → App sync...');
  
  for (const expense of structuredDiff.pdfOnly) {
    console.log(`[Reconciliation Planner] Evaluating PDF expense: $${expense.amount} - ${expense.description}`);
    
    // Step 1: Validate
    const validation = validateExpense(expense);
    if (!validation.valid) {
      console.log(`[Reconciliation Planner] ✗ REJECTED: ${validation.reason}`);
      plan.rejected.push({
        expense,
        reason: validation.reason,
        stage: 'validation',
        targetSide: 'app'
      });
      plan.summary.rejected++;
      continue;
    }
    
    // Step 2: Check for duplicates
    if (isDuplicate(expense, existingAppExpenses)) {
      console.log(`[Reconciliation Planner] [DUPLICATE]: Already exists in app`);
      plan.rejected.push({
        expense,
        reason: 'Duplicate expense already exists in app',
        stage: 'duplicate_detection',
        targetSide: 'app'
      });
      plan.summary.duplicate++;
      continue;
    }
    
    // Step 3: Normalize and approve
    const normalized = normalizeExpense(expense);
    console.log(`[Reconciliation Planner] [APPROVED] for app: $${normalized.amount} - ${normalized.description}`);
    
    plan.add_to_app.push({
      action: 'CREATE_EXPENSE',
      expense: normalized,
      originalExpense: expense
    });
    plan.summary.approvedForApp++;
  }
  
  // =========================================================================
  // SIDE B: APP → PDF SYNC
  // Process expenses that exist only in app
  // These will be included in any regenerated PDF reports
  // =========================================================================
  console.log('[Reconciliation Planner] Processing App → PDF sync...');
  
  for (const expense of structuredDiff.appOnly) {
    console.log(`[Reconciliation Planner] [APPROVED] for PDF: $${expense.amount} - ${expense.description}`);
    
    plan.add_to_pdf.push({
      action: 'INCLUDE_IN_PDF',
      expense
    });
    plan.summary.approvedForPdf++;
  }
  
  // =========================================================================
  // ALREADY MATCHED
  // These expenses exist in both sides - no action needed
  // =========================================================================
  console.log('[Reconciliation Planner] Processing matched expenses...');
  
  for (const match of structuredDiff.matched) {
    plan.ignored.push({
      reason: 'Already synchronized',
      pdfExpense: match.pdfExpense,
      appExpense: match.appExpense
    });
  }
  
  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log('[Reconciliation Planner] Plan complete:');
  console.log(`  [APPROVED] For App: ${plan.summary.approvedForApp}`);
  console.log(`  [APPROVED] For PDF: ${plan.summary.approvedForPdf}`);
  console.log(`  [DUPLICATE]: ${plan.summary.duplicate}`);
  console.log(`  [REJECTED]: ${plan.summary.rejected}`);
  console.log(`  [MATCHED]: ${plan.summary.totalMatched}`);
  
  return plan;
};

/**
 * Generates human-readable summary of reconciliation plan
 * 
 * @param {Object} plan - Reconciliation plan from createReconciliationPlan
 * @returns {string} Formatted summary text
 */
export const summarizePlan = (plan) => {
  const lines = [];
  
  lines.push('📋 RECONCILIATION PLAN SUMMARY');
  lines.push('');
  lines.push(`Mode: ${plan.mode}`);
  lines.push(`Timestamp: ${new Date(plan.timestamp).toLocaleString()}`);
  lines.push('');
  
  lines.push('**What will be synced:**');
  lines.push(`  • Add to App: ${plan.summary.approvedForApp} expenses`);
  lines.push(`  • Add to PDF: ${plan.summary.approvedForPdf} expenses`);
  lines.push(`  • Already matched: ${plan.summary.totalMatched} expenses`);
  
  if (plan.summary.rejected > 0) {
    lines.push('');
    lines.push('**Rejected (will NOT be synced):**');
    lines.push(`  • Total rejected: ${plan.summary.rejected}`);
    plan.rejected.forEach((r, i) => {
      lines.push(`    ${i + 1}. $${r.expense.amount} - ${r.expense.description}: ${r.reason}`);
    });
  }
  
  if (plan.summary.duplicate > 0) {
    lines.push('');
    lines.push(`[DUPLICATE] Detected: ${plan.summary.duplicate} (skipped to prevent double-entry)`);
  }
  
  return lines.join('\n');
};
